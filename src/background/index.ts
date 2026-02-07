import {
  executeTool,
  getRegisteredTools,
  registerTabTools,
  registerPageReadingTools,
  registerInteractionTools,
  registerDebuggingTools,
  registerMediaTools,
  registerUiTools,
  addConsoleMessage,
  addNetworkRequest,
  clearTabData
} from '@tools/index'
import { MessageTypes } from '@shared/messages'
import { tabGroups } from './tabGroups'
import { syncAlarms, shortcutIdFromAlarm } from './scheduler'
import { runShortcut } from './shortcutRunner'

registerTabTools()
registerPageReadingTools()
registerInteractionTools()
registerDebuggingTools()
registerMediaTools()
registerUiTools()

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
    runShortcut(shortcutId).catch((err) =>
      console.error('Bouno: Shortcut execution failed:', err)
    )
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
      }
    })
    return true
  }

  if (type === MessageTypes.EXECUTE_SCRIPT) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message, sendResponse)
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
    const { active, tabId: targetTabId, groupId: targetGroupId } = message as { active: boolean; tabId?: number; groupId?: number }

    if (targetGroupId !== undefined) {
      const groupTabIds = tabGroups.getGroupTabs(targetGroupId)
      for (const tid of groupTabIds) {
        chrome.tabs.sendMessage(tid, { type: MessageTypes.SET_SCREEN_GLOW, active }).catch(() => {})
      }
    } else if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, { type: MessageTypes.SET_SCREEN_GLOW, active }).catch(() => {})
    }
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
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: (err as Error).message }))
    return true
  }

  if (type === MessageTypes.EXECUTE_TOOL) {
    const { tool, params } = message as { tool: string; params: Record<string, unknown> }
    console.log(`[Bouno:background] EXECUTE_TOOL received: tool=${tool}, params=`, params)
    console.log(`[Bouno:background] Sender:`, sender.tab?.id, sender.url)

    const toolGroupId = params.groupId as number | undefined
    const toolTabId = params.tabId as number | undefined

    // Validate that the target tab belongs to the agent's group
    if (toolGroupId !== undefined && toolTabId !== undefined) {
      if (!tabGroups.isTabInGroup(toolTabId, toolGroupId)) {
        sendResponse({ success: false, error: `Tab ${toolTabId} is not in the agent's tab group` })
        return true
      }
    }

    executeTool(tool, params).then((result) => {
      console.log(`[Bouno:background] EXECUTE_TOOL result:`, result)
      sendResponse(result)
    }).catch((err) => {
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
    const currentDomain = tab.url ? new URL(tab.url).hostname : ''
    const newDomain = changeInfo.url ? new URL(changeInfo.url).hostname : ''

    if (currentDomain !== newDomain) {
      clearTabData(tabId)
    }
  }

  if (changeInfo.status === 'complete') {
    console.log('Bouno: Tab loaded:', tab.url)
  }
})

