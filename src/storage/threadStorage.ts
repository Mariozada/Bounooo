import { db } from './db'
import type { Thread } from './types'
import { generateId, generateThreadTitle } from './types'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[ThreadStorage]', ...args)

export async function createThread(firstMessage?: string): Promise<Thread> {
  const now = Date.now()
  const thread: Thread = {
    id: generateId(),
    title: firstMessage ? generateThreadTitle(firstMessage) : 'New Chat',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  }

  await db.threads.add(thread)
  log('Created thread:', thread.id)
  return thread
}

export async function getThread(id: string): Promise<Thread | undefined> {
  return db.threads.get(id)
}

export async function getAllThreads(): Promise<Thread[]> {
  return db.threads.orderBy('updatedAt').reverse().toArray()
}

export async function updateThread(
  id: string,
  updates: Partial<Pick<Thread, 'title' | 'updatedAt'>>
): Promise<void> {
  await db.threads.update(id, {
    ...updates,
    updatedAt: updates.updatedAt ?? Date.now(),
  })
  log('Updated thread:', id, updates)
}

export async function deleteThread(id: string): Promise<void> {
  // Delete branch state
  await db.branchStates.delete(id)
  // Delete all attachments for this thread
  await db.attachments.where('threadId').equals(id).delete()
  // Delete all messages for this thread
  await db.messages.where('threadId').equals(id).delete()
  // Delete the thread
  await db.threads.delete(id)
  log('Deleted thread:', id)
}

export async function deleteAllThreads(): Promise<void> {
  await db.branchStates.clear()
  await db.attachments.clear()
  await db.messages.clear()
  await db.threads.clear()
  log('Deleted all data')
}
