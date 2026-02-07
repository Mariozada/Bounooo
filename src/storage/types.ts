import type { ToolCallInfo } from '@agent/index'

export interface Thread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
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
  // Model info (for assistant messages)
  model?: string      // e.g., "claude-sonnet-4-20250514"
  provider?: string   // e.g., "anthropic"
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

import type { ProviderType } from '@shared/settings'

export interface ShortcutSchedule {
  type: 'once' | 'recurring'
  /** Timestamp (ms) for one-shot schedule */
  date?: number
  /** Interval in minutes for recurring schedule */
  intervalMinutes?: number
  /** Human-readable label, e.g. "Every 30 minutes" */
  label?: string
}

export interface ScheduledShortcut {
  id: string
  name: string
  prompt: string
  startUrl: string
  schedule: ShortcutSchedule
  /** Override provider — falls back to user's current setting if undefined */
  provider?: ProviderType
  /** Override model — falls back to user's current setting if undefined */
  model?: string
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastRunStatus?: 'success' | 'error'
  lastRunError?: string
}

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
