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

// Gemini API endpoint that accepts OAuth (Cloud Code Assist endpoint)
export const GEMINI_OAUTH_API_BASE = 'https://cloudcode-pa.googleapis.com'

// Code Assist API for managed project resolution
const CODE_ASSIST_URL = 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist'

// Headers required by Code Assist API (from opencode-gemini-auth)
const CODE_ASSIST_HEADERS = {
  'User-Agent': 'google-api-nodejs-client/9.15.1',
  'X-Goog-Api-Client': 'gl-node/22.17.0',
  'Client-Metadata': 'ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI',
}

// Default location for Gemini API
const DEFAULT_LOCATION = 'us-central1'

// Scopes required for Gemini API access via cloudcode-pa endpoint
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
 * Load Code Assist to get managed project
 * This is how opencode-gemini-auth resolves the project
 */
async function loadCodeAssist(accessToken: string, existingProjectId?: string): Promise<{ cloudaicompanionProject?: string }> {
  const body: Record<string, unknown> = {
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
    },
  }

  if (existingProjectId) {
    body.cloudaicompanionProject = existingProjectId
  }

  const response = await fetch(CODE_ASSIST_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...CODE_ASSIST_HEADERS,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('[Gemini] loadCodeAssist failed:', response.status, text)
    throw new Error(`loadCodeAssist failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Normalize project ID from response
 */
function normalizeProjectId(projectId: string | undefined): string | undefined {
  if (!projectId) return undefined
  // Handle formats like "projects/123456" -> "123456"
  if (projectId.startsWith('projects/')) {
    return projectId.replace('projects/', '')
  }
  return projectId
}

/**
 * Onboard user to get a managed project (for free tier)
 */
async function onboardUser(accessToken: string, maxAttempts = 10, delayMs = 5000): Promise<string> {
  console.log('[Gemini] Starting user onboarding...')

  const onboardUrl = `${GEMINI_OAUTH_API_BASE}/v1internal:onboardUser`

  const body = {
    tierId: 'free-tier',
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
    },
  }

  const response = await fetch(onboardUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...CODE_ASSIST_HEADERS,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('[Gemini] onboardUser failed:', response.status, text)
    throw new Error(`Onboarding failed: ${response.status}`)
  }

  const operation = await response.json()
  console.log('[Gemini] Onboard operation started:', operation)

  // Poll for operation completion
  if (operation.name) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs))

      const pollUrl = `${GEMINI_OAUTH_API_BASE}/v1internal/${operation.name}`
      const pollResponse = await fetch(pollUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...CODE_ASSIST_HEADERS,
        },
      })

      if (pollResponse.ok) {
        const pollResult = await pollResponse.json()
        console.log('[Gemini] Poll result:', pollResult)

        if (pollResult.done) {
          const projectId = normalizeProjectId(
            pollResult.response?.cloudaicompanionProject ||
            pollResult.cloudaicompanionProject
          )
          if (projectId) {
            console.log('[Gemini] Onboarding complete, project:', projectId)
            return projectId
          }
        }
      }

      console.log('[Gemini] Onboarding in progress, attempt', attempt + 1)
    }
  }

  throw new Error('Onboarding timed out')
}

/**
 * Resolve or auto-provision a managed Google Cloud project for Gemini API access
 * This is the same API that opencode-gemini-auth uses
 */
export async function resolveManagedProject(accessToken: string): Promise<string> {
  console.log('[Gemini] Resolving managed project via Code Assist API...')

  // First call to loadCodeAssist to get current state
  const result = await loadCodeAssist(accessToken)
  console.log('[Gemini] loadCodeAssist response:', result)

  let projectId = normalizeProjectId(result.cloudaicompanionProject)

  if (projectId) {
    console.log('[Gemini] Got project ID from initial load:', projectId)
    return projectId
  }

  // No project yet - need to onboard
  console.log('[Gemini] No project ID, starting onboarding...')
  projectId = await onboardUser(accessToken)

  return projectId
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
export function createGeminiAuth(tokens: GeminiTokenResponse, email?: string, projectId?: string): GeminiAuth {
  return {
    type: 'gemini-oauth',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    email,
    projectId,
  }
}

/**
 * Create custom fetch function for Gemini API
 * Handles OAuth headers, URL rewriting, and token refresh
 *
 * Transforms requests to use Vertex AI-style paths with cloudcode-pa.googleapis.com
 * Example: /v1beta/models/gemini-2.5-pro:streamGenerateContent
 *       -> /v1/projects/{project}/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent
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

    // Resolve project if not already done
    if (!auth.projectId) {
      console.log('[Gemini:Fetch] No project ID, resolving managed project...')
      try {
        const projectId = await resolveManagedProject(auth.accessToken)
        auth = { ...auth, projectId }
        await refreshAuth(auth)
      } catch (error) {
        console.error('[Gemini:Fetch] Failed to resolve project:', error)
        throw new Error('Failed to set up Gemini project. Please try logging in again.')
      }
    }

    // Build headers
    const headers = new Headers(init?.headers)

    // Remove any existing authorization/API keys (we'll set our own)
    headers.delete('authorization')
    headers.delete('Authorization')
    headers.delete('x-goog-api-key')
    headers.delete('x-api-key')

    // Set OAuth authorization
    headers.set('Authorization', `Bearer ${auth.accessToken}`)

    // Set headers similar to opencode-gemini-auth
    headers.set('x-goog-api-client', 'genai-js/0.9.0 gl-node/22.0.0')
    headers.set('User-Agent', 'Bouno/1.0')

    // Get and transform URL
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

    // Parse URL to manipulate it
    const parsedUrl = new URL(url)

    // Remove the API key query parameter that @ai-sdk/google adds
    parsedUrl.searchParams.delete('key')

    // Transform generativelanguage.googleapis.com to Vertex AI-style path on cloudcode-pa
    if (parsedUrl.hostname === 'generativelanguage.googleapis.com') {
      // Extract model and action from path like /v1beta/models/gemini-2.5-pro:streamGenerateContent
      const pathMatch = parsedUrl.pathname.match(/\/v\d+(?:beta)?\/models\/([^:]+):?(.*)/)

      if (pathMatch) {
        const [, model, action] = pathMatch
        // Build Vertex AI-style path
        const vertexPath = `/v1/projects/${auth.projectId}/locations/${DEFAULT_LOCATION}/publishers/google/models/${model}${action ? ':' + action : ''}`

        parsedUrl.hostname = 'cloudcode-pa.googleapis.com'
        parsedUrl.pathname = vertexPath

        console.log('[Gemini:Fetch] Transformed to Vertex AI path:', parsedUrl.pathname)
      } else {
        // Fallback: just change hostname
        parsedUrl.hostname = 'cloudcode-pa.googleapis.com'
        console.log('[Gemini:Fetch] Changed hostname only (no path match)')
      }
    }

    url = parsedUrl.toString()
    console.log('[Gemini:Fetch] Final URL:', url)

    const response = await fetch(url, {
      ...init,
      headers,
    })

    console.log('[Gemini:Fetch] Response:', response.status, response.statusText)

    return response
  }
}
