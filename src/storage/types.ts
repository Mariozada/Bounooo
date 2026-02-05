import type { ToolCallInfo } from '@agent/index'

export interface Thread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  archived: boolean
}

export interface StoredMessage {
  id: string
  threadId: string
  parentId: string | null  // Parent message in tree (null for first message)
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  attachmentIds?: string[]
  createdAt: number
}

// Tracks which branch is active at each fork point in a thread
export interface ThreadBranchState {
  threadId: string  // Primary key
  // Map of parentId -> activeChildId
  // Use "root" as key for messages with parentId = null
  activePath: Record<string, string>
}

export interface StoredAttachment {
  id: string
  messageId: string
  threadId: string
  type: 'image' | 'file'
  filename: string
  mediaType: string
  size: number
  dataUrl: string | null  // null if file was too large to store
  stored: boolean
}

// Size threshold for storing attachments (5MB)
export const ATTACHMENT_SIZE_LIMIT = 5 * 1024 * 1024

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function generateThreadTitle(firstMessage: string): string {
  // Extract first ~50 chars, trim to last word boundary
  const text = firstMessage.trim()
  if (text.length <= 50) return text || 'New Chat'

  const truncated = text.slice(0, 50)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...'
}
