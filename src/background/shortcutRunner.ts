import { getShortcut, markShortcutRun, updateShortcut } from '@storage/shortcutStorage'
import { loadSettings } from '@shared/settings'
import { createProvider } from '@agent/providers'
import { runWorkflow } from '@agent/workflow/runner'
import { executeTool as registryExecuteTool } from '@tools/registry'
import type { Message } from '@agent/workflow/types'
import type { ProviderSettings } from '@shared/settings'

const log = (...args: unknown[]) => console.log('[Bouno:ShortcutRunner]', ...args)
const logError = (...args: unknown[]) => console.error('[Bouno:ShortcutRunner]', ...args)

/** Wait for a tab to finish loading */
function waitForTabLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Tab load timed out'))
    }, timeoutMs)

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }

    chrome.tabs.onUpdated.addListener(listener)

    // Check if already loaded
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }).catch(() => {
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Tab not found'))
    })
  })
}

/**
 * Direct tool executor for background runs.
 * Calls the tool registry directly instead of going through chrome.runtime.sendMessage.
 */
async function directToolExecutor(name: string, params: Record<string, unknown>): Promise<unknown> {
  const result = await registryExecuteTool(name, params)
  if (result.success) {
    return result.result ?? { success: true }
  }
  return { error: result.error ?? 'Tool execution failed' }
}

export async function runShortcut(shortcutId: string): Promise<void> {
  log(`Running shortcut: ${shortcutId}`)

  const shortcut = await getShortcut(shortcutId)
  if (!shortcut) {
    logError(`Shortcut not found: ${shortcutId}`)
    return
  }

  if (!shortcut.enabled) {
    log(`Shortcut "${shortcut.name}" is disabled, skipping`)
    return
  }

  let tabId: number | undefined

  try {
    // Load user settings for API keys and fallback model/provider
    const settings = await loadSettings()

    // Build effective provider settings
    const effectiveSettings: ProviderSettings = {
      ...settings,
      provider: shortcut.provider ?? settings.provider,
      model: shortcut.model ?? settings.model,
    }

    // Create a new tab and navigate to the start URL
    const tab = await chrome.tabs.create({ url: shortcut.startUrl, active: false })
    tabId = tab.id!
    log(`Created tab ${tabId}, navigating to ${shortcut.startUrl}`)

    await waitForTabLoad(tabId)
    log(`Tab ${tabId} loaded`)

    // Build the message
    const messages: Message[] = [
      { role: 'user', content: shortcut.prompt },
    ]

    // Create provider and run workflow
    const model = createProvider(effectiveSettings)

    const result = await runWorkflow({
      model,
      messages,
      tabId,
      maxSteps: 15,
      toolExecutor: directToolExecutor,
      modelName: effectiveSettings.model,
      provider: effectiveSettings.provider,
    })

    log(`Shortcut "${shortcut.name}" completed:`, {
      steps: result.steps,
      finishReason: result.finishReason,
    })

    await markShortcutRun(shortcutId, 'success')

    // Disable one-shot shortcuts after execution
    if (shortcut.schedule.type === 'once') {
      await updateShortcut(shortcutId, { enabled: false })
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    logError(`Shortcut "${shortcut.name}" failed:`, err)
    await markShortcutRun(shortcutId, 'error', errorMessage)
  }
}
