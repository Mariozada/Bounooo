import { db } from './db'
import type { StoredMessage } from './types'
import { generateId, generateThreadTitle } from './types'
import type { AttachmentFile } from '@ui/components/FileAttachment'
import type { ToolCallInfo } from '@agent/index'
import { storeAttachment } from './attachmentStorage'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[MessageStorage]', ...args)

export interface MessageInput {
  role: 'user' | 'assistant'
  content: string
  parentId?: string | null
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  attachments?: AttachmentFile[]
  model?: string
  provider?: string
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
    model: input.model,
    provider: input.provider,
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
  updates: Partial<Pick<StoredMessage, 'content' | 'reasoning' | 'toolCalls' | 'model' | 'provider'>>
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

// Tree Operations

export async function getChildMessages(
  parentId: string | null,
  threadId: string
): Promise<StoredMessage[]> {
  const all = await db.messages.where('threadId').equals(threadId).toArray()
  return all
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function getSiblings(messageId: string): Promise<StoredMessage[]> {
  const message = await db.messages.get(messageId)
  if (!message) return []

  const all = await db.messages.where('threadId').equals(message.threadId).toArray()
  return all
    .filter((m) => m.parentId === message.parentId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

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
