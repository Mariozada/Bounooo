console.log('[Bouno:content] Content script file executing...')

import { MessageTypes } from '@shared/messages'
import { handleReadPage, handleGetPageText } from './accessibilityTree'
import { handleFindElements } from './elementFinder'
import { handleFormInput } from './formHandler'
import { handleComputerAction } from './eventSimulator'
import { setupConsoleCapture, getConsoleMessages, clearConsoleMessages } from './consoleCapture'
import { handleUploadImage } from './imageUpload'

console.log('[Bouno:content] All imports successful')

try {
  setupConsoleCapture()
  console.log('[Bouno:content] Console capture initialized')
} catch (e) {
  console.error('[Bouno:content] Failed to setup console capture:', e)
}

type MessageHandler = (message: unknown) => unknown

const handlers: Record<string, MessageHandler> = {
  'PING': () => {
    return { pong: true }
  },

  [MessageTypes.READ_PAGE]: (message) => {
    const { depth, filter, ref_id } = message as { depth?: number; filter?: 'all' | 'interactive'; ref_id?: string }
    return handleReadPage({ depth, filter, ref_id })
  },

  [MessageTypes.GET_PAGE_TEXT]: () => {
    return handleGetPageText()
  },

  [MessageTypes.FIND_ELEMENTS]: (message) => {
    const { query } = message as { query: string }
    return handleFindElements({ query })
  },

  [MessageTypes.FORM_INPUT]: (message) => {
    const { ref, value } = message as { ref: string; value: string | boolean | number }
    return handleFormInput({ ref, value })
  },

  [MessageTypes.COMPUTER_ACTION]: (message) => {
    return handleComputerAction(message as Parameters<typeof handleComputerAction>[0])
  },

  [MessageTypes.UPLOAD_IMAGE]: (message) => {
    return handleUploadImage(message as Parameters<typeof handleUploadImage>[0])
  },

  [MessageTypes.GET_CONSOLE_MESSAGES]: () => {
    return { messages: getConsoleMessages() }
  },

  [MessageTypes.CLEAR_CONSOLE_MESSAGES]: () => {
    clearConsoleMessages()
    return { success: true }
  },

  [MessageTypes.GET_PAGE_INFO]: () => {
    return {
      title: document.title,
      url: window.location.href,
      selection: window.getSelection()?.toString() || ''
    }
  },

  [MessageTypes.HIGHLIGHT_TEXT]: (message) => {
    const { color } = message as { color?: string }
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const highlight = document.createElement('mark')
      highlight.style.backgroundColor = color || '#ffff00'
      range.surroundContents(highlight)
      return { success: true }
    }
    return { success: false, error: 'No text selected' }
  },

  [MessageTypes.GET_LINKS]: () => {
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
      href: (a as HTMLAnchorElement).href,
      text: a.textContent?.trim() || ''
    }))
    return { links }
  },

  [MessageTypes.GET_IMAGES]: () => {
    const images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: (img as HTMLImageElement).src,
      alt: (img as HTMLImageElement).alt
    }))
    return { images }
  }
}

console.log('[Bouno:content] Setting up message listener...')
try {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const { type } = message as { type: string }
    console.log('[Bouno:content] Message received:', type)

    const handler = handlers[type]
    if (handler) {
      try {
        console.log('[Bouno:content] Executing handler for:', type)
        const result = handler(message)
        console.log('[Bouno:content] Handler result:', typeof result)
        sendResponse(result)
      } catch (err) {
        console.error('[Bouno:content] Handler error:', err)
        sendResponse({ error: (err as Error).message })
      }
    } else {
      console.warn('[Bouno:content] Unknown message type:', type)
      sendResponse({ error: `Unknown message type: ${type}` })
    }

    return true
  })
  console.log('[Bouno:content] Message listener registered successfully')
} catch (listenerError) {
  console.error('[Bouno:content] FATAL: Failed to register message listener:', listenerError)
}

console.log('[Bouno:content] Sending ready notification to background...')
chrome.runtime.sendMessage({
  type: MessageTypes.CONTENT_SCRIPT_READY,
  url: window.location.href
}).then(() => {
  console.log('[Bouno:content] Ready notification sent successfully')
}).catch((err) => {
  console.log('[Bouno:content] Ready notification failed (normal if background not ready):', err?.message)
})

console.log('[Bouno:content] Content script initialization complete')
