import { useState, useCallback, useEffect, useMemo, type FC } from 'react'
import { LazyMotion, domAnimation, MotionConfig } from 'motion/react'
import { useSettings } from '../../hooks/useSettings'
import { useWorkflowStream } from '../../hooks/useWorkflowStream'
import type { ThreadMessage } from '../../hooks/threads'
import {
  validateSettings,
  PROVIDER_CONFIGS,
  getModelConfig,
  type ToolCallInfo,
  type AssistantMessageSegment,
} from '@agent/index'
import { SettingsPanel } from '../settings'
import { ErrorNotification, type NotificationError } from '../ErrorNotification'
import { type AttachmentFile } from '../FileAttachment'
import { ChatTopBar } from './ChatTopBar'
import { MessageList, type Message } from './MessageList'
import { MessageComposer } from './MessageComposer'
import '../../styles/attachments.css'

interface AddUserMessageResult extends ThreadMessage {
  threadId: string
}

interface AgentChatProps {
  messages?: ThreadMessage[]
  onAddUserMessage?: (content: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  onAddAssistantMessage?: (threadId?: string, parentId?: string, modelInfo?: { model: string; provider: string }) => Promise<ThreadMessage>
  onUpdateAssistantMessage?: (
    id: string,
    updates: {
      content?: string
      reasoning?: string
      toolCalls?: ToolCallInfo[]
      assistantSegments?: AssistantMessageSegment[]
      model?: string
      provider?: string
    }
  ) => void
  onClearThread?: () => Promise<void>
  onEditUserMessage?: (messageId: string, newContent: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  onNavigateBranch?: (messageId: string, direction: 'prev' | 'next') => Promise<void>
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  onCreateShortcut?: () => void
}

export const AgentChat: FC<AgentChatProps> = ({
  messages: messagesProp = [],
  onAddUserMessage,
  onAddAssistantMessage,
  onUpdateAssistantMessage,
  onClearThread,
  onEditUserMessage,
  onNavigateBranch,
  sidebarOpen = false,
  onToggleSidebar,
  onCreateShortcut,
}) => {
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings()
  const [showSettings, setShowSettings] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [notificationErrors, setNotificationErrors] = useState<NotificationError[]>([])
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const messages: Message[] = useMemo(
    () =>
      messagesProp.map((m) => ({
        id: m.id,
        parentId: m.parentId,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        assistantSegments: m.assistantSegments,
        attachments: m.attachments,
        reasoning: m.reasoning,
        siblingCount: m.siblingCount,
        siblingIndex: m.siblingIndex,
      })),
    [messagesProp]
  )

  const { tabId, groupId } = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      tabId: parseInt(params.get('tabId') || '0', 10),
      groupId: params.get('groupId') ? parseInt(params.get('groupId')!, 10) : undefined,
    }
  }, [])

  const {
    isStreaming,
    error,
    lastAssistantError,
    pendingAfterToolResult,
    pendingAfterCompletion,
    queuedAfterToolResult,
    queuedAfterCompletion,
    sendMessage,
    sendEditedMessage,
    removeQueuedAfterToolResult,
    removeQueuedAfterCompletion,
    dumpQueues,
    stop,
    clearError,
  } = useWorkflowStream({
    settings,
    tabId,
    groupId,
    messages,
    callbacks: {
      onAddUserMessage,
      onAddAssistantMessage,
      onUpdateAssistantMessage,
    },
  })

  // Enrich messages with generation-level errors for display only.
  // The error is ephemeral (not persisted) so it won't be sent to the LLM.
  const displayMessages: Message[] = useMemo(
    () => {
      if (!lastAssistantError) return messages
      return messages.map((m) =>
        m.id === lastAssistantError.messageId
          ? { ...m, error: lastAssistantError.error }
          : m
      )
    },
    [messages, lastAssistantError]
  )

  useEffect(() => {
    setEditingMessageId(null)
  }, [messagesProp])

  const validationError = validateSettings(settings)

  const handleSendMessage = useCallback(() => {
    const text = inputValue.trim()
    if (!text && attachments.length === 0) return
    sendMessage(text, attachments)
    setInputValue('')
    setAttachments([])
  }, [inputValue, attachments, sendMessage])

  const handleQueueAfterToolResult = useCallback(() => {
    const text = inputValue.trim()
    if (!text && attachments.length === 0) return
    sendMessage(text, attachments, { mode: 'after_tool_result' })
    setInputValue('')
    setAttachments([])
  }, [inputValue, attachments, sendMessage])

  const handleQueueAfterCompletion = useCallback(() => {
    const text = inputValue.trim()
    if (!text && attachments.length === 0) return
    sendMessage(text, attachments, { mode: 'after_completion' })
    setInputValue('')
    setAttachments([])
  }, [inputValue, attachments, sendMessage])

  const handleEscape = useCallback(() => {
    const texts = dumpQueues()
    if (texts.length > 0) {
      const dumped = texts.join('\n')
      setInputValue((prev) => prev ? `${prev}\n${dumped}` : dumped)
    }
    stop()
  }, [dumpQueues, stop])

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text, [])
    },
    [sendMessage]
  )

  const handleClear = useCallback(async () => {
    if (onClearThread) {
      await onClearThread()
    }
    clearError()
  }, [onClearThread, clearError])

  const handleStartEdit = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditContent(content)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditContent('')
  }, [])

  const handleSubmitEdit = useCallback(async () => {
    if (!editingMessageId || !editContent.trim() || !onEditUserMessage) return

    const newContent = editContent.trim()
    const originalMsgIndex = messages.findIndex((m) => m.id === editingMessageId)
    const messagesBeforeEdit = messages.slice(0, originalMsgIndex)

    setEditingMessageId(null)

    await sendEditedMessage(editingMessageId, newContent, messagesBeforeEdit, onEditUserMessage)
  }, [editingMessageId, editContent, messages, onEditUserMessage, sendEditedMessage])

  const handleNavigateBranch = useCallback(
    async (messageId: string, direction: 'prev' | 'next') => {
      if (!onNavigateBranch || isStreaming) return
      await onNavigateBranch(messageId, direction)
    },
    [onNavigateBranch, isStreaming]
  )

  const handleCopyMessage = useCallback((_messageId: string, text: string) => {
    navigator.clipboard.writeText(text)
  }, [])

  const handleRegenerate = useCallback(async (assistantMessageId: string) => {
    if (!onEditUserMessage) return

    const assistantIndex = messages.findIndex((m) => m.id === assistantMessageId)
    if (assistantIndex === -1) return

    // Find the parent user message
    const assistantMsg = messages[assistantIndex]
    const parentUserMsg = messages.find((m) => m.id === assistantMsg.parentId)
    if (!parentUserMsg) return

    // Use the edit flow with the same user content to create a user-level branch
    const userMsgIndex = messages.findIndex((m) => m.id === parentUserMsg.id)
    const messagesBeforeUser = messages.slice(0, userMsgIndex)

    await sendEditedMessage(parentUserMsg.id, parentUserMsg.content, messagesBeforeUser, onEditUserMessage)
  }, [messages, onEditUserMessage, sendEditedMessage])

  const handleDismissError = useCallback((id: string) => {
    setNotificationErrors((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const handleDismissAllErrors = useCallback(() => {
    setNotificationErrors([])
  }, [])

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false)
  }, [])

  const handleSaveSettings = useCallback(
    async (newSettings: Parameters<typeof updateSettings>[0]) => {
      await updateSettings(newSettings)
    },
    [updateSettings]
  )

  const handleToggleReasoning = useCallback(() => {
    updateSettings({ reasoningEnabled: !settings.reasoningEnabled })
  }, [settings.reasoningEnabled, updateSettings])

  const currentModelConfig = getModelConfig(settings.provider, settings.model)
  const reasoningMode = settings.customModelSettings?.reasoning
    ? 'hybrid'
    : (currentModelConfig?.reasoning ?? 'none')
  const showReasoningToggle = reasoningMode === 'hybrid'

  if (settingsLoading) {
    return (
      <div className="agent-chat">
        <div className="loading-state">Loading settings...</div>
      </div>
    )
  }

  const currentProvider = PROVIDER_CONFIGS[settings.provider]
  const displayError = validationError || error


  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className="agent-chat aui-thread-root">
          <ChatTopBar
            providerName={currentProvider.name}
            modelName={settings.model}
            tabId={tabId}
            hasMessages={messages.length > 0}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={onToggleSidebar}
            onNewChat={handleClear}
            onOpenSettings={handleOpenSettings}
          />

          {displayError && (
            <div className="error-banner">
              <span>{displayError}</span>
              <button type="button" className="button-link" onClick={handleOpenSettings}>
                Configure
              </button>
            </div>
          )}

          <ErrorNotification
            errors={notificationErrors}
            onDismiss={handleDismissError}
            onDismissAll={handleDismissAllErrors}
          />

          <MessageList
            messages={displayMessages}
            isStreaming={isStreaming}
            canEditMessages={!!onEditUserMessage}
            editingMessageId={editingMessageId}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSubmitEdit={handleSubmitEdit}
            onNavigateBranch={handleNavigateBranch}
            onCopyMessage={handleCopyMessage}
            onRetry={handleRegenerate}
            onStop={handleEscape}
            onSuggestionClick={handleSuggestion}
          />

          <MessageComposer
            inputValue={inputValue}
            attachments={attachments}
            isStreaming={isStreaming}
            isDisabled={!!validationError}
            pendingAfterToolResult={pendingAfterToolResult}
            pendingAfterCompletion={pendingAfterCompletion}
            queuedAfterToolResult={queuedAfterToolResult}
            queuedAfterCompletion={queuedAfterCompletion}
            showReasoningToggle={showReasoningToggle}
            reasoningEnabled={settings.reasoningEnabled ?? false}
            tabId={tabId}
            onInputChange={setInputValue}
            onAttachmentsChange={setAttachments}
            onSubmit={handleSendMessage}
            onQueueAfterToolResult={handleQueueAfterToolResult}
            onQueueAfterCompletion={handleQueueAfterCompletion}
            onRemoveQueuedAfterToolResult={removeQueuedAfterToolResult}
            onRemoveQueuedAfterCompletion={removeQueuedAfterCompletion}
            onEscape={handleEscape}
            onStop={handleEscape}
            onToggleReasoning={handleToggleReasoning}
            onCreateShortcut={onCreateShortcut}
          />

          {showSettings && (
            <SettingsPanel settings={settings} onSave={handleSaveSettings} onClose={handleCloseSettings} />
          )}
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
