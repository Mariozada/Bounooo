/**
 * Codex OAuth implementation for Bouno
 * Ported from OpenCode's plugin/codex.ts
 *
 * Allows users to authenticate with their ChatGPT Pro/Plus subscription
 * instead of using an API key.
 *
 * Uses Device Authorization Grant flow (RFC 8628) which doesn't require
 * a pre-registered redirect URI.
 */

import type { TokenResponse, IdTokenClaims, CodexAuth, PkceCodes, DeviceAuthResponse, DeviceTokenPollResponse } from './types'

// OAuth Configuration (same as OpenCode)
export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const ISSUER = 'https://auth.openai.com'
export const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses'

// Device flow endpoints
export const DEVICE_AUTH_URL = `${ISSUER}/api/accounts/deviceauth/usercode`
export const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`
export const DEVICE_VERIFICATION_URL = 'https://auth.openai.com/codex/device'

// Safety margin for polling to avoid rate limiting (matches OpenCode)
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

// Allowed Codex models
export const CODEX_MODELS = new Set([
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.1-codex',
])

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
export async function generatePKCE(): Promise<PkceCodes> {
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
export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer)
}

/**
 * Build the OAuth authorization URL
 */
export function buildAuthorizeUrl(redirectUri: string, pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'bouno',
  })
  return `${ISSUER}/oauth/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  pkce: PkceCodes
): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${response.status} - ${text}`)
  }

  return response.json()
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token refresh failed: ${response.status} - ${text}`)
  }

  return response.json()
}

// ─── Device Authorization Grant Flow ────────────────────────────────────────

// Re-export DeviceAuthResponse for backwards compatibility
export type { DeviceAuthResponse } from './types'

/**
 * Request a device code for the user to authorize
 * Returns device_auth_id and user_code for the polling step
 */
export async function requestDeviceCode(): Promise<DeviceAuthResponse> {
  const response = await fetch(DEVICE_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Bouno/1.0',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Device code request failed: ${response.status} - ${text}`)
  }

  return response.json()
}

/**
 * Poll for device authorization completion
 *
 * OpenAI's device flow works in two steps:
 * 1. Poll /deviceauth/token until we get authorization_code + code_verifier
 * 2. Exchange those for actual tokens via /oauth/token
 *
 * @param deviceAuthId - The device_auth_id from requestDeviceCode
 * @param userCode - The user_code from requestDeviceCode
 * @param interval - Polling interval in seconds (string from API)
 * @param expiresIn - Expiration time in seconds
 * @param onPoll - Optional callback called before each poll (can throw to abort)
 */
export async function pollForDeviceToken(
  deviceAuthId: string,
  userCode: string,
  interval: number,
  expiresIn: number,
  onPoll?: () => void
): Promise<TokenResponse> {
  const startTime = Date.now()
  const expiresAt = startTime + expiresIn * 1000
  let pollInterval = Math.max(interval, 1) * 1000 // Ensure minimum 1 second

  while (Date.now() < expiresAt) {
    // Wait for the interval plus safety margin
    await new Promise((resolve) => setTimeout(resolve, pollInterval + OAUTH_POLLING_SAFETY_MARGIN_MS))

    // Call onPoll - it can throw to abort polling
    onPoll?.()

    const response = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Bouno/1.0',
      },
      body: JSON.stringify({
        device_auth_id: deviceAuthId,
        user_code: userCode,
      }),
    })

    if (response.ok) {
      // Got authorization_code and code_verifier - now exchange for tokens
      const pollData: DeviceTokenPollResponse = await response.json()

      // Exchange authorization code for actual tokens
      const tokenResponse = await fetch(`${ISSUER}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: pollData.authorization_code,
          redirect_uri: `${ISSUER}/deviceauth/callback`,
          client_id: CLIENT_ID,
          code_verifier: pollData.code_verifier,
        }).toString(),
      })

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${tokenResponse.status} - ${text}`)
      }

      return tokenResponse.json()
    }

    // Handle error responses
    if (response.status === 403 || response.status === 404) {
      // Authorization pending - continue polling
      continue
    }

    const data = await response.json().catch(() => ({}))

    if (data.error === 'authorization_pending') {
      continue
    }

    if (data.error === 'slow_down') {
      // Increase polling interval by 5 seconds as per RFC 8628
      pollInterval += 5000
      continue
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.')
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization was denied by the user.')
    }

    // Unknown error
    throw new Error(data.error_description || data.error || 'Unknown error during device authorization')
  }

  throw new Error('Device code expired. Please try again.')
}

/**
 * Parse JWT claims from token
 */
export function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined

  try {
    // Decode base64url to base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const decoded = atob(padded)
    return JSON.parse(decoded)
  } catch {
    return undefined
  }
}

/**
 * Extract account ID from JWT claims
 */
export function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims['https://api.openai.com/auth']?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  )
}

/**
 * Extract account ID from token response
 */
export function extractAccountId(tokens: TokenResponse): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    const accountId = claims && extractAccountIdFromClaims(claims)
    if (accountId) return accountId
  }

  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token)
    return claims ? extractAccountIdFromClaims(claims) : undefined
  }

  return undefined
}

