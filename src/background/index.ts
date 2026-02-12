import {
  executeTool,
  getRegisteredTools,
  registerAllHandlers,
  addConsoleMessage,
  addNetworkRequest,
  clearTabData,
} from '@tools/index'
import { MessageTypes } from '@shared/messages'
import { captureTabScreenshot } from '@shared/screenshot'
import { tabGroups } from './tabGroups'
import { syncAlarms, shortcutIdFromAlarm } from './scheduler'
import { runShortcut } from './shortcutRunner'
import { switchGlowToTab, hideAllGlowsWithMinimum, cleanupGlowForTab } from './glow'
import { autoCaptureGifFrame } from './gifCapture'
import { startCodexOAuth, logoutCodex, cancelCodexOAuth } from './codexOAuth'
import { startGeminiOAuth, logoutGemini, setupGeminiOAuthListener } from './geminiOAuth'
import { loadSettings, saveSettings } from '@shared/settings'
import './relayClient'

registerAllHandlers()
setupGeminiOAuthListener()

console.log('Bouno: Registered tools:', getRegisteredTools())

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
chrome.sidePanel.setOptions({ enabled: false })

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return

  const tabId = tab.id
  console.log('Bouno: Opening side panel for tab', tabId)

  const existingGroup = tabGroups.findGroupByTab(tabId)

  if (existingGroup) {
    console.log('Bouno: Tab', tabId, 'already in managed group', existingGroup.groupId, '- opening panel only')

    chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html?tabId=${tabId}&groupId=${existingGroup.groupId}`,
      enabled: true
    })

    chrome.sidePanel.open({ tabId })
    return
  }

  chrome.sidePanel.setOptions({
    tabId,
    path: `sidepanel.html?tabId=${tabId}`,
    enabled: true
  })

  chrome.sidePanel.open({ tabId })
  handleTabGrouping(tabId)
})

async function handleTabGrouping(tabId: number): Promise<void> {
  try {
    const currentTab = await chrome.tabs.get(tabId)
    const isInChromeGroup = currentTab.groupId !== undefined &&
                            currentTab.groupId !== -1 &&
                            currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE

    if (isInChromeGroup) {
      console.log('Bouno: Tab', tabId, 'is in existing Chrome group', currentTab.groupId, '- adopting group')

      const adoptedGroup = await tabGroups.checkAndAdoptGroup(tabId)

      if (adoptedGroup) {
        await chrome.sidePanel.setOptions({
          tabId,
          path: `sidepanel.html?tabId=${tabId}&groupId=${adoptedGroup.groupId}`,
          enabled: true
        })

        await tabGroups.enablePanelForGroup(adoptedGroup.groupId)
        return
      }
    }

    console.log('Bouno: Tab', tabId, 'not in any group - creating new group')

    await tabGroups.createGroup(tabId)

    const allTabs = await chrome.tabs.query({})
    for (const t of allTabs) {
      if (t.id && !tabGroups.isTabManaged(t.id)) {
        chrome.sidePanel.setOptions({
          tabId: t.id,
          enabled: false
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('Bouno: Failed to handle tab grouping:', err)
  }
}

chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id) return

  if (tab.openerTabId) {
    const group = tabGroups.findGroupByTab(tab.openerTabId)
    if (group) {
      console.log('Bouno: New tab', tab.id, 'opened from grouped tab', tab.openerTabId)
      await tabGroups.addTabToGroup(tab.id, group.groupId)
      return
    }
  }

  chrome.sidePanel.setOptions({
    tabId: tab.id,
    enabled: false
  }).catch(() => {})
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (changeInfo.groupId !== undefined) {
    if (changeInfo.groupId === -1 || changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      tabGroups.removeTab(tabId)
    } else {
      const existingGroup = tabGroups.findGroupByTab(tabId)
      if (!existingGroup) {
        const adopted = await tabGroups.checkAndAdoptGroup(tabId)
        if (adopted) {
          await tabGroups.enablePanelForGroup(adopted.groupId)
        }
      }
    }
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupGlowForTab(tabId)
  tabGroups.removeTab(tabId)
  clearTabData(tabId)
})

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Bouno: Extension installed')
  } else if (details.reason === 'update') {
    console.log('Bouno: Extension updated')
  }
  // Sync shortcut alarms on install/update
  syncAlarms().catch((err) => console.error('Bouno: Failed to sync alarms on install:', err))
})

// Re-sync alarms when service worker wakes up
syncAlarms().catch((err) => console.error('Bouno: Failed to sync alarms on startup:', err))

// Handle scheduled shortcut alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  const shortcutId = shortcutIdFromAlarm(alarm.name)
  if (shortcutId) {
    console.log('Bouno: Alarm fired for shortcut:', shortcutId)
    runShortcut(shortcutId)
      .then((result) => {
        if (!result.success) {
          console.warn('Bouno: Shortcut execution skipped/failed:', result.error)
        }
      })
      .catch((err) => console.error('Bouno: Shortcut execution failed:', err))
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message as { type: string }

  if (type === MessageTypes.CONSOLE_MESSAGE) {
    const tabId = sender.tab?.id
    if (tabId) {
      addConsoleMessage(tabId, message.data)
    }
    return
  }

  if (type === MessageTypes.GET_TAB_INFO) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({
          url: tabs[0].url,
          title: tabs[0].title,
          id: tabs[0].id
        })
      } else {
        sendResponse({ error: 'No active tab found' })
      }
    })
    return true
  }

  if (type === MessageTypes.EXECUTE_SCRIPT) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message, sendResponse)
      } else {
        sendResponse({ error: 'No active tab found' })
      }
    })
    return true
  }

  if (type === MessageTypes.TAKE_SCREENSHOT) {
    const { tabId } = message as { tabId: number }
    console.log('[Bouno:background] TAKE_SCREENSHOT received, tabId:', tabId)

    captureTabScreenshot(tabId).then((dataUrl) => {
      console.log('[Bouno:background] Screenshot captured, length:', dataUrl.length)
      sendResponse({ success: true, dataUrl })
    }).catch((err) => {
      console.error('[Bouno:background] Screenshot error:', err)
      sendResponse({ success: false, error: (err as Error).message })
    })
    return true
  }

  if (type === MessageTypes.SET_SCREEN_GLOW) {
    const { active } = message as { active: boolean }

    if (!active) {
      hideAllGlowsWithMinimum()
    }
    sendResponse({ success: true })
    return true
  }

  if (type === MessageTypes.STOP_AGENT) {
    // Re-broadcast to all extension pages (side panel will pick it up)
    chrome.runtime.sendMessage({ type: MessageTypes.STOP_AGENT }).catch(() => {})
    sendResponse({ success: true })
    return true
  }

  if (type === MessageTypes.CODEX_OAUTH_START) {
    startCodexOAuth()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  if (type === MessageTypes.CODEX_OAUTH_LOGOUT) {
    logoutCodex()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  if (type === MessageTypes.CODEX_OAUTH_CANCEL) {
    cancelCodexOAuth()
    sendResponse({ success: true })
    return true
  }

  if (type === MessageTypes.GEMINI_OAUTH_START) {
    startGeminiOAuth()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  if (type === MessageTypes.GEMINI_OAUTH_LOGOUT) {
    logoutGemini()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  // Phantom handlers - use chrome.scripting.executeScript with world: MAIN
  if (type === 'PHANTOM_CHECK' || type === 'PHANTOM_CONNECT' || type === 'PHANTOM_EAGER' || type === 'PHANTOM_DISCONNECT') {
    (async () => {
      try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id || !tab.url?.startsWith('http')) {
          sendResponse({ available: false, success: false, error: 'No valid tab' })
          return
        }

        let results: chrome.scripting.InjectionResult[]

        if (type === 'PHANTOM_CHECK') {
          results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: () => {
              const w = window as { phantom?: { solana?: { isPhantom?: boolean; isConnected?: boolean; publicKey?: { toBase58: () => string } } } }
              const p = w.phantom?.solana
              return { available: !!p?.isPhantom, isConnected: !!p?.isConnected, address: p?.publicKey?.toBase58() || null }
            }
          })
        } else if (type === 'PHANTOM_CONNECT') {
          results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async () => {
              const w = window as { phantom?: { solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toBase58: () => string } }> } } }
              const p = w.phantom?.solana
              if (!p?.isPhantom) return { success: false, error: 'Phantom not found' }
              try {
                const { publicKey } = await p.connect()
                return { success: true, address: publicKey.toBase58() }
              } catch (e) {
                const err = e as { code?: number; message?: string }
                return { success: false, error: err.message, cancelled: err.code === 4001 }
              }
            }
          })
        } else if (type === 'PHANTOM_EAGER') {
          results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async () => {
              const w = window as { phantom?: { solana?: { isPhantom?: boolean; isConnected?: boolean; publicKey?: { toBase58: () => string }; connect: (o: { onlyIfTrusted: boolean }) => Promise<{ publicKey: { toBase58: () => string } }> } } }
              const p = w.phantom?.solana
              if (!p?.isPhantom) return { success: false, error: 'Phantom not found' }
              if (p.isConnected && p.publicKey) return { success: true, address: p.publicKey.toBase58() }
              try {
                const { publicKey } = await p.connect({ onlyIfTrusted: true })
                return { success: true, address: publicKey.toBase58() }
              } catch {
                return { success: false, error: 'Not trusted' }
              }
            }
          })
        } else {
          results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async () => {
              const w = window as { phantom?: { solana?: { disconnect: () => Promise<void> } } }
              if (w.phantom?.solana) await w.phantom.solana.disconnect()
              return { success: true }
            }
          })
        }

        const result = results[0]?.result as Record<string, unknown> | undefined
        sendResponse(result || { available: false, success: false })
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message })
      }
    })()
    return true
  }

  // Wallet handlers - uses content script bridge on active tab
  if (type === MessageTypes.WALLET_POPUP_OPEN) {
    const { mode = 'connect', signParams } = message as {
      mode?: 'connect' | 'sign' | 'disconnect'
      signParams?: { action: string; amount: number; to: string; tx?: string }
    }

    // Find a suitable tab for wallet operations
    async function findWalletTab(): Promise<chrome.tabs.Tab | null> {
      // First try to find an active tab in the current window
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.id && activeTab.url?.startsWith('http')) {
        return activeTab
      }

      // Find any https tab that's not a restricted page
      const allTabs = await chrome.tabs.query({})
      const suitableTab = allTabs.find(t =>
        t.id &&
        t.url &&
        (t.url.startsWith('https://') || t.url.startsWith('http://')) &&
        !t.url.includes('chrome.google.com') &&
        !t.url.includes('accounts.google.com') &&
        !t.url.includes('chrome://') &&
        !t.url.includes('edge://')
      )

      return suitableTab || null
    }

    // Ensure tab is active and inject content script if needed
    async function prepareTab(tab: chrome.tabs.Tab): Promise<boolean> {
      if (!tab.id) return false

      // Focus the tab to ensure Phantom injects
      await chrome.tabs.update(tab.id, { active: true })

      // Small delay for Phantom to notice the tab is active
      await new Promise(resolve => setTimeout(resolve, 300))

      // Try to inject our content script if it's not there
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['wallet-bridge.js']
        })
      } catch {
        // Script might already be injected or page doesn't allow it
      }

      return true
    }

    // Check if Phantom is available with retries
    async function checkPhantomAvailable(tabId: number, maxAttempts = 10): Promise<{ available: boolean; address?: string }> {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await chrome.tabs.sendMessage(tabId, { type: 'WALLET_BRIDGE_CHECK' }) as {
            available?: boolean
            address?: string
            isConnected?: boolean
          }
          console.log(`[Wallet] Check attempt ${attempt + 1}:`, result)
          if (result.available) {
            return { available: true, address: result.address || undefined }
          }
        } catch (err) {
          console.log(`[Wallet] Check attempt ${attempt + 1} failed:`, err)
        }
        // Wait longer between attempts (500ms)
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      return { available: false }
    }

    // Execute wallet operation
    (async () => {
      try {
        // Find a suitable tab
        const tab = await findWalletTab()

        // If no suitable tab, return error - don't create phantom.app tab
        if (!tab?.id) {
          console.log('[Wallet] No suitable HTTPS tab found')
          sendResponse({
            success: false,
            error: 'Please open any HTTPS website (like google.com) and try again'
          })
          return
        }

        // Prepare the tab (focus it, inject script)
        await prepareTab(tab)

        if (mode === 'connect') {
          // Check if Phantom is available
          const checkResult = await checkPhantomAvailable(tab.id)

          if (!checkResult.available) {
            sendResponse({
              success: false,
              error: 'Phantom wallet not detected. Please make sure Phantom is installed and try refreshing the page.'
            })
            return
          }

          // If already connected, just return the address
          if (checkResult.address) {
            const settings = await loadSettings()
            settings.wallet = {
              connected: true,
              address: checkResult.address,
              network: 'devnet',
            }
            await saveSettings(settings)
            sendResponse({ success: true, address: checkResult.address })
            return
          }

          // Send connect request
          console.log('[Wallet] Sending connect request to tab', tab.id)
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'WALLET_BRIDGE_CONNECT' }) as {
            success: boolean
            address?: string
            error?: string
            cancelled?: boolean
          }

          console.log('[Wallet] Connect result:', result)

          if (result.success && result.address) {
            // Save wallet state
            const settings = await loadSettings()
            settings.wallet = {
              connected: true,
              address: result.address,
              network: 'devnet',
            }
            await saveSettings(settings)

            // Broadcast to all extension pages
            chrome.runtime.sendMessage({
              type: MessageTypes.WALLET_CONNECTED,
              address: result.address,
              network: 'devnet',
            }).catch(() => {})

            sendResponse({ success: true, address: result.address })
          } else {
            if (!result.cancelled) {
              chrome.runtime.sendMessage({
                type: MessageTypes.WALLET_DISCONNECTED,
                error: result.error,
              }).catch(() => {})
            }
            sendResponse({ success: false, error: result.error, cancelled: result.cancelled })
          }
        } else if (mode === 'sign' && signParams) {
          // For signing, first check Phantom is available
          const checkResult = await checkPhantomAvailable(tab.id, 3)
          if (!checkResult.available) {
            sendResponse({ success: false, error: 'Phantom wallet not available' })
            return
          }

          const result = await chrome.tabs.sendMessage(tab.id, {
            type: 'WALLET_BRIDGE_SIGN',
            action: signParams.action,
            amount: signParams.amount,
            to: signParams.to,
          }) as {
            success: boolean
            signature?: string
            error?: string
            cancelled?: boolean
          }

          chrome.runtime.sendMessage({
            type: MessageTypes.WALLET_TX_COMPLETE,
            success: result.success,
            signature: result.signature,
            error: result.error,
            cancelled: result.cancelled,
          }).catch(() => {})

          sendResponse(result)
        } else if (mode === 'disconnect') {
          // Disconnect - clear state and optionally disconnect from Phantom
          try {
            if (tab.id) {
              await chrome.tabs.sendMessage(tab.id, { type: 'WALLET_BRIDGE_DISCONNECT' })
            }
          } catch {
            // Ignore errors
          }

          const settings = await loadSettings()
          settings.wallet = {
            connected: false,
            network: 'devnet',
          }
          await saveSettings(settings)
          sendResponse({ success: true })
        }
      } catch (err) {
        console.error('[Wallet] Error:', err)
        sendResponse({ success: false, error: (err as Error).message })
      }
    })()

    return true
  }

  // Keep these for backwards compatibility with popup flow if needed
  if (type === MessageTypes.WALLET_CONNECT_RESULT) {
    // This is now handled inline in WALLET_POPUP_OPEN
    sendResponse({ success: true })
    return true
  }

  if (type === MessageTypes.WALLET_SIGN_RESULT) {
    // This is now handled inline in WALLET_POPUP_OPEN
    sendResponse({ success: true })
    return true
  }

  if (type === MessageTypes.WALLET_DISCONNECT) {
    loadSettings().then(async (settings) => {
      settings.wallet = {
        connected: false,
        network: 'devnet',
      }
      await saveSettings(settings)

      // Broadcast disconnection
      chrome.runtime.sendMessage({
        type: MessageTypes.WALLET_DISCONNECTED,
      }).catch(() => {})

      sendResponse({ success: true })
    }).catch((err) => {
      sendResponse({ success: false, error: (err as Error).message })
    })
    return true
  }

  if (type === MessageTypes.WALLET_GET_STATE) {
    loadSettings().then((settings) => {
      sendResponse({
        success: true,
        wallet: settings.wallet || { connected: false, network: 'devnet' },
      })
    }).catch((err) => {
      sendResponse({ success: false, error: (err as Error).message })
    })
    return true
  }

  if (type === MessageTypes.SYNC_SHORTCUT_ALARMS) {
    syncAlarms()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  if (type === MessageTypes.RUN_SHORTCUT_NOW) {
    const { shortcutId } = message as { shortcutId: string }
    runShortcut(shortcutId)
      .then(async (result) => {
        try {
          await syncAlarms()
        } catch (err) {
          console.warn('Bouno: Failed to sync alarms after run-now:', err)
        }
        if (result.success) {
          sendResponse({ success: true })
        } else {
          sendResponse({ success: false, error: result.error || 'Shortcut run failed' })
        }
      })
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  if (type === MessageTypes.EXECUTE_TOOL) {
    const { tool, params } = message as { tool: string; params: Record<string, unknown> }
    console.log(`[Bouno:background] EXECUTE_TOOL received: tool=${tool}, params=`, params)
    console.log(`[Bouno:background] Sender:`, sender.tab?.id, sender.url)

    const toolGroupId = params.groupId as number | undefined
    const toolTabId = params.tabId as number | undefined

    // Auto-manage glow for the active tool tab.
    if (toolTabId) {
      switchGlowToTab(toolTabId)
    }

    // Validate that the target tab belongs to the agent's group
    // If the in-memory state is stale (e.g. service worker restarted), try to recover
    const validateAndExecute = async () => {
      if (toolGroupId !== undefined && toolTabId !== undefined) {
        if (!tabGroups.isTabInGroup(toolTabId, toolGroupId)) {
          const recovered = await tabGroups.checkAndAdoptGroup(toolTabId)
          if (!recovered || recovered.groupId !== toolGroupId) {
            sendResponse({ success: false, error: `Tab ${toolTabId} is not in the agent's tab group` })
            return
          }
        }
      }

      const result = await executeTool(tool, params)
      console.log(`[Bouno:background] EXECUTE_TOOL result:`, result)

      // For create_tab, glow the newly created tab
      if (tool === 'create_tab' && result.success && result.result) {
        const newTabId = (result.result as { id?: number }).id
        if (newTabId) {
          switchGlowToTab(newTabId)
        }
      }

      if (result.success) {
        await autoCaptureGifFrame(tool, params, result)
      }

      sendResponse(result)
    }

    validateAndExecute().catch((err) => {
      console.log(`[Bouno:background] EXECUTE_TOOL error:`, err)
      sendResponse({ success: false, error: err.message })
    })
    return true
  }

  return false
})

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId > 0) {
      addNetworkRequest(details.tabId, {
        url: details.url,
        method: details.method,
        type: details.type,
        status: details.statusCode,
        statusText: details.statusLine || '',
        responseHeaders: details.responseHeaders
      })
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
)

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    try {
      const currentDomain = tab.url ? new URL(tab.url).hostname : ''
      const newDomain = changeInfo.url ? new URL(changeInfo.url).hostname : ''

      if (currentDomain !== newDomain) {
        clearTabData(tabId)
      }
    } catch {
      // Ignore malformed URLs (about:blank, data:, etc.)
    }
  }

  if (changeInfo.status === 'complete') {
    console.log('Bouno: Tab loaded:', tab.url)
  }
})
