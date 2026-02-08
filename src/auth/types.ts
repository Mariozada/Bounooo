/**
 * OAuth authentication types
 * Based on OpenCode's implementation
 */

export interface CodexAuth {
  type: 'codex-oauth'
  accessToken: string
  refreshToken: string
  expiresAt: number  // Unix timestamp in milliseconds
  accountId?: string // ChatGPT account ID for team/org subscriptions
}

export interface GeminiAuth {
  type: 'gemini-oauth'
  accessToken: string
  refreshToken: string
  expiresAt: number  // Unix timestamp in milliseconds
  email?: string     // User's Google email
  projectId?: string // Google Cloud project ID for API access
}

export interface TokenResponse {
  id_token: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

export interface GeminiTokenResponse {
  access_token: string
  refresh_token: string
  expires_in?: number
  token_type?: string
  scope?: string
  id_token?: string
}

export interface IdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  email?: string
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string
  }
}

export interface PkceCodes {
  verifier: string
  challenge: string
}

/**
 * Device authorization response from OpenAI
 * Note: interval is a string, not number!
 */
export interface DeviceAuthResponse {
  device_auth_id: string
  user_code: string
  interval: string
  expires_in?: number
}

/**
 * Response from device token polling endpoint
 * This is NOT the final tokens - need to exchange for actual tokens
 */
export interface DeviceTokenPollResponse {
  authorization_code: string
  code_verifier: string
}
