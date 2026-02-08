/**
 * Gemini OAuth background handlers
 * Uses Authorization Code flow with PKCE via chrome.identity API
 */

import {
  generateGeminiPKCE,
  generateGeminiState,
  buildGeminiAuthUrl,
  exchangeGeminiCodeForTokens,
  getGeminiUserInfo,
  createGeminiAuth,
} from '@auth/gemini'
import type { GeminiAuth } from '@auth/types'
import { loadSettings, saveSettings } from '@shared/settings'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Gemini:OAuth]', ...args)
const logError = (...args: unknown[]) => console.error('[Gemini:OAuth]', ...args)

export interface GeminiOAuthResult {
  success: boolean
  error?: string
}

/**
 * Start Gemini OAuth flow using chrome.identity.launchWebAuthFlow
 */
export async function startGeminiOAuth(): Promise<GeminiOAuthResult> {
  log('Starting Gemini OAuth flow...')

  try {
    // Generate PKCE codes
    const pkce = await generateGeminiPKCE()
    const state = generateGeminiState()

    // Get redirect URL from Chrome identity API
    const redirectUri = chrome.identity.getRedirectURL('gemini')
    log('Redirect URI:', redirectUri)

    // Build authorization URL
    const authUrl = buildGeminiAuthUrl(redirectUri, pkce, state)
    log('Auth URL:', authUrl)

    // Launch web auth flow
    const responseUrl = await launchAuthFlow(authUrl)
    log('Response URL:', responseUrl)

    // Parse response URL
    const url = new URL(responseUrl)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      throw new Error(`OAuth error: ${error}`)
    }

    if (!code) {
      throw new Error('No authorization code received')
    }

    if (returnedState !== state) {
      throw new Error('State mismatch - possible CSRF attack')
    }

    log('Authorization code received, exchanging for tokens...')

    // Exchange code for tokens
    const tokens = await exchangeGeminiCodeForTokens(code, redirectUri, pkce)
    log('Tokens received')

    // Get user info (email)
    const userInfo = await getGeminiUserInfo(tokens.access_token)
    log('User email:', userInfo.email)

    // Create GeminiAuth object
    const geminiAuth = createGeminiAuth(tokens, userInfo.email)
    log('GeminiAuth created')

    // Save to settings
    const settings = await loadSettings()
    settings.geminiAuth = geminiAuth
    await saveSettings(settings)

    log('OAuth flow completed successfully')

    // Notify any open side panels that auth is complete
    chrome.runtime.sendMessage({ type: 'GEMINI_AUTH_COMPLETE', success: true }).catch(() => {})

    return { success: true }

  } catch (error) {
    logError('OAuth flow failed:', error)

    chrome.runtime.sendMessage({
      type: 'GEMINI_AUTH_COMPLETE',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {})

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Launch Chrome identity web auth flow
 */
function launchAuthFlow(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true,
      },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!responseUrl) {
          reject(new Error('No response URL received'))
          return
        }
        resolve(responseUrl)
      }
    )
  })
}

/**
 * Logout from Gemini (clear tokens)
 */
export async function logoutGemini(): Promise<{ success: boolean }> {
  log('Logging out...')

  try {
    const settings = await loadSettings()
    delete settings.geminiAuth
    await saveSettings(settings)

    log('Logout successful')
    return { success: true }
  } catch (error) {
    logError('Logout failed:', error)
    return { success: false }
  }
}

/**
 * Get current Gemini auth status
 */
export async function getGeminiAuth(): Promise<GeminiAuth | undefined> {
  const settings = await loadSettings()
  return settings.geminiAuth
}

/**
 * Update Gemini auth (after token refresh)
 */
export async function updateGeminiAuth(auth: GeminiAuth): Promise<void> {
  const settings = await loadSettings()
  settings.geminiAuth = auth
  await saveSettings(settings)
}
