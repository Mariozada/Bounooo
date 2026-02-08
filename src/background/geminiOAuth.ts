/**
 * Gemini OAuth background handlers
 * Uses Authorization Code flow with PKCE
 *
 * Opens Google OAuth in a new tab and captures the redirect.
 */

import {
  generateGeminiPKCE,
  generateGeminiState,
  buildGeminiAuthUrl,
  exchangeGeminiCodeForTokens,
  getGeminiUserInfo,
  createGeminiAuth,
  resolveManagedProject,
} from '@auth/gemini'
import type { GeminiAuth, PkceCodes } from '@auth/types'
import { loadSettings, saveSettings } from '@shared/settings'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Gemini:OAuth]', ...args)
const logError = (...args: unknown[]) => console.error('[Gemini:OAuth]', ...args)

export interface GeminiOAuthResult {
  success: boolean
  error?: string
}

// Redirect URI - we'll intercept navigation to this
const REDIRECT_URI = 'http://127.0.0.1/oauth2callback'

// Store pending OAuth state
let pendingOAuth: {
  pkce: PkceCodes
  state: string
  tabId: number
} | null = null

/**
 * Start Gemini OAuth flow - opens in a new tab
 */
export async function startGeminiOAuth(): Promise<GeminiOAuthResult> {
  log('Starting Gemini OAuth flow...')

  try {
    // Generate PKCE codes
    const pkce = await generateGeminiPKCE()
    const state = generateGeminiState()

    log('Redirect URI:', REDIRECT_URI)

    // Build authorization URL
    const authUrl = buildGeminiAuthUrl(REDIRECT_URI, pkce, state)
    log('Auth URL:', authUrl)

    // Open in a new tab
    const tab = await chrome.tabs.create({ url: authUrl })
    log('Opened auth tab:', tab.id)

    if (!tab.id) {
      throw new Error('Failed to create auth tab')
    }

    // Store pending state
    pendingOAuth = { pkce, state, tabId: tab.id }

    // Set up listener for redirect (will be handled by onBeforeNavigate)
    return { success: true }

  } catch (error) {
    logError('OAuth flow failed:', error)
    pendingOAuth = null

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
 * Handle the OAuth callback when redirect is intercepted
 */
async function handleOAuthCallback(url: string): Promise<void> {
  if (!pendingOAuth) {
    logError('No pending OAuth state')
    return
  }

  const { pkce, state, tabId } = pendingOAuth
  pendingOAuth = null

  try {
    // Close the auth tab
    try {
      await chrome.tabs.remove(tabId)
    } catch {
      // Tab might already be closed
    }

    // Parse response URL
    const parsedUrl = new URL(url)
    const code = parsedUrl.searchParams.get('code')
    const returnedState = parsedUrl.searchParams.get('state')
    const error = parsedUrl.searchParams.get('error')

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
    const tokens = await exchangeGeminiCodeForTokens(code, REDIRECT_URI, pkce)
    log('Tokens received')

    // Get user info (email)
    const userInfo = await getGeminiUserInfo(tokens.access_token)
    log('User email:', userInfo.email)

    // Resolve managed project for API access
    log('Resolving managed project...')
    let projectId: string | undefined
    try {
      projectId = await resolveManagedProject(tokens.access_token)
      log('Project ID:', projectId)
    } catch (error) {
      logError('Failed to resolve managed project:', error)
      // Continue anyway - will try again on first API call
    }

    // Create GeminiAuth object
    const geminiAuth = createGeminiAuth(tokens, userInfo.email, projectId)
    log('GeminiAuth created')

    // Save to settings
    const settings = await loadSettings()
    settings.geminiAuth = geminiAuth
    await saveSettings(settings)

    log('OAuth flow completed successfully')

    // Notify any open side panels that auth is complete
    chrome.runtime.sendMessage({ type: 'GEMINI_AUTH_COMPLETE', success: true }).catch(() => {})

  } catch (error) {
    logError('OAuth callback handling failed:', error)

    chrome.runtime.sendMessage({
      type: 'GEMINI_AUTH_COMPLETE',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {})
  }
}

/**
 * Set up navigation listener to intercept OAuth redirect
 */
export function setupGeminiOAuthListener(): void {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Only intercept if we have pending OAuth and it's the redirect URL
    if (!pendingOAuth) return
    if (!details.url.startsWith(REDIRECT_URI)) return
    if (details.tabId !== pendingOAuth.tabId) return

    log('Intercepted OAuth redirect:', details.url)

    // Handle the callback
    handleOAuthCallback(details.url)
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
