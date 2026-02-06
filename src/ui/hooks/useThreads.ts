import { useState, useEffect, useCallback, useRef } from 'react'
import type { Thread, StoredMessage } from '@storage/types'
import {
  createThread,
  getThread,
  getAllThreads,
  updateThread,
  deleteThread,
  addMessage,
  getMessages,
  getMessage,
  updateMessage,
  getAttachments,
  deleteAllThreads,
  getStorageStats,
  storedAttachmentToAttachmentFile,
  buildActiveConversation,
  getBranchState,
  updateBranchState,
  getSiblings,
  deleteMessageTree,
  type MessageInput,
} from '@storage/chatStorage'
import type { AttachmentFile } from '@ui/components/FileAttachment'
import type { ToolCallInfo } from '@agent/index'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[useThreads]', ...args)

// Storage key for persisting the last active thread
const LAST_THREAD_KEY = 'browserun_last_thread_id'

// Helper to save last active thread ID to chrome.storage
async function saveLastThreadId(threadId: string | null): Promise<void> {
  try {
    if (threadId) {
      await chrome.storage.local.set({ [LAST_THREAD_KEY]: threadId })
    } else {
      await chrome.storage.local.remove(LAST_THREAD_KEY)
    }
    log('Saved last thread ID:', threadId)
  } catch (e) {
    console.error('[useThreads] Failed to save last thread ID:', e)
  }
}

// Helper to load last active thread ID from chrome.storage
async function loadLastThreadId(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(LAST_THREAD_KEY)
    const threadId = result[LAST_THREAD_KEY] ?? null
    log('Loaded last thread ID:', threadId)
    return threadId
  } catch (e) {
    console.error('[useThreads] Failed to load last thread ID:', e)
    return null
  }
}

export interface ThreadMessage {
  id: string
  parentId: string | null
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  attachments?: AttachmentFile[]
  // Branch info (populated when loading)
  siblingCount?: number
  siblingIndex?: number
  // Model info (for assistant messages)
  model?: string
  provider?: string
}

// Extended return type to include threadId for coordination
export interface AddUserMessageResult extends ThreadMessage {
  threadId: string
}

export interface UseThreadsReturn {
  // Thread list
  threads: Thread[]
  isLoading: boolean
  currentThreadId: string | null

  // Thread actions
  createNewThread: () => Promise<Thread>
  selectThread: (id: string) => Promise<void>
  deleteCurrentThread: () => Promise<void>
  renameThread: (id: string, title: string) => Promise<void>

  // Current thread messages (active path through tree)
  messages: ThreadMessage[]

  // Message actions
  addUserMessage: (content: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  addAssistantMessage: (threadId?: string, parentId?: string, modelInfo?: { model: string; provider: string }) => Promise<ThreadMessage>
  updateAssistantMessage: (
    id: string,
    updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string }
  ) => void
  clearCurrentThread: () => Promise<void>

