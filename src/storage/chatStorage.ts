import { db } from './db'
import type { Thread, StoredMessage, StoredAttachment, ThreadBranchState } from './types'
import {
  generateId,
  generateThreadTitle,
  ATTACHMENT_SIZE_LIMIT,
} from './types'
import type { AttachmentFile } from '@ui/components/FileAttachment'
import type { ToolCallInfo } from '@agent/index'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[ChatStorage]', ...args)

// ============================================================================
// Thread Operations
// ============================================================================

export async function createThread(firstMessage?: string): Promise<Thread> {
  const now = Date.now()
  const thread: Thread = {
    id: generateId(),
    title: firstMessage ? generateThreadTitle(firstMessage) : 'New Chat',
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    archived: false,
  }

  await db.threads.add(thread)
  log('Created thread:', thread.id)
  return thread
}

export async function getThread(id: string): Promise<Thread | undefined> {
  return db.threads.get(id)
}

export async function getAllThreads(includeArchived = false): Promise<Thread[]> {
  let query = db.threads.orderBy('updatedAt').reverse()
  if (!includeArchived) {
    query = query.filter((t) => !t.archived)
  }
  return query.toArray()
}

export async function updateThread(
  id: string,
  updates: Partial<Pick<Thread, 'title' | 'archived' | 'updatedAt'>>
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

export async function archiveThread(id: string): Promise<void> {
  await updateThread(id, { archived: true })
}

export async function unarchiveThread(id: string): Promise<void> {
  await updateThread(id, { archived: false })
}

// ============================================================================
// Message Operations
// ============================================================================

export interface MessageInput {
  role: 'user' | 'assistant'
  content: string
  parentId?: string | null
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  attachments?: AttachmentFile[]
}

export async function addMessage(
  threadId: string,
  input: MessageInput
): Promise<StoredMessage> {
  const messageId = generateId()
  const now = Date.now()

  // Store attachments if present
  const attachmentIds: string[] = []
  if (input.attachments && input.attachments.length > 0) {
    for (const att of input.attachments) {
      const stored = await storeAttachment(threadId, messageId, att)
      attachmentIds.push(stored.id)
    }
  }

  const message: StoredMessage = {
    id: messageId,
    threadId,
    parentId: input.parentId ?? null,
    role: input.role,
    content: input.content,
    reasoning: input.reasoning,
    toolCalls: input.toolCalls,
    attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    createdAt: now,
  }

  await db.messages.add(message)

  // Update thread's message count and timestamp
  const thread = await db.threads.get(threadId)
  if (thread) {
    await db.threads.update(threadId, {
      messageCount: thread.messageCount + 1,
      updatedAt: now,
      // Update title from first user message if still "New Chat"
      ...(thread.title === 'New Chat' && input.role === 'user' && input.content
        ? { title: generateThreadTitle(input.content) }
        : {}),
    })
  }

  log('Added message:', messageId, 'to thread:', threadId, 'parent:', input.parentId)
  return message
}

export async function getMessage(id: string): Promise<StoredMessage | undefined> {
  return db.messages.get(id)
}

export async function getMessages(threadId: string): Promise<StoredMessage[]> {
  return db.messages.where('threadId').equals(threadId).sortBy('createdAt')
}

export async function updateMessage(
  id: string,
  updates: Partial<Pick<StoredMessage, 'content' | 'reasoning' | 'toolCalls'>>
): Promise<void> {
  await db.messages.update(id, updates)
  log('Updated message:', id)
}

export async function deleteMessage(id: string): Promise<void> {
  // Delete attachments for this message
  await db.attachments.where('messageId').equals(id).delete()
  // Delete the message
  await db.messages.delete(id)
  log('Deleted message:', id)
}

// ============================================================================
// Tree Operations
// ============================================================================

/**
 * Get all children of a message (messages that have this message as parent)
 */
export async function getChildMessages(
  parentId: string | null,
  threadId: string
): Promise<StoredMessage[]> {
  const all = await db.messages.where('threadId').equals(threadId).toArray()
  return all
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Get siblings of a message (messages with the same parentId)
 */
export async function getSiblings(messageId: string): Promise<StoredMessage[]> {
  const message = await db.messages.get(messageId)
  if (!message) return []

  const all = await db.messages.where('threadId').equals(message.threadId).toArray()
  return all
    .filter((m) => m.parentId === message.parentId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Get sibling info for a message
 */
export async function getSiblingInfo(messageId: string): Promise<{
  siblings: StoredMessage[]
  currentIndex: number
  total: number
} | null> {
  const siblings = await getSiblings(messageId)
  if (siblings.length === 0) return null

  const currentIndex = siblings.findIndex((m) => m.id === messageId)
  return {
    siblings,
    currentIndex,
    total: siblings.length,
  }
}

/**
 * Delete a message and all its descendants (for regenerate)
 */
export async function deleteMessageTree(messageId: string): Promise<void> {
  const message = await db.messages.get(messageId)
  if (!message) return

  // Get all messages in thread
  const allMessages = await db.messages.where('threadId').equals(message.threadId).toArray()

  // Find all descendants using BFS
  const toDelete = new Set<string>([messageId])
  const queue = [messageId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const children = allMessages.filter((m) => m.parentId === currentId)
    for (const child of children) {
      if (!toDelete.has(child.id)) {
        toDelete.add(child.id)
        queue.push(child.id)
      }
    }
  }

  // Delete all found messages and their attachments
  for (const id of toDelete) {
    await db.attachments.where('messageId').equals(id).delete()
    await db.messages.delete(id)
  }

  log('Deleted message tree:', messageId, 'total deleted:', toDelete.size)
}

/**
 * Build the active conversation path through the tree
 */
export async function buildActiveConversation(
  threadId: string,
  activePath: Record<string, string>
): Promise<StoredMessage[]> {
  const allMessages = await getMessages(threadId)
  const result: StoredMessage[] = []
  let currentParentId: string | null = null

  while (true) {
    // Find children of current parent
    const children = allMessages.filter((m) => m.parentId === currentParentId)
    if (children.length === 0) break

    // Pick active child (use "root" as key for null parentId)
    const pathKey = currentParentId ?? 'root'
    const activeChildId = activePath[pathKey]
    const activeChild = activeChildId
      ? children.find((m) => m.id === activeChildId)
      : null

    // Default to latest child if not found in path
    const selectedChild = activeChild || children[children.length - 1]

    result.push(selectedChild)
    currentParentId = selectedChild.id
  }

  return result
}

// ============================================================================
// Branch State Operations
// ============================================================================

export async function getBranchState(threadId: string): Promise<Record<string, string>> {
  const state = await db.branchStates.get(threadId)
  return state?.activePath ?? {}
}

export async function saveBranchState(
  threadId: string,
  activePath: Record<string, string>
): Promise<void> {
  await db.branchStates.put({ threadId, activePath })
  log('Saved branch state:', threadId, activePath)
}

export async function updateBranchState(
  threadId: string,
  parentId: string | null,
  activeChildId: string
): Promise<void> {
  const current = await getBranchState(threadId)
  const pathKey = parentId ?? 'root'
  const updated = { ...current, [pathKey]: activeChildId }
  await saveBranchState(threadId, updated)
}

// ============================================================================
// Attachment Operations
// ============================================================================

async function storeAttachment(
  threadId: string,
  messageId: string,
  file: AttachmentFile
): Promise<StoredAttachment> {
  const shouldStore = file.file.size <= ATTACHMENT_SIZE_LIMIT

  const attachment: StoredAttachment = {
    id: file.id,
    messageId,
    threadId,
    type: file.type,
    filename: file.file.name,
    mediaType: file.mediaType,
    size: file.file.size,
    dataUrl: shouldStore ? file.dataUrl : null,
    stored: shouldStore,
  }

  await db.attachments.add(attachment)
  log('Stored attachment:', file.id, 'stored:', shouldStore)
  return attachment
}

export async function getAttachments(
  messageId: string
): Promise<StoredAttachment[]> {
  return db.attachments.where('messageId').equals(messageId).toArray()
}

export async function getAttachmentsByThread(
  threadId: string
): Promise<StoredAttachment[]> {
  return db.attachments.where('threadId').equals(threadId).toArray()
}

// ============================================================================
// Cleanup Operations
// ============================================================================

export async function deleteAllThreads(): Promise<void> {
  await db.branchStates.clear()
  await db.attachments.clear()
  await db.messages.clear()
  await db.threads.clear()
  log('Deleted all data')
}

export async function deleteArchivedThreads(): Promise<void> {
  const archived = await db.threads.where('archived').equals(1).toArray()
  for (const thread of archived) {
    await deleteThread(thread.id)
  }
  log('Deleted', archived.length, 'archived threads')
}

export async function getStorageStats(): Promise<{
  threadCount: number
  messageCount: number
  attachmentCount: number
  estimatedSizeBytes: number
}> {
  const threads = await db.threads.count()
  const messages = await db.messages.count()
  const attachments = await db.attachments.toArray()

  // Estimate storage size (very rough)
  let estimatedSize = 0
  for (const att of attachments) {
    if (att.dataUrl) {
      estimatedSize += att.dataUrl.length
    }
    estimatedSize += 200 // metadata overhead
  }

  return {
    threadCount: threads,
    messageCount: messages,
    attachmentCount: attachments.length,
    estimatedSizeBytes: estimatedSize,
  }
}

// ============================================================================
// Utility: Convert stored attachments back to AttachmentFile format
// ============================================================================

export function storedAttachmentToAttachmentFile(
  stored: StoredAttachment
): AttachmentFile | null {
  if (!stored.stored || !stored.dataUrl) {
    return null
  }

  return {
    id: stored.id,
    file: new File([], stored.filename, { type: stored.mediaType }),
    dataUrl: stored.dataUrl,
    type: stored.type,
    mediaType: stored.mediaType,
  }
}
