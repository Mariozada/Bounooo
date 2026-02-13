import { ensureDebuggerAttached } from './debuggerSession'

/** Capture a specific tab via the Chrome DevTools Protocol (works even if tab is not active). */
export async function captureTabScreenshot(tabId: number): Promise<string> {
  await ensureDebuggerAttached(tabId)

  const result = await new Promise<{ data: string }>((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'png' }, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(res as { data: string })
    })
  })

  return `data:image/png;base64,${result.data}`
}
