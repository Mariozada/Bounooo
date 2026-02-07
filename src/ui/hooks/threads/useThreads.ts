import { useState, useEffect, useCallback, useRef } from 'react'
import type { Thread } from '@storage/types'
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
  type MessageInput,
} from '@storage/chatStorage'
import type { AttachmentFile } from '@ui/components/FileAttachment'
import type { ToolCallInfo } from '@agent/index'
import {
  type ThreadMessage,
  type AddUserMessageResult,
  type UseThreadsReturn,
  saveLastThreadId,
  loadLastThreadId,
} from './types'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[useThreads]', ...args)

export function useThreads(): UseThreadsReturn {
  const [threads, setThreads] = useState<Thread[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [branchState, setBranchState] = useState<Record<string, string>>({})

  const currentThreadIdRef = useRef<string | null>(null)
  const branchStateRef = useRef<Record<string, string>>({})
  const messagesRef = useRef<ThreadMessage[]>([])
  const pendingUpdateRef = useRef<{ id: string; updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string } } | null>(null)
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId
  }, [currentThreadId])

  useEffect(() => {
    branchStateRef.current = branchState
  }, [branchState])

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

  const loadMessagesForThread = useCallback(async (threadId: string) => {
    const state = await getBranchState(threadId)
    setBranchState(state)
    branchStateRef.current = state

    const storedMessages = await buildActiveConversation(threadId, state)
    const allMessages = await getMessages(threadId)
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
    log('Loaded messages for thread:', threadId, threadMessages.length)
  }, [setMessagesWithRef])

  const loadThreads = useCallback(async () => {
    try {
      setIsLoading(true)
      const allThreads = await getAllThreads()
      setThreads(allThreads)
      log('Loaded threads:', allThreads.length)

      const lastThreadId = await loadLastThreadId()
      if (lastThreadId && allThreads.some((t) => t.id === lastThreadId)) {
        setCurrentThreadId(lastThreadId)
        currentThreadIdRef.current = lastThreadId
        await loadMessagesForThread(lastThreadId)
        log('Restored last active thread:', lastThreadId)
      }
    } catch (err) {
      console.error('[useThreads] Failed to load threads:', err)
    } finally {
      setIsLoading(false)
    }
  }, [loadMessagesForThread])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  const createNewThreadAction = useCallback(async (): Promise<Thread> => {
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
    await loadMessagesForThread(id)
    log('Selected thread:', id)
  }, [loadMessagesForThread])

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

  const renameThreadAction = useCallback(async (id: string, title: string) => {
    await updateThread(id, { title })
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
    log('Renamed thread:', id, title)
  }, [])

  const getLastMessageId = useCallback((): string | null => {
    const msgs = messagesRef.current
    return msgs.length > 0 ? msgs[msgs.length - 1].id : null
  }, [])

  const addUserMessageAction = useCallback(
    async (content: string, attachments?: AttachmentFile[]): Promise<AddUserMessageResult> => {
      let threadId = currentThreadIdRef.current

      if (!threadId) {
        const thread = await createThread(content)
        setThreads((prev) => [thread, ...prev])
        setCurrentThreadId(thread.id)
        currentThreadIdRef.current = thread.id
        await saveLastThreadId(thread.id)
        threadId = thread.id
      }

      const parentId = getLastMessageId()
      const input: MessageInput = { role: 'user', content, parentId, attachments }
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

      const updatedThread = await getThread(threadId)
      if (updatedThread) {
        setThreads((prev) => prev.map((t) => (t.id === threadId ? updatedThread : t)))
      }

      log('Added user message:', stored.id, 'to thread:', threadId)
      return message
    },
    [getLastMessageId, setMessagesWithRef]
  )

  const addAssistantMessageAction = useCallback(
    async (threadIdOverride?: string, parentIdOverride?: string, modelInfo?: { model: string; provider: string }): Promise<ThreadMessage> => {
      const threadId = threadIdOverride ?? currentThreadIdRef.current
      if (!threadId) throw new Error('No current thread')

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
    },
    [getLastMessageId, setMessagesWithRef]
  )

  const updateAssistantMessageAction = useCallback(
    (id: string, updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string }) => {
      pendingUpdateRef.current = { id, updates }

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const pending = pendingUpdateRef.current
          if (!pending) return

          setMessagesWithRef((prev) => prev.map((m) => (m.id === pending.id ? { ...m, ...pending.updates } : m)))
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

  const editUserMessage = useCallback(
    async (messageId: string, newContent: string, attachments?: AttachmentFile[]): Promise<AddUserMessageResult> => {
      const threadId = currentThreadIdRef.current
      if (!threadId) throw new Error('No current thread')

      const originalMessage = await getMessage(messageId)
      if (!originalMessage) throw new Error('Message not found')

      const input: MessageInput = { role: 'user', content: newContent, parentId: originalMessage.parentId, attachments }
      const stored = await addMessage(threadId, input)

      await updateBranchState(threadId, originalMessage.parentId, stored.id)
      await loadMessagesForThread(threadId)

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
    [loadMessagesForThread]
  )

  const navigateBranch = useCallback(
    async (messageId: string, direction: 'prev' | 'next') => {
      const threadId = currentThreadIdRef.current
      if (!threadId) return

      const siblings = await getSiblings(messageId)
      if (siblings.length <= 1) return

      const currentIndex = siblings.findIndex((m) => m.id === messageId)
      if (currentIndex === -1) return

      const newIndex = direction === 'prev' ? Math.max(0, currentIndex - 1) : Math.min(siblings.length - 1, currentIndex + 1)
      if (newIndex === currentIndex) return

      const newMessage = siblings[newIndex]
      await updateBranchState(threadId, newMessage.parentId, newMessage.id)
      await loadMessagesForThread(threadId)

      log('Navigated branch:', direction, 'to message:', newMessage.id)
    },
    [loadMessagesForThread]
  )

  const regenerateAssistant = useCallback(
    async (messageId: string, modelInfo?: { model: string; provider: string }): Promise<AddUserMessageResult | null> => {
      const threadId = currentThreadIdRef.current
      if (!threadId) return null

      const assistantMessage = await getMessage(messageId)
      if (!assistantMessage || assistantMessage.role !== 'assistant') return null

      // Create a new sibling assistant message with the same parent
      const input: MessageInput = {
        role: 'assistant',
        content: '',
        parentId: assistantMessage.parentId,
        model: modelInfo?.model,
        provider: modelInfo?.provider,
      }
      const stored = await addMessage(threadId, input)

      // Switch active branch to the new message
      await updateBranchState(threadId, assistantMessage.parentId, stored.id)
      await loadMessagesForThread(threadId)

      log('Regenerated assistant message, created branch:', stored.id, 'sibling of:', messageId)

      return {
        id: stored.id,
        parentId: stored.parentId,
        role: 'assistant',
        content: '',
        threadId,
      }
    },
    [loadMessagesForThread]
  )

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
      await loadMessagesForThread(threadId)
    }
  }, [loadThreads, loadMessagesForThread])

  return {
    threads,
    isLoading,
    currentThreadId,
    createNewThread: createNewThreadAction,
    selectThread,
    deleteCurrentThread,
    renameThread: renameThreadAction,
    messages,
    addUserMessage: addUserMessageAction,
    addAssistantMessage: addAssistantMessageAction,
    updateAssistantMessage: updateAssistantMessageAction,
    clearCurrentThread,
    editUserMessage,
    navigateBranch,
    regenerateAssistant,
    deleteAllData,
    getStats,
    refresh,
  }
}
