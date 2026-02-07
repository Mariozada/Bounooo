import {
  executeTool,
  getRegisteredTools,
  registerAllHandlers,
  addConsoleMessage,
  addNetworkRequest,
  clearTabData,
  addFrame,
  isGifRecordingActive
} from '@tools/index'
import { MessageTypes } from '@shared/messages'
import type { GifFrameMetadata } from '@shared/types'
import { tabGroups } from './tabGroups'
import { syncAlarms, shortcutIdFromAlarm } from './scheduler'
import { runShortcut } from './shortcutRunner'

registerAllHandlers()

console.log('Bouno: Registered tools:', getRegisteredTools())

// Track which tab currently has the glow overlay
let glowTabId: number | null = null

function asNumberPair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [x, y] = value
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }
  return [Math.round(x), Math.round(y)]
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asPrimitive(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return undefined
}

function buildGifFrameMetadata(tool: string, params: Record<string, unknown>): GifFrameMetadata {
  if (tool === 'computer') {
    const actionType = asString(params.action)
    const scrollDirection = asString(params.scroll_direction)
    return {
      tool,
      actionType,
      coordinate: asNumberPair(params.coordinate),
      startCoordinate: asNumberPair(params.start_coordinate),
      ref: asString(params.ref),
      text: actionType === 'scroll' ? scrollDirection : asString(params.text),
    }
  }

  if (tool === 'form_input') {
    return {
      tool,
      actionType: 'form_input',
      ref: asString(params.ref),
      value: asPrimitive(params.value),
    }
  }

  if (tool === 'navigate') {
    return {
      tool,
      actionType: 'navigate',
      url: asString(params.url),
    }
  }

  if (tool === 'upload_image') {
    return {
      tool,
      actionType: 'upload_image',
      coordinate: asNumberPair(params.coordinate),
      ref: asString(params.ref),
      text: asString(params.filename),
    }
  }

  return {
    tool,
    actionType: tool,
  }
}

async function autoCaptureGifFrame(
  tool: string,
  params: Record<string, unknown>,
  result?: { result?: unknown }
): Promise<void> {
  if (!isGifRecordingActive()) return

  let tabId = params.tabId as number | undefined
  if (!tabId && tool === 'tabs_create') {
    tabId = (result?.result as { id?: number } | undefined)?.id
  }
  if (!tabId) return

  try {
    const tab = await chrome.tabs.get(tabId)
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    addFrame(tabId, dataUrl, buildGifFrameMetadata(tool, params))
  } catch (err) {
    console.warn('[Bouno:background] Auto GIF frame capture failed:', err)
  }
}

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

    chrome.tabs.get(tabId).then(async (tab) => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
        console.log('[Bouno:background] Screenshot captured, length:', dataUrl.length)
        sendResponse({ success: true, dataUrl })
      } catch (err) {
        console.error('[Bouno:background] Screenshot error:', err)
        sendResponse({ success: false, error: (err as Error).message })
      }
    }).catch((err) => {
      console.error('[Bouno:background] Tab get error:', err)
      sendResponse({ success: false, error: (err as Error).message })
    })
    return true
  }

  if (type === MessageTypes.SET_SCREEN_GLOW) {
    const { active } = message as { active: boolean }

    if (!active && glowTabId) {
      chrome.tabs.sendMessage(glowTabId, { type: MessageTypes.SET_SCREEN_GLOW, active: false }).catch(() => {})
      glowTabId = null
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

    // Auto-manage glow: always re-send so glow survives same-tab navigations
    if (toolTabId) {
      if (glowTabId && glowTabId !== toolTabId) {
        chrome.tabs.sendMessage(glowTabId, { type: MessageTypes.SET_SCREEN_GLOW, active: false }).catch(() => {})
      }
      glowTabId = toolTabId
      chrome.tabs.sendMessage(toolTabId, { type: MessageTypes.SET_SCREEN_GLOW, active: true }).catch(() => {})
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

      // For tabs_create, glow the newly created tab
      if (tool === 'tabs_create' && result.success && result.result) {
        const newTabId = (result.result as { id?: number }).id
        if (newTabId) {
          if (glowTabId && glowTabId !== newTabId) {
            chrome.tabs.sendMessage(glowTabId, { type: MessageTypes.SET_SCREEN_GLOW, active: false }).catch(() => {})
          }
          glowTabId = newTabId
          chrome.tabs.sendMessage(newTabId, { type: MessageTypes.SET_SCREEN_GLOW, active: true }).catch(() => {})
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
