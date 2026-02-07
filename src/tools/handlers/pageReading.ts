import { registerTool } from '../registry'
import { MessageTypes } from '@shared/messages'
import { DEFAULT_TREE_DEPTH } from '@shared/constants'

class InjectionError extends Error {
  logs: string[]
  constructor(message: string, logs: string[]) {
    super(message)
    this.name = 'InjectionError'
    this.logs = logs
  }
}

function isRestrictedPageUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://')
  )
}

function restrictedPageError(url: string): string {
  const origin = `${url.split('/')[0]}//...`
  return `Cannot execute this tool on restricted page: ${origin}. Inform the user that browser-protected pages (like chrome://, extension pages, or about:) block extension automation, and ask them to switch to a regular web page.`
}

async function ensureContentScriptInjected(tabId: number): Promise<{ logs: string[] }> {
  const logs: string[] = []
  const log = (msg: string) => {
    console.log(`[Bouno:inject] ${msg}`)
    logs.push(msg)
  }

  const throwWithLogs = (message: string): never => {
    throw new InjectionError(message, logs)
  }

  log(`Starting injection check for tabId=${tabId}`)

  let tab: chrome.tabs.Tab
  try {
    tab = await chrome.tabs.get(tabId)
    log(`Tab info: id=${tab.id}, status=${tab.status}, url=${tab.url?.substring(0, 80)}`)
  } catch (tabError) {
    log(`ERROR: Failed to get tab: ${(tabError as Error).message}`)
    return throwWithLogs(`Cannot get tab ${tabId}: ${(tabError as Error).message}`)
  }

  const tabUrl = tab.url
  if (!tabUrl) {
    log(`ERROR: Tab has no URL, status=${tab.status}`)
    return throwWithLogs('Cannot access tab: no URL (tab may still be loading)')
  }

  if (isRestrictedPageUrl(tabUrl)) {
    log(`ERROR: Restricted URL: ${tabUrl}`)
    return throwWithLogs(restrictedPageError(tabUrl))
  }

  log(`URL is accessible, attempting ping...`)

  try {
    const pingResult = await new Promise<unknown>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(response)
        }
      })
    })
    log(`Ping SUCCESS: ${JSON.stringify(pingResult)}`)
  } catch (pingError) {
    log(`Ping FAILED: ${(pingError as Error).message}`)
    log(`Attempting to inject content script...`)

    try {
      const injectionResult = await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      })
      log(`Injection executeScript returned: ${JSON.stringify(injectionResult)}`)
      log(`Waiting 300ms for script initialization...`)
      await new Promise(resolve => setTimeout(resolve, 300))
      log(`Verifying injection with second ping...`)
      try {
        const verifyResult = await new Promise<unknown>((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(response)
            }
          })
        })
        log(`Verification ping SUCCESS: ${JSON.stringify(verifyResult)}`)
      } catch (verifyError) {
        log(`Verification ping FAILED: ${(verifyError as Error).message}`)
        log(`This usually means the content script has a runtime error. Check the page's DevTools console.`)
        throwWithLogs(`Content script injected but not responding: ${(verifyError as Error).message}`)
      }
    } catch (injectError) {
      if (injectError instanceof InjectionError) {
        throw injectError
      }
      log(`Injection FAILED: ${(injectError as Error).message}`)
      throwWithLogs(`Failed to inject content script: ${(injectError as Error).message}`)
    }
  }

  return { logs }
}

