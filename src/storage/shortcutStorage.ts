import { db } from './db'
import type { ScheduledShortcut, ShortcutSchedule } from './types'
import { generateId } from './types'

export async function createShortcut(
  data: Omit<ScheduledShortcut, 'id' | 'createdAt' | 'enabled'>
): Promise<ScheduledShortcut> {
  const shortcut: ScheduledShortcut = {
    ...data,
    id: generateId(),
    enabled: true,
    createdAt: Date.now(),
  }
  await db.shortcuts.add(shortcut)
  return shortcut
}

export async function updateShortcut(
  id: string,
  updates: Partial<Omit<ScheduledShortcut, 'id' | 'createdAt'>>
): Promise<void> {
  await db.shortcuts.update(id, updates)
}

export async function deleteShortcut(id: string): Promise<void> {
  await db.shortcuts.delete(id)
}

export async function getShortcut(id: string): Promise<ScheduledShortcut | undefined> {
  return db.shortcuts.get(id)
}

export async function getAllShortcuts(): Promise<ScheduledShortcut[]> {
  return db.shortcuts.orderBy('createdAt').reverse().toArray()
}

export async function getEnabledShortcuts(): Promise<ScheduledShortcut[]> {
  return db.shortcuts.where('enabled').equals(1).toArray()
}

export async function markShortcutRun(
  id: string,
  status: 'success' | 'error',
  error?: string
): Promise<void> {
  await db.shortcuts.update(id, {
    lastRunAt: Date.now(),
    lastRunStatus: status,
    lastRunError: error,
  })
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
