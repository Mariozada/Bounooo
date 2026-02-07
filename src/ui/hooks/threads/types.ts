import type { Thread } from '@storage/types'
import type { AttachmentFile } from '@ui/components/FileAttachment'
import type { ToolCallInfo } from '@agent/index'

export interface ThreadMessage {
  id: string
  parentId: string | null
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  attachments?: AttachmentFile[]
  siblingCount?: number
  siblingIndex?: number
  model?: string
  provider?: string
}

export interface AddUserMessageResult extends ThreadMessage {
  threadId: string
}

export interface UseThreadsReturn {
  threads: Thread[]
  isLoading: boolean
  currentThreadId: string | null
  createNewThread: () => Promise<Thread>
  selectThread: (id: string) => Promise<void>
  deleteCurrentThread: () => Promise<void>
  renameThread: (id: string, title: string) => Promise<void>
  messages: ThreadMessage[]
  addUserMessage: (content: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  addAssistantMessage: (threadId?: string, parentId?: string, modelInfo?: { model: string; provider: string }) => Promise<ThreadMessage>
  updateAssistantMessage: (
    id: string,
    updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string }
  ) => void
  clearCurrentThread: () => Promise<void>
  editUserMessage: (messageId: string, newContent: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  navigateBranch: (messageId: string, direction: 'prev' | 'next') => Promise<void>
  regenerateAssistant: (messageId: string, modelInfo?: { model: string; provider: string }) => Promise<AddUserMessageResult | null>
  deleteAllData: () => Promise<void>
  getStats: () => Promise<{ threadCount: number; messageCount: number; attachmentCount: number; estimatedSizeBytes: number }>
  refresh: () => Promise<void>
}

// Storage key for persisting the last active thread
export const LAST_THREAD_KEY = 'bouno_last_thread_id'

export async function saveLastThreadId(threadId: string | null): Promise<void> {
  try {
    if (threadId) {
      await chrome.storage.local.set({ [LAST_THREAD_KEY]: threadId })
    } else {
      await chrome.storage.local.remove(LAST_THREAD_KEY)
    }
  } catch (e) {
    console.error('[useThreads] Failed to save last thread ID:', e)
  }
}

export async function loadLastThreadId(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(LAST_THREAD_KEY)
    return result[LAST_THREAD_KEY] ?? null
  } catch (e) {
    console.error('[useThreads] Failed to load last thread ID:', e)
    return null
  }
}
