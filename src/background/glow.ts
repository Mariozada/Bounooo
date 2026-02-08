import { MessageTypes } from '@shared/messages'

const MIN_GLOW_VISIBLE_MS = 3000

interface GlowState {
  shownAt: number
  hideTimerId?: number
}

// Track which tab currently has the glow overlay
let glowTabId: number | null = null
const glowStates = new Map<number, GlowState>()

function clearGlowHideTimer(tabId: number, state?: GlowState): GlowState | null {
  const target = state ?? glowStates.get(tabId)
  if (!target) return null

  if (target.hideTimerId !== undefined) {
    clearTimeout(target.hideTimerId)
    delete target.hideTimerId
  }

  return target
}

function showGlowOnTab(tabId: number): void {
  const existing = clearGlowHideTimer(tabId)
  if (!existing) {
    glowStates.set(tabId, { shownAt: Date.now() })
  }

  // Always re-send to survive same-tab navigations/content-script reloads.
  chrome.tabs.sendMessage(tabId, { type: MessageTypes.SET_SCREEN_GLOW, active: true }).catch(() => {})
}

function hideGlowOnTabWithMinimum(tabId: number): void {
  const state = glowStates.get(tabId)
  if (!state) return

  clearGlowHideTimer(tabId, state)

  const elapsed = Date.now() - state.shownAt
  const delay = Math.max(0, MIN_GLOW_VISIBLE_MS - elapsed)

  const hide = () => {
    const current = glowStates.get(tabId)
    if (!current) return
    if (current.hideTimerId !== undefined) {
      delete current.hideTimerId
    }

    chrome.tabs.sendMessage(tabId, { type: MessageTypes.SET_SCREEN_GLOW, active: false }).catch(() => {})
    glowStates.delete(tabId)

    if (glowTabId === tabId) {
      glowTabId = null
    }
  }

  if (delay === 0) {
    hide()
    return
  }

  state.hideTimerId = setTimeout(hide, delay)
}

export function switchGlowToTab(tabId: number): void {
  if (glowTabId && glowTabId !== tabId) {
    hideGlowOnTabWithMinimum(glowTabId)
  }
  glowTabId = tabId
  showGlowOnTab(tabId)
}

export function hideAllGlowsWithMinimum(): void {
  for (const tabId of Array.from(glowStates.keys())) {
    hideGlowOnTabWithMinimum(tabId)
  }
  glowTabId = null
}

export function cleanupGlowForTab(tabId: number): void {
  const glowState = clearGlowHideTimer(tabId)
  if (glowState) {
    glowStates.delete(tabId)
  }
  if (glowTabId === tabId) {
    glowTabId = null
  }
}
