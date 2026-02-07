import { registerTool } from '../registry'
import { MessageTypes } from '@shared/messages'
import type { ConsoleMessage, NetworkRequest } from '@shared/types'
import { MAX_CONSOLE_MESSAGES, MAX_NETWORK_REQUESTS } from '@shared/constants'

const consoleMessagesStore = new Map<number, ConsoleMessage[]>()
const networkRequestsStore = new Map<number, NetworkRequest[]>()

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

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId)

  if (!tab.url) {
    throw new Error('Cannot access tab: no URL (tab may still be loading)')
  }

  if (isRestrictedPageUrl(tab.url)) {
    throw new Error(restrictedPageError(tab.url))
  }

  try {
    await new Promise<void>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve()
        }
      })
    })
  } catch {
    console.log('Bouno: Injecting content script into tab', tabId)
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      })
      await new Promise(resolve => setTimeout(resolve, 150))
    } catch (err) {
      throw new Error(`Failed to inject content script: ${(err as Error).message}`)
    }
  }
}

async function sendToContentScript<T>(tabId: number, message: unknown): Promise<T> {
  await ensureContentScriptInjected(tabId)

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T & { error?: string }) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else if (response && response.error) {
        reject(new Error(response.error))
      } else {
        resolve(response)
      }
    })
  })
}

export function addConsoleMessage(tabId: number, message: Omit<ConsoleMessage, 'timestamp'>): void {
  if (!consoleMessagesStore.has(tabId)) {
    consoleMessagesStore.set(tabId, [])
  }

  const messages = consoleMessagesStore.get(tabId)!
  messages.push({
    ...message,
    timestamp: Date.now()
  } as ConsoleMessage)

  if (messages.length > MAX_CONSOLE_MESSAGES) {
    messages.shift()
  }
}

export function addNetworkRequest(tabId: number, request: Omit<NetworkRequest, 'timestamp'>): void {
  if (!networkRequestsStore.has(tabId)) {
    networkRequestsStore.set(tabId, [])
  }

  const requests = networkRequestsStore.get(tabId)!
  requests.push({
    ...request,
    timestamp: Date.now()
  } as NetworkRequest)

  if (requests.length > MAX_NETWORK_REQUESTS) {
    requests.shift()
  }
}

export function clearTabData(tabId: number): void {
  consoleMessagesStore.delete(tabId)
  networkRequestsStore.delete(tabId)
}

async function readConsoleMessages(params: {
  tabId: number
  pattern?: string
  limit?: number
  onlyErrors?: boolean
  clear?: boolean
}): Promise<{ messages: Partial<ConsoleMessage>[]; count: number }> {
  const { tabId, pattern, limit = 100, onlyErrors = false, clear = false } = params

  if (!tabId) throw new Error('tabId is required')

  try {
    const response = await sendToContentScript<{ messages?: ConsoleMessage[] }>(tabId, {
      type: MessageTypes.GET_CONSOLE_MESSAGES
    })

    if (response?.messages) {
      for (const msg of response.messages) {
        addConsoleMessage(tabId, msg)
      }
    }
  } catch {}

  let messages = consoleMessagesStore.get(tabId) || []

  if (onlyErrors) {
    messages = messages.filter(m => m.type === 'error' || m.type === 'exception')
  }

  if (pattern) {
    try {
      const regex = new RegExp(pattern, 'i')
      messages = messages.filter(m => regex.test(m.text || ''))
    } catch {
      messages = messages.filter(m => (m.text || '').includes(pattern))
    }
  }

  messages = messages.slice(-limit)

  if (clear) {
    consoleMessagesStore.delete(tabId)
    try {
      await sendToContentScript(tabId, { type: MessageTypes.CLEAR_CONSOLE_MESSAGES })
    } catch {}
  }

  return {
    messages: messages.map(m => ({
      type: m.type,
      text: m.text,
      timestamp: m.timestamp,
      source: m.source
    })),
    count: messages.length
  }
}

