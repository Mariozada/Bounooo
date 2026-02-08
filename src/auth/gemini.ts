/**
 * Gemini OAuth implementation for Bouno
 * Based on opencode-gemini-auth plugin
 *
 * Allows users to authenticate with their Google account
 * to use Gemini models through their existing subscription.
 *
 * Uses Authorization Code flow with PKCE via chrome.identity API.
 */

import type { GeminiTokenResponse, GeminiAuth, PkceCodes } from './types'

// OAuth Configuration (from opencode-gemini-auth)
export const GEMINI_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com'
export const GEMINI_CLIENT_SECRET = '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'

// Endpoints
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

// Scopes required for Gemini API access
export const GEMINI_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

/**
 * Generate a random string for PKCE verifier
 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('')
}

/**
 * Base64 URL encode a buffer
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Generate PKCE code verifier and challenge
 */
export async function generateGeminiPKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateGeminiState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer)
}

/**
 * Build the Google OAuth authorization URL
 */
export function buildGeminiAuthUrl(redirectUri: string, pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: GEMINI_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: GEMINI_SCOPES,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',  // Required to get refresh token
    prompt: 'consent',       // Force consent to ensure refresh token
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGeminiCodeForTokens(
  code: string,
  redirectUri: string,
  pkce: PkceCodes
): Promise<GeminiTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: GEMINI_CLIENT_ID,
      client_secret: GEMINI_CLIENT_SECRET,
      code_verifier: pkce.verifier,
    }).toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini token exchange failed: ${response.status} - ${text}`)
  }

  return response.json()
}

/**
 * Refresh access token using refresh token
 */
export async function refreshGeminiAccessToken(refreshToken: string): Promise<GeminiTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GEMINI_CLIENT_ID,
      client_secret: GEMINI_CLIENT_SECRET,
    }).toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Gemini token refresh failed: ${response.status} - ${text}`)
  }

  return response.json()
}

/**
 * Get user info (email) from Google
 */
export async function getGeminiUserInfo(accessToken: string): Promise<{ email?: string }> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    console.warn('[Gemini] Failed to get user info:', response.status)
    return {}
  }

  const data = await response.json()
  return { email: data.email }
}

/**
 * Check if token is expired (with 60 second buffer)
 */
export function isGeminiTokenExpired(auth: GeminiAuth): boolean {
  const bufferMs = 60 * 1000 // 60 seconds
  return Date.now() >= auth.expiresAt - bufferMs
}

/**
 * Create GeminiAuth object from token response
 */
export function createGeminiAuth(tokens: GeminiTokenResponse, email?: string): GeminiAuth {
  return {
    type: 'gemini-oauth',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    email,
  }
}

/**
 * Create custom fetch function for Gemini API
 * Handles OAuth headers and token refresh
 */
export function createGeminiFetch(
  getAuth: () => Promise<GeminiAuth | undefined>,
  refreshAuth: (newAuth: GeminiAuth) => Promise<void>
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let auth = await getAuth()
    if (!auth) {
      throw new Error('Gemini authentication required')
    }

    // Refresh token if expired
    if (isGeminiTokenExpired(auth)) {
      console.log('[Gemini:Fetch] Refreshing access token...')
      try {
        const tokens = await refreshGeminiAccessToken(auth.refreshToken)
        auth = {
          ...auth,
          accessToken: tokens.access_token,
          expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
          // Keep existing refresh token if not returned
          refreshToken: tokens.refresh_token || auth.refreshToken,
        }
        await refreshAuth(auth)
      } catch (error) {
        console.error('[Gemini:Fetch] Token refresh failed:', error)
        throw new Error('Failed to refresh Gemini authentication. Please login again.')
      }
    }

    // Build headers
    const headers = new Headers(init?.headers)

    // Remove any existing authorization (we'll set our own)
    headers.delete('authorization')
    headers.delete('Authorization')
    headers.delete('x-goog-api-key')

    // Set Google authorization
    headers.set('Authorization', `Bearer ${auth.accessToken}`)

    // Set Google API client header
    headers.set('x-goog-api-client', 'bouno/1.0')

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    console.log('[Gemini:Fetch] Making request to:', url)

    const response = await fetch(url, {
      ...init,
      headers,
    })

    console.log('[Gemini:Fetch] Response:', response.status, response.statusText)

    return response
  }
}
