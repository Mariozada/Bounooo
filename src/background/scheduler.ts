import { getEnabledShortcuts, updateShortcut } from '@storage/shortcutStorage'

const log = (...args: unknown[]) => console.log('[Bouno:Scheduler]', ...args)
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
      if (!shortcut.schedule.date) {
        log(`Disabling one-shot shortcut with missing date: ${shortcut.name}`)
        await updateShortcut(shortcut.id, {
          enabled: false,
          lastRunStatus: 'error',
          lastRunError: 'Shortcut disabled: missing one-time schedule date.',
        })
        continue
      }
      // Skip if the scheduled time has already passed
      if (shortcut.schedule.date <= now) {
        log(`Disabling past-due one-shot shortcut: ${shortcut.name}`)
        await updateShortcut(shortcut.id, {
          enabled: false,
          lastRunStatus: 'error',
          lastRunError: 'Shortcut disabled: one-time schedule is in the past.',
        })
        continue
      }
      chrome.alarms.create(name, { when: shortcut.schedule.date })
      log(`Created one-shot alarm for "${shortcut.name}" at ${new Date(shortcut.schedule.date).toLocaleString()}`)
    } else if (shortcut.schedule.type === 'recurring') {
      const interval = shortcut.schedule.intervalMinutes
      if (!interval || interval < 1) {
        log(`Disabling recurring shortcut with invalid interval: ${shortcut.name}`)
        await updateShortcut(shortcut.id, {
          enabled: false,
          lastRunStatus: 'error',
          lastRunError: 'Shortcut disabled: recurring interval must be at least 1 minute.',
        })
        continue
      }
      chrome.alarms.create(name, {
        delayInMinutes: interval,
        periodInMinutes: interval,
      })
      log(`Created recurring alarm for "${shortcut.name}" every ${interval} min`)
    }
  }

  log('Alarm sync complete')
}
