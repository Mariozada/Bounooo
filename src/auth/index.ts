/**
 * Auth module exports
 */

export type { CodexAuth, TokenResponse, IdTokenClaims, PkceCodes, DeviceAuthResponse, DeviceTokenPollResponse, GeminiAuth, GeminiTokenResponse } from './types'

export {
  // Constants
  CLIENT_ID,
  ISSUER,
  CODEX_API_ENDPOINT,
  CODEX_MODELS,
  DEVICE_AUTH_URL,
  DEVICE_TOKEN_URL,
  DEVICE_VERIFICATION_URL,
  // PKCE functions (kept for reference)
  generatePKCE,
  generateState,
  // OAuth functions
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  // Device flow functions
  requestDeviceCode,
  pollForDeviceToken,
  // JWT helpers
  parseJwtClaims,
  extractAccountIdFromClaims,
  extractAccountId,
  // Auth helpers
  isTokenExpired,
  createCodexAuth,
  createCodexFetch,
} from './codex'

// Gemini OAuth exports
export {
  // Constants
  GEMINI_CLIENT_ID,
  GEMINI_CLIENT_SECRET,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GEMINI_SCOPES,
  // PKCE functions
  generateGeminiPKCE,
  generateGeminiState,
  // OAuth functions
  buildGeminiAuthUrl,
  exchangeGeminiCodeForTokens,
  refreshGeminiAccessToken,
  getGeminiUserInfo,
  // Auth helpers
  isGeminiTokenExpired,
  createGeminiAuth,
  createGeminiFetch,
} from './gemini'
