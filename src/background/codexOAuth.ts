/**
 * Codex OAuth background handlers
 * Uses Device Authorization Grant flow (RFC 8628)
 * This flow doesn't require a pre-registered redirect URI
 */

import {
  requestDeviceCode,
  pollForDeviceToken,
  createCodexAuth,
  DEVICE_VERIFICATION_URL,
} from '@auth/codex'
import type { CodexAuth, DeviceAuthResponse } from '@auth/types'
import { loadSettings, saveSettings } from '@shared/settings'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Codex:OAuth]', ...args)
const logError = (...args: unknown[]) => console.error('[Codex:OAuth]', ...args)

// Store pending device auth for polling
let pendingDeviceAuth: DeviceAuthResponse | null = null
let isPolling = false
let shouldAbortPolling = false

export interface DeviceFlowStatus {
  success: boolean
  error?: string
  userCode?: string
  verificationUrl?: string
}

/**
 * Start Codex OAuth flow using Device Authorization Grant
 * Returns the user code and verification URL for the user to complete
 */
export async function startCodexOAuth(): Promise<DeviceFlowStatus> {
  log('Starting Device OAuth flow...')

  try {
    // Cancel any pending poll
    shouldAbortPolling = true

    // Wait a bit for any pending poll to stop
    if (isPolling) {
      await new Promise(r => setTimeout(r, 100))
    }
    shouldAbortPolling = false

    // Request device code
    pendingDeviceAuth = await requestDeviceCode()
    log('Device auth received:', pendingDeviceAuth.user_code)
    log('Verification URL:', DEVICE_VERIFICATION_URL)

    // Open the verification URL in a new tab
    await chrome.tabs.create({ url: DEVICE_VERIFICATION_URL })

    // Start polling for authorization in the background
    pollForAuthorizationInBackground()

    return {
      success: true,
      userCode: pendingDeviceAuth.user_code,
      verificationUrl: DEVICE_VERIFICATION_URL,
    }
  } catch (error) {
    logError('Device OAuth flow failed:', error)
    pendingDeviceAuth = null
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Poll for authorization completion in the background
 */
async function pollForAuthorizationInBackground(): Promise<void> {
  if (!pendingDeviceAuth) {
    logError('No pending device auth')
    return
  }

  if (isPolling) {
    log('Already polling, skipping...')
    return
  }

  const { device_auth_id, user_code, interval, expires_in } = pendingDeviceAuth
  // Parse interval as it comes as string from API
  const intervalSeconds = Math.max(parseInt(interval) || 5, 1)
  const expiresInSeconds = expires_in ?? 600 // Default 10 minutes

  isPolling = true

  try {
    log('Starting to poll for device authorization...')

    const tokens = await pollForDeviceToken(
      device_auth_id,
      user_code,
      intervalSeconds,
      expiresInSeconds,
      () => {
        if (shouldAbortPolling) {
          throw new Error('Polling aborted')
        }
        log('Polling for device token...')
      }
    )

    if (shouldAbortPolling) return

    log('Device authorization successful!')

    // Create CodexAuth object
    const codexAuth = createCodexAuth(tokens)
    log('CodexAuth created, accountId:', codexAuth.accountId)

    // Save to settings
    const settings = await loadSettings()
    settings.codexAuth = codexAuth
    await saveSettings(settings)

    log('OAuth flow completed successfully')

    // Notify any open side panels that auth is complete
    chrome.runtime.sendMessage({ type: 'CODEX_AUTH_COMPLETE', success: true }).catch(() => {})

  } catch (error) {
    if (shouldAbortPolling) return

    logError('Device authorization polling failed:', error)
    chrome.runtime.sendMessage({
      type: 'CODEX_AUTH_COMPLETE',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(() => {})
  } finally {
    pendingDeviceAuth = null
    isPolling = false
  }
}

/**
 * Cancel any pending OAuth flow
 */
export function cancelCodexOAuth(): void {
  log('Cancelling OAuth flow...')
  shouldAbortPolling = true
  pendingDeviceAuth = null
  isPolling = false
}

/**
 * Logout from Codex (clear tokens)
 */
export async function logoutCodex(): Promise<{ success: boolean }> {
  log('Logging out...')

  try {
    // Cancel any pending poll
    cancelCodexOAuth()

    const settings = await loadSettings()
    delete settings.codexAuth
    await saveSettings(settings)

    log('Logout successful')
    return { success: true }
  } catch (error) {
    logError('Logout failed:', error)
    return { success: false }
  }
}

/**
 * Get current Codex auth status
 */
export async function getCodexAuth(): Promise<CodexAuth | undefined> {
  const settings = await loadSettings()
  return settings.codexAuth
}

/**
 * Update Codex auth (after token refresh)
 */
export async function updateCodexAuth(auth: CodexAuth): Promise<void> {
  const settings = await loadSettings()
  settings.codexAuth = auth
  await saveSettings(settings)
}