/**
 * Check if token is expired (with 5 minute buffer)
 */
export function isTokenExpired(auth: CodexAuth): boolean {
  const bufferMs = 5 * 60 * 1000 // 5 minutes
  return Date.now() >= auth.expiresAt - bufferMs
}

/**
 * Create CodexAuth object from token response
 */
export function createCodexAuth(tokens: TokenResponse): CodexAuth {
  return {
    type: 'codex-oauth',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    accountId: extractAccountId(tokens),
  }
}

/**
 * Create custom fetch function for Codex API
 * Handles OAuth headers and URL rewriting
 */
export function createCodexFetch(
  getAuth: () => Promise<CodexAuth | undefined>,
  refreshAuth: (newAuth: CodexAuth) => Promise<void>
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let auth = await getAuth()
    if (!auth) {
      throw new Error('Codex authentication required')
    }

    // Refresh token if expired
    if (isTokenExpired(auth)) {
      console.log('[Codex:Fetch] Refreshing access token...')
      try {
        const tokens = await refreshAccessToken(auth.refreshToken)
        auth = createCodexAuth(tokens)
        // Preserve existing accountId if new token doesn't have one
        if (!auth.accountId && (await getAuth())?.accountId) {
          auth.accountId = (await getAuth())?.accountId
        }
        await refreshAuth(auth)
      } catch (error) {
        console.error('[Codex:Fetch] Token refresh failed:', error)
        throw new Error('Failed to refresh Codex authentication. Please login again.')
      }
    }

    // Build headers
    const headers = new Headers(init?.headers)

    // Remove any existing authorization (we'll set our own)
    headers.delete('authorization')
    headers.delete('Authorization')

    // Set Codex authorization
    headers.set('Authorization', `Bearer ${auth.accessToken}`)

    // Set account ID header for team subscriptions
    if (auth.accountId) {
      headers.set('ChatGPT-Account-Id', auth.accountId)
    }

    // Set originator and user agent headers
    headers.set('originator', 'bouno')
    headers.set('User-Agent', 'Bouno/1.0')

    // Rewrite URL to Codex endpoint
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const parsed = new URL(url)

    // Rewrite standard OpenAI endpoints to Codex
    let finalUrl = url
    if (parsed.pathname.includes('/v1/responses') ||
        parsed.pathname.includes('/chat/completions') ||
        parsed.pathname.includes('/v1/chat/completions')) {
      finalUrl = CODEX_API_ENDPOINT
      console.log('[Codex:Fetch] URL rewritten to:', finalUrl)
    }

    console.log('[Codex:Fetch] Making request to:', finalUrl)
    console.log('[Codex:Fetch] Has accountId:', !!auth.accountId)

    // Modify request body to ensure instructions field exists (required by Codex API)
    // The AI SDK passes system prompt via the 'instructions' field for Responses API
    let modifiedInit = init
    if (init?.body && finalUrl === CODEX_API_ENDPOINT) {
      try {
        const body = JSON.parse(init.body as string)

        // Log what we received for debugging
        console.log('[Codex:Fetch] Request body keys:', Object.keys(body))
        console.log('[Codex:Fetch] Has instructions:', !!body.instructions)
        console.log('[Codex:Fetch] Instructions preview:', body.instructions?.slice?.(0, 100))

        // Codex requires store to be false
        body.store = false

        // If instructions exists, the AI SDK properly passed the system prompt
        if (body.instructions) {
          console.log('[Codex:Fetch] Using AI SDK provided instructions')
        } else {
          // Instructions missing - try to extract from system message in input array
          if (Array.isArray(body.input)) {
            const systemMsgIndex = body.input.findIndex(
              (msg: { role?: string }) => msg.role === 'system'
            )
            if (systemMsgIndex !== -1) {
              const systemMsg = body.input[systemMsgIndex]
              body.instructions = typeof systemMsg.content === 'string'
                ? systemMsg.content
                : Array.isArray(systemMsg.content)
                  ? systemMsg.content.map((c: { text?: string }) => c.text || '').join('\n')
                  : 'You are a helpful assistant.'
              // Remove system message from input
              body.input.splice(systemMsgIndex, 1)
              console.log('[Codex:Fetch] Moved system message to instructions, length:', body.instructions.length)
            } else {
              // No system message found, use default
              body.instructions = 'You are Bouno, a browser automation agent that helps users interact with web pages.'
              console.log('[Codex:Fetch] No system prompt found, using default')
            }
          } else {
            body.instructions = 'You are Bouno, a browser automation agent that helps users interact with web pages.'
            console.log('[Codex:Fetch] No input array, using default')
          }
        }

        modifiedInit = {
          ...init,
          body: JSON.stringify(body),
        }
      } catch (e) {
        console.warn('[Codex:Fetch] Could not parse request body:', e)
      }
    }

    const response = await fetch(finalUrl, {
      ...modifiedInit,
      headers,
    })

    console.log('[Codex:Fetch] Response:', response.status, response.statusText)

    return response
  }
}
