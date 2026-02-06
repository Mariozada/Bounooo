/**
 * Chat Export/Import functionality
 * Handles exporting chat history to JSON and importing from backup
 */

import { db } from './db'
import type { Thread, StoredMessage, StoredAttachment } from './types'

const log = (...args: unknown[]) => console.log('[ChatExport]', ...args)

// Export format version for future compatibility
const EXPORT_VERSION = 1

export interface ChatExportData {
  version: number
  exportedAt: number
  threads: ExportedThread[]
}

export interface ExportedThread {
  thread: Thread
  messages: StoredMessage[]
  attachments: StoredAttachment[]
}

/**
 * Export all chat data to JSON
 */
export async function exportAllChats(): Promise<ChatExportData> {
  const threads = await db.threads.toArray()
  const exportedThreads: ExportedThread[] = []

  for (const thread of threads) {
    const messages = await db.messages.where('threadId').equals(thread.id).toArray()
    const attachments = await db.attachments.where('threadId').equals(thread.id).toArray()

    exportedThreads.push({
      thread,
      messages,
      attachments,
    })
  }

  const exportData: ChatExportData = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    threads: exportedThreads,
  }

  log('Exported', threads.length, 'threads')
  return exportData
}

/**
 * Download export data as a JSON file
 */
export function downloadExport(data: ChatExportData, filename?: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename || `bouno-chats-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  log('Downloaded export file')
}

/**
 * Export and download all chats
 */
export async function exportAndDownload(): Promise<void> {
  const data = await exportAllChats()
  downloadExport(data)
}

/**
 * Validate import data structure
 */
function validateImportData(data: unknown): data is ChatExportData {
  if (!data || typeof data !== 'object') return false

  const d = data as Record<string, unknown>
  if (typeof d.version !== 'number') return false
  if (typeof d.exportedAt !== 'number') return false
  if (!Array.isArray(d.threads)) return false

  // Basic validation of thread structure
  for (const item of d.threads) {
    if (!item || typeof item !== 'object') return false
    const t = item as Record<string, unknown>
    if (!t.thread || !t.messages || !t.attachments) return false
  }

  return true
}

export interface ImportResult {
  success: boolean
  threadsImported: number
  messagesImported: number
  attachmentsImported: number
  error?: string
}

/**
 * Import chat data from JSON
 * @param data - The exported chat data
 * @param mergeStrategy - 'replace' clears existing data, 'merge' adds to existing
 */
export async function importChats(
  data: ChatExportData,
  mergeStrategy: 'replace' | 'merge' = 'merge'
): Promise<ImportResult> {
  if (!validateImportData(data)) {
    return {
      success: false,
      threadsImported: 0,
      messagesImported: 0,
      attachmentsImported: 0,
      error: 'Invalid import data format',
    }
  }

  try {
    if (mergeStrategy === 'replace') {
      // Clear existing data
      await db.attachments.clear()
      await db.messages.clear()
      await db.branchStates.clear()
      await db.threads.clear()
      log('Cleared existing data')
    }

    let threadsImported = 0
    let messagesImported = 0
    let attachmentsImported = 0

    for (const { thread, messages, attachments } of data.threads) {
      // Check if thread already exists (for merge strategy)
      const existingThread = await db.threads.get(thread.id)
      if (existingThread && mergeStrategy === 'merge') {
        log('Skipping existing thread:', thread.id)
        continue
      }

      // Import thread
      await db.threads.put(thread)
      threadsImported++

      // Import messages
      for (const message of messages) {
        await db.messages.put(message)
        messagesImported++
      }

      // Import attachments
      for (const attachment of attachments) {
        await db.attachments.put(attachment)
        attachmentsImported++
      }
    }

    log('Imported', threadsImported, 'threads,', messagesImported, 'messages,', attachmentsImported, 'attachments')

    return {
      success: true,
      threadsImported,
      messagesImported,
      attachmentsImported,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    log('Import error:', error)
    return {
      success: false,
      threadsImported: 0,
      messagesImported: 0,
      attachmentsImported: 0,
      error,
    }
  }
}

/**
 * Read a file and parse as import data
 */
export async function readImportFile(file: File): Promise<ChatExportData | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const data = JSON.parse(text)
        if (validateImportData(data)) {
          resolve(data)
        } else {
          log('Invalid import file format')
          resolve(null)
        }
      } catch (err) {
        log('Failed to parse import file:', err)
        resolve(null)
      }
    }
    reader.onerror = () => {
      log('Failed to read import file')
      resolve(null)
    }
    reader.readAsText(file)
  })
}