  // Branch operations
  editUserMessage: (messageId: string, newContent: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  navigateBranch: (messageId: string, direction: 'prev' | 'next') => Promise<void>
  regenerateAssistant: (messageId: string) => Promise<void>

  // Cleanup
  deleteAllData: () => Promise<void>
  getStats: () => Promise<{ threadCount: number; messageCount: number; attachmentCount: number; estimatedSizeBytes: number }>

  // Refresh
  refresh: () => Promise<void>
}

export function useThreads(): UseThreadsReturn {
  const [threads, setThreads] = useState<Thread[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [branchState, setBranchState] = useState<Record<string, string>>({})

  // Refs for synchronous access
  const currentThreadIdRef = useRef<string | null>(null)
  const branchStateRef = useRef<Record<string, string>>({})
  const messagesRef = useRef<ThreadMessage[]>([])

  // RAF batching for streaming updates
  const pendingUpdateRef = useRef<{ id: string; updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string } } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  // Keep refs in sync (currentThreadId and branchState still use effects, messages are synced inline)
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId
  }, [currentThreadId])

  useEffect(() => {
    branchStateRef.current = branchState
  }, [branchState])

  // Helper to update messages state and ref together
  const setMessagesWithRef = useCallback((updater: ThreadMessage[] | ((prev: ThreadMessage[]) => ThreadMessage[])) => {
    if (typeof updater === 'function') {
      setMessages((prev) => {
        const next = updater(prev)
        messagesRef.current = next
        return next
      })
    } else {
      messagesRef.current = updater
      setMessages(updater)
    }
  }, [])

  // Load threads on mount and restore last active thread
  useEffect(() => {
    loadThreads()
  }, [])

  const loadThreads = useCallback(async () => {
    try {
      setIsLoading(true)
      const allThreads = await getAllThreads()
      setThreads(allThreads)
      log('Loaded threads:', allThreads.length)

      // Restore last active thread if it exists
      const lastThreadId = await loadLastThreadId()
      if (lastThreadId && allThreads.some((t) => t.id === lastThreadId)) {
        setCurrentThreadId(lastThreadId)
        currentThreadIdRef.current = lastThreadId
        // Load messages for the restored thread
        const state = await getBranchState(lastThreadId)
        setBranchState(state)
        branchStateRef.current = state
        const storedMessages = await buildActiveConversation(lastThreadId, state)
        const allMessages = await getMessages(lastThreadId)
        const threadMessages: ThreadMessage[] = []

        for (const msg of storedMessages) {
          let attachments: AttachmentFile[] | undefined
          if (msg.attachmentIds && msg.attachmentIds.length > 0) {
            const storedAttachments = await getAttachments(msg.id)
            attachments = storedAttachments
              .map(storedAttachmentToAttachmentFile)
              .filter((a): a is AttachmentFile => a !== null)
          }
          const siblings = allMessages.filter((m) => m.parentId === msg.parentId)
          const siblingIndex = siblings.findIndex((m) => m.id === msg.id)
          threadMessages.push({
            id: msg.id,
            parentId: msg.parentId,
            role: msg.role,
            content: msg.content,
            reasoning: msg.reasoning,
            toolCalls: msg.toolCalls,
            attachments,
            siblingCount: siblings.length,
            siblingIndex,
            model: msg.model,
            provider: msg.provider,
          })
        }
        setMessagesWithRef(threadMessages)
        log('Restored last active thread:', lastThreadId)
      }
    } catch (err) {
      console.error('[useThreads] Failed to load threads:', err)
    } finally {
      setIsLoading(false)
    }
  }, [setMessagesWithRef])

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      // Load branch state for this thread
      const state = await getBranchState(threadId)
      setBranchState(state)
      branchStateRef.current = state

      // Build active conversation path
      const storedMessages = await buildActiveConversation(threadId, state)
      const threadMessages: ThreadMessage[] = []

      // Get all messages for sibling counting
      const allMessages = await getMessages(threadId)

      for (const msg of storedMessages) {
        let attachments: AttachmentFile[] | undefined

        if (msg.attachmentIds && msg.attachmentIds.length > 0) {
          const storedAttachments = await getAttachments(msg.id)
          attachments = storedAttachments
            .map(storedAttachmentToAttachmentFile)
            .filter((a): a is AttachmentFile => a !== null)
        }

        // Count siblings
        const siblings = allMessages.filter((m) => m.parentId === msg.parentId)
        const siblingIndex = siblings.findIndex((m) => m.id === msg.id)

        threadMessages.push({
          id: msg.id,
          parentId: msg.parentId,
          role: msg.role,
          content: msg.content,
          reasoning: msg.reasoning,
          toolCalls: msg.toolCalls,
          attachments,
          siblingCount: siblings.length,
          siblingIndex,
          model: msg.model,
          provider: msg.provider,
        })
      }

      setMessagesWithRef(threadMessages)
      log('Loaded messages for thread:', threadId, threadMessages.length)
    } catch (err) {
      console.error('[useThreads] Failed to load messages:', err)
      setMessagesWithRef([])
    }
  }, [setMessagesWithRef])

  const createNewThread = useCallback(async (): Promise<Thread> => {
    const thread = await createThread()
    setThreads((prev) => [thread, ...prev])
    setCurrentThreadId(thread.id)
    currentThreadIdRef.current = thread.id
    await saveLastThreadId(thread.id)
    setMessagesWithRef([])
    setBranchState({})
    branchStateRef.current = {}
    log('Created new thread:', thread.id)
    return thread
  }, [setMessagesWithRef])

  const selectThread = useCallback(async (id: string) => {
    setCurrentThreadId(id)
    currentThreadIdRef.current = id
    await saveLastThreadId(id)
    await loadMessages(id)
    log('Selected thread:', id)
  }, [loadMessages])

  const deleteCurrentThread = useCallback(async () => {
    const threadId = currentThreadIdRef.current
    if (!threadId) return

    await deleteThread(threadId)
    setThreads((prev) => prev.filter((t) => t.id !== threadId))
    setCurrentThreadId(null)
    currentThreadIdRef.current = null
    await saveLastThreadId(null)
    setMessagesWithRef([])
    setBranchState({})
    branchStateRef.current = {}
    log('Deleted current thread:', threadId)
  }, [setMessagesWithRef])


  const renameThread = useCallback(async (id: string, title: string) => {
    await updateThread(id, { title })
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    )
    log('Renamed thread:', id, title)
  }, [])

  // Get the parent ID for the next message (last message in current path)
  const getLastMessageId = useCallback((): string | null => {
    const msgs = messagesRef.current
    return msgs.length > 0 ? msgs[msgs.length - 1].id : null
  }, [])

  const addUserMessage = useCallback(
    async (content: string, attachments?: AttachmentFile[]): Promise<AddUserMessageResult> => {
      let threadId = currentThreadIdRef.current

      // Create a new thread if none exists
      if (!threadId) {
        const thread = await createThread(content)
        setThreads((prev) => [thread, ...prev])
        setCurrentThreadId(thread.id)
        currentThreadIdRef.current = thread.id
        await saveLastThreadId(thread.id)
        threadId = thread.id
      }

      // Parent is the last message in the conversation
      const parentId = getLastMessageId()

      const input: MessageInput = {
        role: 'user',
        content,
        parentId,
        attachments,
      }

      const stored = await addMessage(threadId, input)

      const message: AddUserMessageResult = {
        id: stored.id,
        parentId: stored.parentId,
        role: 'user',
        content,
        attachments,
        threadId,
        siblingCount: 1,
        siblingIndex: 0,
      }

      setMessagesWithRef((prev) => [...prev, message])

      // Update thread in list (for title/timestamp)
      const updatedThread = await getThread(threadId)
      if (updatedThread) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? updatedThread : t))
        )
      }

      log('Added user message:', stored.id, 'to thread:', threadId)
      return message
    },
    [getLastMessageId, setMessagesWithRef]
  )

  const addAssistantMessage = useCallback(async (
    threadIdOverride?: string,
    parentIdOverride?: string,
    modelInfo?: { model: string; provider: string }
  ): Promise<ThreadMessage> => {
    const threadId = threadIdOverride ?? currentThreadIdRef.current

    if (!threadId) {
      throw new Error('No current thread')
    }

    // Parent is either explicitly provided or the last message in the conversation
    const parentId = parentIdOverride ?? getLastMessageId()

    const input: MessageInput = {
      role: 'assistant',
      content: '',
      parentId,
      model: modelInfo?.model,
      provider: modelInfo?.provider,
    }

    const stored = await addMessage(threadId, input)

    const message: ThreadMessage = {
      id: stored.id,
      parentId: stored.parentId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      siblingCount: 1,
      siblingIndex: 0,
      model: modelInfo?.model,
      provider: modelInfo?.provider,
    }

    setMessagesWithRef((prev) => [...prev, message])
    log('Added assistant message:', stored.id)
    return message
  }, [getLastMessageId, setMessagesWithRef])

  const updateAssistantMessage = useCallback(
    (
      id: string,
      updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string }
    ) => {
      // Queue the update for RAF batching (for smooth streaming)
      pendingUpdateRef.current = { id, updates }

      // Schedule RAF if not already scheduled
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const pending = pendingUpdateRef.current
          if (!pending) return

          // Apply the batched update
          setMessagesWithRef((prev) =>
            prev.map((m) =>
              m.id === pending.id ? { ...m, ...pending.updates } : m
            )
          )

          // Persist to storage (debounced by caller, or we can add debounce here)
          updateMessage(pending.id, pending.updates)
          pendingUpdateRef.current = null
        })
      }
    },
    [setMessagesWithRef]
  )

  const clearCurrentThread = useCallback(async () => {
    const threadId = currentThreadIdRef.current
    if (!threadId) return

    await deleteThread(threadId)
    setThreads((prev) => prev.filter((t) => t.id !== threadId))
    setCurrentThreadId(null)
    currentThreadIdRef.current = null
    await saveLastThreadId(null)
    setMessagesWithRef([])
    setBranchState({})
    branchStateRef.current = {}
    log('Cleared current thread')
  }, [setMessagesWithRef])

  // ============================================================================
  // Branch Operations
  // ============================================================================

  /**
   * Edit a user message - creates a new sibling branch
   * Returns the new message so caller can trigger assistant response
   */
  const editUserMessage = useCallback(
    async (messageId: string, newContent: string, attachments?: AttachmentFile[]): Promise<AddUserMessageResult> => {
      const threadId = currentThreadIdRef.current
      if (!threadId) throw new Error('No current thread')

      // Get the original message to find its parent
      const originalMessage = await getMessage(messageId)
      if (!originalMessage) throw new Error('Message not found')

      // Create new user message as sibling (same parent)
      const input: MessageInput = {
        role: 'user',
        content: newContent,
        parentId: originalMessage.parentId,
        attachments,
      }

      const stored = await addMessage(threadId, input)

      // Update branch state to point to new message
      await updateBranchState(threadId, originalMessage.parentId, stored.id)

      // Reload messages to reflect new branch
      await loadMessages(threadId)

      // Get the newly added message from state
      const newMessages = messagesRef.current
      const newUserMessage = newMessages.find((m) => m.id === stored.id)

      log('Edited user message, created branch:', stored.id)

      return {
        id: stored.id,
        parentId: stored.parentId,
        role: 'user',
        content: newContent,
        attachments,
        threadId,
        siblingCount: newUserMessage?.siblingCount,
        siblingIndex: newUserMessage?.siblingIndex,
      }
    },
    [loadMessages]
  )

  /**
   * Navigate to previous or next sibling branch
   */
  const navigateBranch = useCallback(
    async (messageId: string, direction: 'prev' | 'next') => {
      const threadId = currentThreadIdRef.current
      if (!threadId) return

      // Get siblings
      const siblings = await getSiblings(messageId)
      if (siblings.length <= 1) return

      const currentIndex = siblings.findIndex((m) => m.id === messageId)
      if (currentIndex === -1) return

      const newIndex = direction === 'prev'
        ? Math.max(0, currentIndex - 1)
        : Math.min(siblings.length - 1, currentIndex + 1)

      if (newIndex === currentIndex) return

      const newMessage = siblings[newIndex]

      // Update branch state
      await updateBranchState(threadId, newMessage.parentId, newMessage.id)

      // Reload messages
      await loadMessages(threadId)

      log('Navigated branch:', direction, 'to message:', newMessage.id)
    },
    [loadMessages]
  )

  /**
   * Regenerate assistant response - deletes current and creates new
   */
  const regenerateAssistant = useCallback(
    async (messageId: string) => {
      const threadId = currentThreadIdRef.current
      if (!threadId) return

      // Get the assistant message
      const assistantMessage = await getMessage(messageId)
      if (!assistantMessage || assistantMessage.role !== 'assistant') return

      // Delete the assistant message and all its descendants
      await deleteMessageTree(messageId)

      // Reload messages (will stop at the user message)
      await loadMessages(threadId)

      log('Deleted assistant message for regeneration:', messageId)
    },
    [loadMessages]
  )

  // ============================================================================
  // Cleanup
  // ============================================================================

  const deleteAllData = useCallback(async () => {
    await deleteAllThreads()
    setThreads([])
    setCurrentThreadId(null)
    currentThreadIdRef.current = null
    await saveLastThreadId(null)
    setMessagesWithRef([])
    setBranchState({})
    branchStateRef.current = {}
    log('Deleted all data')
  }, [setMessagesWithRef])

  const getStats = useCallback(async () => {
    return getStorageStats()
  }, [])

  const refresh = useCallback(async () => {
    await loadThreads()
    const threadId = currentThreadIdRef.current
    if (threadId) {
      await loadMessages(threadId)
    }
  }, [loadThreads, loadMessages])

  return {
    threads,
    isLoading,
    currentThreadId,
    createNewThread,
    selectThread,
    deleteCurrentThread,
    renameThread,
    messages,
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    clearCurrentThread,
    editUserMessage,
    navigateBranch,
    regenerateAssistant,
    deleteAllData,
    getStats,
    refresh,
  }
}
