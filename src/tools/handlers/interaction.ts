import { registerTool } from '../registry'
import { MessageTypes } from '@shared/messages'
import type { Screenshot } from '@shared/types'
import { MAX_SCREENSHOTS } from '@shared/constants'

const screenshotStore = new Map<string, Screenshot>()
let screenshotCounter = 0

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

async function formInput(params: {
  ref: string
  value: string | boolean | number
  tabId: number
}): Promise<unknown> {
  const { ref, value, tabId } = params

  if (!tabId) throw new Error('tabId is required')
  if (!ref) throw new Error('ref is required')
  if (value === undefined) throw new Error('value is required')

  return sendToContentScript(tabId, {
    type: MessageTypes.FORM_INPUT,
    ref,
    value
  })
}

async function takeScreenshot(tabId: number): Promise<{
  imageId: string
  dataUrl: string
  width: number
  height: number
}> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url) {
    throw new Error('Cannot access tab: no URL (tab may still be loading)')
  }
  if (isRestrictedPageUrl(tab.url)) {
    throw new Error(restrictedPageError(tab.url))
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })

  const imageId = `screenshot_${++screenshotCounter}_${Date.now()}`

  screenshotStore.set(imageId, {
    imageId,
    dataUrl,
    timestamp: Date.now(),
    tabId,
    width: tab.width,
    height: tab.height
  })

  if (screenshotStore.size > MAX_SCREENSHOTS) {
    const oldestKey = screenshotStore.keys().next().value
    if (oldestKey) screenshotStore.delete(oldestKey)
  }

  return {
    imageId,
    dataUrl,
    width: tab.width || 0,
    height: tab.height || 0
  }
}

export function getScreenshot(imageId: string): Screenshot | undefined {
  return screenshotStore.get(imageId)
}

async function computer(params: {
  action: string
  tabId: number
  coordinate?: [number, number]
  ref?: string
  text?: string
  modifiers?: string
  scroll_direction?: string
  scroll_amount?: number
  start_coordinate?: [number, number]
  repeat?: number
  duration?: number
  region?: [number, number, number, number]
}): Promise<unknown> {
  const { action, tabId } = params

  if (!tabId) throw new Error('tabId is required')
  if (!action) throw new Error('action is required')

  switch (action) {
    case 'screenshot': {
      return takeScreenshot(tabId)
    }

    case 'zoom': {
      const { region } = params
      if (!region || region.length !== 4) {
        throw new Error('region [x0, y0, x1, y1] is required for zoom action')
      }

      const screenshot = await takeScreenshot(tabId)
      return {
        imageId: screenshot.imageId,
        dataUrl: screenshot.dataUrl,
        region: {
          x: region[0],
          y: region[1],
          width: region[2] - region[0],
          height: region[3] - region[1]
        }
      }
    }

    case 'wait': {
      const { duration = 1 } = params
      const waitTime = Math.min(Math.max(duration, 0), 30) * 1000
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return { waited: waitTime / 1000 }
    }

    default: {
      return sendToContentScript(tabId, {
        type: MessageTypes.COMPUTER_ACTION,
        action,
        coordinate: params.coordinate,
        ref: params.ref,
        text: params.text,
        modifiers: params.modifiers,
        scroll_direction: params.scroll_direction,
        scroll_amount: params.scroll_amount,
        start_coordinate: params.start_coordinate,
        repeat: params.repeat
      })
    }
  }
}

async function uploadImage(params: {
  imageId: string
  tabId: number
  ref?: string
  coordinate?: [number, number]
  filename?: string
}): Promise<unknown> {
  const { imageId, tabId, ref, coordinate, filename = 'image.png' } = params

  if (!tabId) throw new Error('tabId is required')
  if (!imageId) throw new Error('imageId is required')

  const screenshot = screenshotStore.get(imageId)
  if (!screenshot) {
    throw new Error(`Screenshot not found: ${imageId}`)
  }

  return sendToContentScript(tabId, {
    type: MessageTypes.UPLOAD_IMAGE,
    dataUrl: screenshot.dataUrl,
    ref,
    coordinate,
    filename
  })
}

export function registerInteractionTools(): void {
  registerTool('form_input', formInput as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('computer', computer as (params: Record<string, unknown>) => Promise<unknown>)
  registerTool('upload_image', uploadImage as (params: Record<string, unknown>) => Promise<unknown>)
}
