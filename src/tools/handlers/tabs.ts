import { registerTool } from '../registry'
import type { TabInfo } from '@shared/types'
import { tabGroups } from '@background/tabGroups'

function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, timeoutMs)
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}

async function tabsContext(params: { groupId?: number }): Promise<{ tabs: TabInfo[] }> {
  const { groupId } = params

  if (groupId === undefined) {
    throw new Error('list_tabs requires groupId')
  }
  const tabs = await chrome.tabs.query({ groupId })

  return {
    tabs: tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || '',
      url: tab.url || '',
      audible: tab.audible
    }))
  }
}

async function tabsClose(params: { tabId: number; startingTabId?: number }): Promise<{ closed: number }> {
  const { tabId } = params

  if (!tabId) {
    throw new Error('tabId is required')
  }

  // Prevent closing the starting tab — the agent needs at least one tab to work with
  if (params.startingTabId !== undefined && tabId === params.startingTabId) {
    throw new Error('Cannot close the starting tab')
  }

  await chrome.tabs.remove(tabId)
  return { closed: tabId }
}

async function tabsCreate(params: { url?: string; groupId?: number }): Promise<TabInfo> {
  const { url, groupId } = params

  const tab = await chrome.tabs.create({
    active: false,
    url: url || 'about:blank'
  })

  if (url && tab.id) {
    await waitForTabLoad(tab.id)
  }

  if (groupId !== undefined && tab.id) {
    await tabGroups.addTabToGroup(tab.id, groupId)
  }

  const loaded = tab.id ? await chrome.tabs.get(tab.id) : tab
  return {
    id: loaded.id!,
    title: loaded.title || '',
    url: loaded.url || '',
  }
}

async function navigate(params: { url: string; tabId: number }): Promise<{
  id: number
  url: string
  title: string
  status?: string
}> {
  const { url, tabId } = params

  if (!tabId) {
    throw new Error('tabId is required')
  }

  if (!url) {
    throw new Error('url is required')
  }

  if (url === 'back') {
    await chrome.tabs.goBack(tabId)
    await new Promise(resolve => setTimeout(resolve, 100))
    const tab = await chrome.tabs.get(tabId)
    return { id: tab.id!, url: tab.url || '', title: tab.title || '' }
  }

  if (url === 'forward') {
    await chrome.tabs.goForward(tabId)
    await new Promise(resolve => setTimeout(resolve, 100))
    const tab = await chrome.tabs.get(tabId)
    return { id: tab.id!, url: tab.url || '', title: tab.title || '' }
  }

  let normalizedUrl = url
  if (!url.match(/^[a-zA-Z]+:\/\//)) {
    normalizedUrl = 'https://' + url
  }

  await chrome.tabs.update(tabId, { url: normalizedUrl })
  await waitForTabLoad(tabId)

  const tab = await chrome.tabs.get(tabId)
  return {
    id: tab.id!,
    url: tab.url || '',
    title: tab.title || '',
    status: tab.status
  }
}

async function resizeWindow(params: {
  width: number
  height: number
  tabId: number
}): Promise<{
  windowId: number
  width: number
  height: number
  state: string
}> {
  const { width, height, tabId } = params

  if (!tabId) {
    throw new Error('tabId is required')
  }

  if (!width || !height) {
    throw new Error('width and height are required')
  }

  const tab = await chrome.tabs.get(tabId)
  const windowId = tab.windowId

  await chrome.windows.update(windowId, {
    width: Math.round(width),
    height: Math.round(height)
  })

  const window = await chrome.windows.get(windowId)
  return {
    windowId: window.id!,
    width: window.width || 0,
    height: window.height || 0,
    state: window.state || 'normal'
  }
}

async function webFetch(params: { url: string }): Promise<{
  url: string
  status: number
  statusText: string
  contentType: string
  content: string
}> {
  const { url } = params

  if (!url) {
    throw new Error('url is required')
  }

  try {
    const response = await fetch(url)
    const contentType = response.headers.get('content-type') || ''

    let content: string
    if (contentType.includes('application/json')) {
      const json = await response.json()
      content = JSON.stringify(json)
    } else {
      content = await response.text()
    }

    const maxLength = 50000
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '\n...[truncated]'
    }

    return {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      content
    }
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${(err as Error).message}`)
  }
}

export function registerTabTools(): void {
  // list_tabs removed — tab context is now injected into user messages automatically
  // registerTool('list_tabs', tabsContext as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('close_tab', tabsClose as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('create_tab', tabsCreate as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('navigate', navigate as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('resize_window', resizeWindow as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('fetch_url', webFetch as (params: Record<string, unknown>) => Promise<unknown>)
}
