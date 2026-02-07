import { getAllShortcuts, getEnabledShortcuts } from '@storage/shortcutStorage'
import type { ScheduledShortcut } from '@storage/types'

const log = (...args: unknown[]) => console.log('[Bouno:Scheduler]', ...args)
const logError = (...args: unknown[]) => console.error('[Bouno:Scheduler]', ...args)

const ALARM_PREFIX = 'shortcut:'

function alarmName(shortcutId: string): string {
  return `${ALARM_PREFIX}${shortcutId}`
}

export function shortcutIdFromAlarm(alarmName: string): string | null {
  if (!alarmName.startsWith(ALARM_PREFIX)) return null
  return alarmName.slice(ALARM_PREFIX.length)
}

export async function syncAlarms(): Promise<void> {
  log('Syncing alarms...')

  // Clear all existing shortcut alarms
  const allAlarms = await chrome.alarms.getAll()
  for (const alarm of allAlarms) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name)
    }
  }

  // Create alarms for enabled shortcuts
  const shortcuts = await getEnabledShortcuts()
  const now = Date.now()

  for (const shortcut of shortcuts) {
    const name = alarmName(shortcut.id)

    if (shortcut.schedule.type === 'once') {
      if (!shortcut.schedule.date) continue
      // Skip if the scheduled time has already passed
      if (shortcut.schedule.date <= now) {
        log(`Skipping past-due one-shot shortcut: ${shortcut.name}`)
        continue
      }
      chrome.alarms.create(name, { when: shortcut.schedule.date })
      log(`Created one-shot alarm for "${shortcut.name}" at ${new Date(shortcut.schedule.date).toLocaleString()}`)
    } else if (shortcut.schedule.type === 'recurring') {
      if (!shortcut.schedule.intervalMinutes) continue
      chrome.alarms.create(name, {
        delayInMinutes: shortcut.schedule.intervalMinutes,
        periodInMinutes: shortcut.schedule.intervalMinutes,
      })
      log(`Created recurring alarm for "${shortcut.name}" every ${shortcut.schedule.intervalMinutes} min`)
    }
  }

  log('Alarm sync complete')
}
