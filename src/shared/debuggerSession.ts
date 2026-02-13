/**
 * Persistent debugger session management.
 * Keeps the Chrome DevTools debugger attached for the duration of a workflow
 * instead of attaching/detaching per tool call (which flashes the debug bar).
 */

const attachedTabs = new Set<number>()

export async function ensureDebuggerAttached(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return

  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || ''
        if (msg.includes('Already attached')) {
          attachedTabs.add(tabId)
          resolve()
        } else {
          reject(new Error(msg))
        }
      } else {
        attachedTabs.add(tabId)
        resolve()
      }
    })
  })
}

export async function detachDebugger(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return
  attachedTabs.delete(tabId)
  await new Promise<void>(resolve => {
    chrome.debugger.detach({ tabId }, () => resolve())
  })
}

export async function detachAllDebuggers(): Promise<void> {
  const tabs = [...attachedTabs]
  attachedTabs.clear()
  for (const tabId of tabs) {
    await new Promise<void>(resolve => {
      chrome.debugger.detach({ tabId }, () => resolve())
    })
  }
}

/** Call this from chrome.debugger.onDetach to keep the set in sync */
export function markDetached(tabId: number): void {
  attachedTabs.delete(tabId)
}