async function sendToContentScript<T>(tabId: number, message: unknown): Promise<T & { _debugLogs?: string[] }> {
  const allLogs: string[] = []
  const log = (msg: string) => {
    console.log(`[Bouno:send] ${msg}`)
    allLogs.push(msg)
  }

  log(`sendToContentScript called: tabId=${tabId}, message=${JSON.stringify(message)}`)

  try {
    const result = await ensureContentScriptInjected(tabId)
    allLogs.push(...result.logs)
    log(`Content script ready`)
  } catch (injectionError) {
    if (injectionError instanceof InjectionError) {
      allLogs.push(...injectionError.logs)
    }
    log(`Injection error: ${(injectionError as Error).message}`)
    const error = new Error((injectionError as Error).message)
    ;(error as Error & { _debugLogs?: string[] })._debugLogs = allLogs
    throw error
  }

  log(`Sending message to content script...`)

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T & { error?: string }) => {
      if (chrome.runtime.lastError) {
        log(`Message send ERROR: ${chrome.runtime.lastError.message}`)
        const error = new Error(chrome.runtime.lastError.message)
        ;(error as Error & { _debugLogs?: string[] })._debugLogs = allLogs
        reject(error)
      } else if (response && response.error) {
        log(`Response contained error: ${response.error}`)
        const error = new Error(response.error)
        ;(error as Error & { _debugLogs?: string[] })._debugLogs = allLogs
        reject(error)
      } else {
        log(`Response received: ${JSON.stringify(response)?.substring(0, 200)}...`)
        ;(response as T & { _debugLogs?: string[] })._debugLogs = allLogs
        resolve(response as T & { _debugLogs?: string[] })
      }
    })
  })
}

async function readPage(params: {
  tabId: number
  depth?: number
  filter?: 'all' | 'interactive'
  ref_id?: string
}): Promise<unknown> {
  const { tabId, depth = DEFAULT_TREE_DEPTH, filter = 'all', ref_id } = params
  console.log(`[Bouno:read_page] Called with params:`, { tabId, depth, filter, ref_id })

  if (!tabId) {
    return { error: 'tabId is required', _debugLogs: ['ERROR: tabId is required'] }
  }

  try {
    const result = await sendToContentScript(tabId, {
      type: MessageTypes.READ_PAGE,
      depth,
      filter,
      ref_id
    })
    console.log(`[Bouno:read_page] Success`)
    return result
  } catch (err) {
    const error = err as Error & { _debugLogs?: string[] }
    console.log(`[Bouno:read_page] Error:`, error.message)
    return {
      error: error.message,
      _debugLogs: error._debugLogs || [`Caught error: ${error.message}`]
    }
  }
}

async function getPageText(params: { tabId: number }): Promise<unknown> {
  const { tabId } = params
  console.log(`[Bouno:get_page_text] Called with tabId=${tabId}`)

  if (!tabId) {
    return { error: 'tabId is required', _debugLogs: ['ERROR: tabId is required'] }
  }

  try {
    const result = await sendToContentScript(tabId, {
      type: MessageTypes.GET_PAGE_TEXT
    })
    console.log(`[Bouno:get_page_text] Success`)
    return result
  } catch (err) {
    const error = err as Error & { _debugLogs?: string[] }
    console.log(`[Bouno:get_page_text] Error:`, error.message)
    return {
      error: error.message,
      _debugLogs: error._debugLogs || [`Caught error: ${error.message}`]
    }
  }
}

async function find(params: { query: string; tabId: number }): Promise<unknown> {
  const { query, tabId } = params
  console.log(`[Bouno:find] Called with params:`, { tabId, query })

  if (!tabId) {
    return { error: 'tabId is required', _debugLogs: ['ERROR: tabId is required'] }
  }

  if (!query) {
    return { error: 'query is required', _debugLogs: ['ERROR: query is required'] }
  }

  try {
    const result = await sendToContentScript(tabId, {
      type: MessageTypes.FIND_ELEMENTS,
      query
    })
    console.log(`[Bouno:find] Success, found elements`)
    return result
  } catch (err) {
    const error = err as Error & { _debugLogs?: string[] }
    console.log(`[Bouno:find] Error:`, error.message)
    return {
      error: error.message,
      _debugLogs: error._debugLogs || [`Caught error: ${error.message}`]
    }
  }
}

export function registerPageReadingTools(): void {
  registerTool('read_page', readPage as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('get_page_text', getPageText as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('find', find as (params: Record<string, unknown>) => Promise<unknown>)
}
