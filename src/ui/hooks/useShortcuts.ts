import { useState, useEffect, useCallback } from 'react'
import {
  getAllShortcuts,
  createShortcut,
  updateShortcut,
  deleteShortcut,
} from '@storage/shortcutStorage'
import type { ScheduledShortcut, ShortcutSchedule } from '@storage/types'
import { MessageTypes } from '@shared/messages'

function syncAlarms(): void {
  chrome.runtime.sendMessage({ type: MessageTypes.SYNC_SHORTCUT_ALARMS }).catch(() => {})
}

function runShortcutNow(shortcutId: string): void {
  chrome.runtime.sendMessage({ type: MessageTypes.RUN_SHORTCUT_NOW, shortcutId }).catch(() => {})
}

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<ScheduledShortcut[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    const all = await getAllShortcuts()
    setShortcuts(all)
  }, [])

  useEffect(() => {
    refresh().then(() => setIsLoading(false))
  }, [refresh])

  const addShortcut = useCallback(
    async (data: {
      name: string
      prompt: string
      startUrl: string
      schedule: ShortcutSchedule
      provider?: string
      model?: string
    }) => {
      const shortcut = await createShortcut(data as Parameters<typeof createShortcut>[0])
      await refresh()
      syncAlarms()
      return shortcut
    },
    [refresh]
  )

  const editShortcut = useCallback(
    async (id: string, updates: Partial<Omit<ScheduledShortcut, 'id' | 'createdAt'>>) => {
      await updateShortcut(id, updates)
      await refresh()
      syncAlarms()
    },
    [refresh]
  )

  const removeShortcut = useCallback(
    async (id: string) => {
      await deleteShortcut(id)
      await refresh()
      syncAlarms()
    },
    [refresh]
  )

  const toggleShortcut = useCallback(
    async (id: string, enabled: boolean) => {
      await updateShortcut(id, { enabled })
      await refresh()
      syncAlarms()
    },
    [refresh]
  )

  const runNow = useCallback((id: string) => {
    runShortcutNow(id)
  }, [])

  return {
    shortcuts,
    isLoading,
    addShortcut,
    editShortcut,
    removeShortcut,
    toggleShortcut,
    runNow,
    refresh,
  }
}
