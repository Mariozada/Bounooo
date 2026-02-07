import { registerTool } from '../registry'
import type { TabInfo } from '@shared/types'
import { tabGroups } from '@background/tabGroups'

async function tabsContext(params: { groupId?: number }): Promise<{ tabs: TabInfo[] }> {
  const { groupId } = params

  if (groupId === undefined) {
    throw new Error('tabs_context requires groupId')
  }
  const tabs = await chrome.tabs.query({ groupId })

  return {
    tabs: tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || '',
      url: tab.url || '',
      active: tab.active,
      windowId: tab.windowId,
      index: tab.index,
      pinned: tab.pinned,
      audible: tab.audible
    }))
  }
}

async function tabsCreate(params: { url?: string; groupId?: number }): Promise<TabInfo> {
  const { url, groupId } = params

  const tab = await chrome.tabs.create({
    active: false,
    url: url || 'about:blank'
  })

  if (groupId !== undefined && tab.id) {
    await tabGroups.addTabToGroup(tab.id, groupId)
  }

  return {
    id: tab.id!,
    title: tab.title || '',
    url: tab.url || '',
    active: tab.active,
    windowId: tab.windowId
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
  await new Promise(resolve => setTimeout(resolve, 100))

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
      content = JSON.stringify(json, null, 2)
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
  registerTool('tabs_context', tabsContext as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('tabs_create', tabsCreate as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('navigate', navigate as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('resize_window', resizeWindow as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('web_fetch', webFetch as (params: Record<string, unknown>) => Promise<unknown>)
}
