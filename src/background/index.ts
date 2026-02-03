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

registerTabTools()
registerPageReadingTools()
registerInteractionTools()
registerDebuggingTools()
registerMediaTools()
registerUiTools()

console.log('BrowseRun: Registered tools:', getRegisteredTools())

// Disable the default global panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })

// Disable panel globally by default
chrome.sidePanel.setOptions({ enabled: false })

// Open panel for specific tab when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return

  const tabId = tab.id
  console.log('BrowseRun: Opening side panel for tab', tabId)

  // Check if tab is already in a managed group
  const existingGroup = tabGroups.findGroupByTab(tabId)

  if (existingGroup) {
    // Tab is already in a BrowseRun group, just open the panel
    console.log('BrowseRun: Tab', tabId, 'already in managed group', existingGroup.groupId, '- opening panel only')

    chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html?tabId=${tabId}&groupId=${existingGroup.groupId}`,
      enabled: true
    })

    chrome.sidePanel.open({ tabId })
    return
  }

  // Configure and open panel FIRST (synchronously for user gesture)
  chrome.sidePanel.setOptions({
    tabId,
    path: `sidepanel.html?tabId=${tabId}`,
    enabled: true
  })

  chrome.sidePanel.open({ tabId })

  // Now handle group logic asynchronously
  handleTabGrouping(tabId)
})

// Async function to handle tab grouping after panel is opened
async function handleTabGrouping(tabId: number): Promise<void> {
  try {
    // Check if tab is in an existing Chrome tab group
    const currentTab = await chrome.tabs.get(tabId)
    const isInChromeGroup = currentTab.groupId !== undefined &&
                            currentTab.groupId !== -1 &&
                            currentTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE

    if (isInChromeGroup) {
      // Tab is in an existing Chrome group - adopt it instead of creating new
      console.log('BrowseRun: Tab', tabId, 'is in existing Chrome group', currentTab.groupId, '- adopting group')

      const adoptedGroup = await tabGroups.checkAndAdoptGroup(tabId)

      if (adoptedGroup) {
        // Update panel path with group ID
        await chrome.sidePanel.setOptions({
          tabId,
          path: `sidepanel.html?tabId=${tabId}&groupId=${adoptedGroup.groupId}`,
          enabled: true
        })

        // Enable panel for all tabs in the adopted group
        await tabGroups.enablePanelForGroup(adoptedGroup.groupId)
        return
      }
    }

    // Tab is not in any group, create a new one
    console.log('BrowseRun: Tab', tabId, 'not in any group - creating new group')

    await tabGroups.createGroup(tabId)

    // Disable panel for all tabs not in the group
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
    console.error('BrowseRun: Failed to handle tab grouping:', err)
  }
}

// When a new tab is created, check if it should join an existing group
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id) return

  // Check if opener tab is in a managed group
  if (tab.openerTabId) {
    const group = tabGroups.findGroupByTab(tab.openerTabId)
    if (group) {
      console.log('BrowseRun: New tab', tab.id, 'opened from grouped tab', tab.openerTabId)
      await tabGroups.addTabToGroup(tab.id, group.groupId)
      return
    }
  }

  // Not from a grouped tab - disable panel for this new tab
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    enabled: false
  }).catch(() => {})
})

// Listen for tabs being added to Chrome tab groups
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Check if tab's group changed
  if (changeInfo.groupId !== undefined) {
    if (changeInfo.groupId === -1 || changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      // Tab was removed from group
      tabGroups.removeTab(tabId)
    } else {
      // Tab was added to a group - check if we manage it
      const existingGroup = tabGroups.findGroupByTab(tabId)
      if (!existingGroup) {
        // Check if this is one of our groups
        const adopted = await tabGroups.checkAndAdoptGroup(tabId)
        if (adopted) {
          await tabGroups.enablePanelForGroup(adopted.groupId)
        }
      }
    }
  }
})

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabGroups.removeTab(tabId)
  clearTabData(tabId)
})

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('BrowseRun: Extension installed')
  } else if (details.reason === 'update') {
    console.log('BrowseRun: Extension updated')
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

  if (type === MessageTypes.EXECUTE_TOOL) {
    const { tool, params } = message as { tool: string; params: Record<string, unknown> }
    console.log(`[BrowseRun:background] EXECUTE_TOOL received: tool=${tool}, params=`, params)
    console.log(`[BrowseRun:background] Sender:`, sender.tab?.id, sender.url)

    executeTool(tool, params).then((result) => {
      console.log(`[BrowseRun:background] EXECUTE_TOOL result:`, result)
      sendResponse(result)
    }).catch((err) => {
      console.log(`[BrowseRun:background] EXECUTE_TOOL error:`, err)
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
    console.log('BrowseRun: Tab loaded:', tab.url)
  }
})

