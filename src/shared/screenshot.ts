/** Capture a specific tab via the Chrome DevTools Protocol (works even if tab is not active). */
export async function captureTabScreenshot(tabId: number): Promise<string> {
  const target: chrome.debugger.Debuggee = { tabId }
  let attached = false

  try {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve()
      })
    })
    attached = true

    const result = await new Promise<{ data: string }>((resolve, reject) => {
      chrome.debugger.sendCommand(target, 'Page.captureScreenshot', { format: 'png' }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve(res as { data: string })
      })
    })

    return `data:image/png;base64,${result.data}`
  } finally {
    if (attached) {
      await new Promise<void>((resolve) => {
        chrome.debugger.detach(target, () => resolve())
      })
    }
  }
}