async function readNetworkRequests(params: {
  tabId: number
  pattern?: string
  limit?: number
  clear?: boolean
}): Promise<{ requests: Partial<NetworkRequest>[]; count: number }> {
  const { tabId, pattern, limit = 100, clear = false } = params

  if (!tabId) throw new Error('tabId is required')

  let requests = networkRequestsStore.get(tabId) || []

  if (pattern) {
    requests = requests.filter(r => r.url?.includes(pattern))
  }

  requests = requests.slice(-limit)

  if (clear) {
    networkRequestsStore.delete(tabId)
  }

  return {
    requests: requests.map(r => ({
      url: r.url,
      method: r.method,
      type: r.type,
      status: r.status,
      statusText: r.statusText,
      timestamp: r.timestamp
    })),
    count: requests.length
  }
}

async function javascriptTool(params: {
  code: string
  tabId: number
}): Promise<{ success: boolean; result?: unknown }> {
  const { code, tabId } = params

  if (!tabId) throw new Error('tabId is required')
  if (!code) throw new Error('code (JavaScript code) is required')

  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) {
    throw new Error('Cannot access tab: no URL (tab may still be loading)')
  }
  if (isRestrictedPageUrl(tab.url)) {
    throw new Error(restrictedPageError(tab.url))
  }

  const ensureDebuggerPermission = async (): Promise<void> => {
    const hasPermission = await new Promise<boolean>((resolve) => {
      chrome.permissions.contains({ permissions: ['debugger'] }, (granted) => {
        resolve(Boolean(granted))
      })
    })

    if (hasPermission) return

    const granted = await new Promise<boolean>((resolve, reject) => {
      chrome.permissions.request({ permissions: ['debugger'] }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve(Boolean(result))
      })
    })

    if (!granted) {
      throw new Error('Debugger permission was denied. javascript_tool requires debugger permission to run code on this page.')
    }
  }

  const target: chrome.debugger.Debuggee = { tabId }
  const protocolVersion = '1.3'

  const sendDebuggerCommand = <T = unknown>(
    method: string,
    commandParams?: object
  ): Promise<T> => new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, commandParams, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(result as T)
      }
    })
  })

  const attachDebugger = (): Promise<void> => new Promise((resolve, reject) => {
    chrome.debugger.attach(target, protocolVersion, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve()
      }
    })
  })

  const detachDebugger = (): Promise<void> => new Promise((resolve) => {
    chrome.debugger.detach(target, () => resolve())
  })

  let attached = false

  try {
    await ensureDebuggerPermission()
    await attachDebugger()
    attached = true

    // Evaluate user code in the page JavaScript context, awaiting async results.
    const response = await sendDebuggerCommand<{
      result?: { value?: unknown; description?: string; unserializableValue?: string }
      exceptionDetails?: { text?: string; exception?: { description?: string; value?: string } }
    }>('Runtime.evaluate', {
      expression: `(async () => { ${code}\n })()`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })

    if (response.exceptionDetails) {
      const errText = response.exceptionDetails.exception?.description
        || response.exceptionDetails.exception?.value
        || response.exceptionDetails.text
        || 'Unknown JavaScript exception'
      throw new Error(errText)
    }

    const resultPayload = response.result
    if (!resultPayload) {
      return { success: true, result: null }
    }

    if ('value' in resultPayload) {
      return { success: true, result: resultPayload.value }
    }

    if (resultPayload.unserializableValue !== undefined) {
      return { success: true, result: resultPayload.unserializableValue }
    }

    return { success: true, result: resultPayload.description ?? null }
  } catch (err) {
    throw new Error(`JavaScript execution failed: ${(err as Error).message}`)
  } finally {
    if (attached) {
      await detachDebugger()
    }
  }
}

export function registerDebuggingTools(): void {
  registerTool('read_console_messages', readConsoleMessages as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('read_network_requests', readNetworkRequests as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('javascript_tool', javascriptTool as (params: Record<string, unknown>) => Promise<unknown>)
}
