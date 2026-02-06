import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type FC,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { LazyMotion, domAnimation, MotionConfig } from 'motion/react'
import * as m from 'motion/react-m'
import { ArrowUp, Brain, Check, Copy, PanelLeft, Pencil, RefreshCw, Square } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import type { ThreadMessage } from '../hooks/useThreads'
import {
  createProvider,
  validateSettings,
  PROVIDER_CONFIGS,
  getModelConfig,
  runWorkflow,
  type ToolCallInfo,
  type Message as AgentMessage,
  type ContentPart,
} from '@agent/index'
import { SettingsPanel } from './settings'
import { ToolCallDisplay } from './ToolCallDisplay'
import { MarkdownMessage } from './MarkdownMessage'
import { TooltipIconButton } from './TooltipIconButton'
import { type AttachmentFile } from './FileAttachment'
import { ComposerMenu } from './ComposerMenu'
import { AttachmentPreview, MessageAttachments } from './AttachmentPreview'
import { ErrorNotification, createError, type NotificationError } from './ErrorNotification'
import { ThinkingBlock } from './ThinkingBlock'
import { BranchPicker } from './BranchPicker'
import '../styles/attachments.css'

const DEBUG = true
const MAX_STEPS = 15
const log = (...args: unknown[]) => DEBUG && console.log('[AgentChat]', ...args)
const logWarn = (...args: unknown[]) => DEBUG && console.warn('[AgentChat]', ...args)
const logError = (...args: unknown[]) => console.error('[AgentChat]', ...args)

interface Message {
  id: string
  parentId?: string | null
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
  attachments?: AttachmentFile[]
  reasoning?: string
  siblingCount?: number
  siblingIndex?: number
}

interface AddUserMessageResult extends ThreadMessage {
  threadId: string
}

interface AgentChatProps {
  threadId?: string | null
  messages?: ThreadMessage[]
  onAddUserMessage?: (content: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  onAddAssistantMessage?: (threadId?: string, parentId?: string, modelInfo?: { model: string; provider: string }) => Promise<ThreadMessage>
  onUpdateAssistantMessage?: (
    id: string,
    updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; model?: string; provider?: string }
  ) => void
  onClearThread?: () => Promise<void>
  onNewThread?: () => Promise<void>
  // Branch operations
  onEditUserMessage?: (messageId: string, newContent: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  onNavigateBranch?: (messageId: string, direction: 'prev' | 'next') => Promise<void>
  onRegenerateAssistant?: (messageId: string) => Promise<void>
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

export const AgentChat: FC<AgentChatProps> = ({
  threadId: _threadId,
  messages: messagesProp = [],
  onAddUserMessage,
  onAddAssistantMessage,
  onUpdateAssistantMessage,
  onClearThread,
  onNewThread: _onNewThread,
  onEditUserMessage,
  onNavigateBranch,
  onRegenerateAssistant,
  sidebarOpen = false,
  onToggleSidebar,
}) => {
  // Note: _threadId and _onNewThread are available for future use but currently unused
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings()
  const [showSettings, setShowSettings] = useState(false)
  const [inputValue, setInputValue] = useState('')
  // No local messages state - use props directly
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [notificationErrors, setNotificationErrors] = useState<NotificationError[]>([])
  // Edit mode state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Convert prop messages to local Message type for rendering
  const messages: Message[] = useMemo(() =>
    messagesProp.map((m) => ({
      id: m.id,
      parentId: m.parentId,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      attachments: m.attachments,
      reasoning: m.reasoning,
      siblingCount: m.siblingCount,
      siblingIndex: m.siblingIndex,
    })),
    [messagesProp]
  )

  const tabId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const id = parseInt(params.get('tabId') || '0', 10)
    log('Tab ID from URL:', id)
    return id
  }, [])

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Clear edit mode when messages change
  useEffect(() => {
    setEditingMessageId(null)
  }, [messagesProp])

  const validationError = validateSettings(settings)

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [inputValue, resizeTextarea])

  const sendMessage = useCallback(
    async (text: string, messageAttachments: AttachmentFile[] = []) => {
      log('=== Send Message ===')
      const hasContent = text.trim() || messageAttachments.length > 0
      if (!hasContent || isStreaming || validationError) {
        logWarn('Cannot send:', { text: !!text, attachments: messageAttachments.length, isStreaming, validationError })
        return
      }

      setInputValue('')
      setAttachments([])
      setError(null)

      // Helper to build content for LLM (handles attachments)
      const buildMessageContent = (content: string, attachments?: AttachmentFile[]): string | ContentPart[] => {
        if (!attachments || attachments.length === 0) {
          return content
        }
        const parts: ContentPart[] = []
        if (content.trim()) {
          parts.push({ type: 'text', text: content })
        }
        for (const att of attachments) {
          if (att.type === 'image') {
            parts.push({ type: 'image', image: att.dataUrl, mediaType: att.mediaType })
          } else {
            parts.push({ type: 'file', data: att.dataUrl, mediaType: att.mediaType, filename: att.file.name })
          }
        }
        return parts
      }

      // Build conversation history from current props BEFORE any state changes
      // This avoids race conditions with React state updates
      const conversationHistory: AgentMessage[] = messages
        .filter((m) => m.content?.trim() || m.attachments?.length)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: buildMessageContent(m.content, m.attachments),
        }))

      // Now update state - create user message and assistant placeholder
      let userMessageId: string
      let messageThreadId: string | undefined
      if (onAddUserMessage) {
        const stored = await onAddUserMessage(text, messageAttachments)
        userMessageId = stored.id
        messageThreadId = stored.threadId
      } else {
        userMessageId = Date.now().toString()
      }

      let assistantMessageId: string
      if (onAddAssistantMessage) {
        const stored = await onAddAssistantMessage(messageThreadId, userMessageId, {
          model: settings.model,
          provider: settings.provider,
        })
        assistantMessageId = stored.id
      } else {
        assistantMessageId = (Date.now() + 1).toString()
      }

      // Build final messages for LLM: history + new user message
      const agentMessages: AgentMessage[] = [
        ...conversationHistory,
        { role: 'user' as const, content: buildMessageContent(text, messageAttachments) },
      ]

      setIsStreaming(true)
      abortControllerRef.current = new AbortController()

      try {
        log('Creating provider:', settings.provider, settings.model)
        const model = createProvider(settings)

        let accumulatedText = ''
        let accumulatedReasoning = ''
        const accumulatedToolCalls: ToolCallInfo[] = []

        // Update via callback - useThreads handles state + persistence with RAF batching
        const updateAssistant = () => {
          if (onUpdateAssistantMessage) {
            onUpdateAssistantMessage(assistantMessageId, {
              content: accumulatedText,
              reasoning: accumulatedReasoning,
              toolCalls: accumulatedToolCalls,
            })
          }
        }

        // Determine effective reasoning: 'always' models always have it enabled
        const modelConfig = getModelConfig(settings.provider, settings.model)
        const effectiveReasoningEnabled =
          modelConfig?.reasoning === 'always' ? true :
          modelConfig?.reasoning === 'hybrid' ? settings.reasoningEnabled :
          false

        const result = await runWorkflow({
          model,
          messages: agentMessages,
          tabId,
          maxSteps: MAX_STEPS,
          abortSignal: abortControllerRef.current?.signal,
          callbacks: {
            onTextDelta: (delta) => {
              accumulatedText += delta
              updateAssistant()
            },
            onReasoningDelta: (delta) => {
              accumulatedReasoning += delta
              updateAssistant()
            },
            onToolStart: (toolCall) => {
              accumulatedToolCalls.push(toolCall)
              updateAssistant()
            },
            onToolDone: (toolCall) => {
              const index = accumulatedToolCalls.findIndex(tc => tc.id === toolCall.id)
              if (index !== -1) {
                accumulatedToolCalls[index] = toolCall
              }
              updateAssistant()
            },
          },
          tracing: settings.tracing,
          modelName: settings.model,
          provider: settings.provider,
          reasoningEnabled: effectiveReasoningEnabled,
        })

        log('Agent loop complete:', {
          steps: result.steps,
          finishReason: result.finishReason,
          textLength: result.text.length,
          toolCalls: result.toolCalls.length
        })

        // Final update with complete result - just save what we got
        if (onUpdateAssistantMessage) {
          onUpdateAssistantMessage(assistantMessageId, {
            content: result.text,
            reasoning: accumulatedReasoning,
            toolCalls: result.toolCalls,
          })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        logError('Agent loop error:', err)

        const isAbortError = errorMessage === 'AbortError' || errorMessage.includes('aborted')
        if (!isAbortError) {
          setError(errorMessage)
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
        log('=== Agent loop finished ===')
      }
    },
    [isStreaming, validationError, settings, tabId, messages, onAddUserMessage, onAddAssistantMessage, onUpdateAssistantMessage]
  )

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const text = inputValue.trim()
      if (!text && attachments.length === 0) return
      sendMessage(text, attachments)
    },
    [inputValue, attachments, sendMessage]
  )

  const handleStop = useCallback(() => {
    log('Stop clicked')
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const canSend = !isStreaming && (inputValue.trim() || attachments.length > 0) && !validationError

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend) {
          handleSubmit(e as unknown as FormEvent)
        }
      }
    },
    [canSend, handleSubmit]
  )

  const handleClear = useCallback(async () => {
    if (onClearThread) {
      await onClearThread()
    }
    setError(null)
  }, [onClearThread])

  const handleSuggestion = useCallback((text: string) => {
    sendMessage(text, [])
  }, [sendMessage])

  const handleFilesSelected = useCallback((files: AttachmentFile[]) => {
    setAttachments(prev => [...prev, ...files])
  }, [])

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  // Available for future use
  const _handleAddError = useCallback((message: string, details?: string) => {
    setNotificationErrors(prev => [...prev, createError(message, details)])
  }, [])

  const handleDismissError = useCallback((id: string) => {
    setNotificationErrors(prev => prev.filter(e => e.id !== id))
  }, [])

  const handleDismissAllErrors = useCallback(() => {
    setNotificationErrors([])
  }, [])

  const handleCopyMessage = useCallback((messageId: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }, [])

  const handleRetry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser?.content) {
      sendMessage(lastUser.content)
    }
  }, [messages, sendMessage])

  // ============================================================================
  // Edit & Branch Handlers
  // ============================================================================

  const handleStartEdit = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditContent(content)
    // Focus the textarea after render
    setTimeout(() => editTextareaRef.current?.focus(), 0)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditContent('')
  }, [])

  const handleSubmitEdit = useCallback(async () => {
    if (!editingMessageId || !editContent.trim() || !onEditUserMessage) return

    // Capture the edited content and the message being edited
    const newContent = editContent.trim()
    const originalMessageId = editingMessageId

    // Helper to build content for LLM
    const buildMessageContent = (content: string, attachments?: AttachmentFile[]): string | ContentPart[] => {
      if (!attachments || attachments.length === 0) {
        return content
      }
      const parts: ContentPart[] = []
      if (content.trim()) {
        parts.push({ type: 'text', text: content })
      }
      for (const att of attachments) {
        if (att.type === 'image') {
          parts.push({ type: 'image', image: att.dataUrl, mediaType: att.mediaType })
        } else {
          parts.push({ type: 'file', data: att.dataUrl, mediaType: att.mediaType, filename: att.file.name })
        }
      }
      return parts
    }

    // Build conversation history BEFORE state changes
    // Exclude the original message being edited and everything after it
    const originalMsgIndex = messages.findIndex((m) => m.id === originalMessageId)
    const conversationHistory: AgentMessage[] = messages
      .slice(0, originalMsgIndex) // Only messages before the one being edited
      .filter((m) => m.content?.trim())
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: buildMessageContent(m.content, m.attachments),
      }))

    try {
      setEditingMessageId(null)
      setIsStreaming(true)
      abortControllerRef.current = new AbortController()

      // Edit creates a new branch and triggers a new response
      const result = await onEditUserMessage(originalMessageId, newContent)

      // Now send to get assistant response
      if (onAddAssistantMessage) {
        const assistantMsg = await onAddAssistantMessage(result.threadId, result.id, {
          model: settings.model,
          provider: settings.provider,
        })

        // Build final messages: history + edited user message
        const agentMessages: AgentMessage[] = [
          ...conversationHistory,
          { role: 'user' as const, content: newContent },
        ]

        const model = createProvider(settings)

        let accumulatedText = ''
        let accumulatedReasoning = ''
        const accumulatedToolCalls: ToolCallInfo[] = []

        const updateAssistant = () => {
          if (onUpdateAssistantMessage) {
            onUpdateAssistantMessage(assistantMsg.id, {
              content: accumulatedText,
              reasoning: accumulatedReasoning,
              toolCalls: accumulatedToolCalls,
            })
          }
        }

        const modelConfig = getModelConfig(settings.provider, settings.model)
        const effectiveReasoningEnabled =
          modelConfig?.reasoning === 'always' ? true :
          modelConfig?.reasoning === 'hybrid' ? settings.reasoningEnabled :
          false

        const workflowResult = await runWorkflow({
          model,
          messages: agentMessages,
          tabId,
          maxSteps: MAX_STEPS,
          abortSignal: abortControllerRef.current?.signal,
          callbacks: {
            onTextDelta: (delta) => {
              accumulatedText += delta
              updateAssistant()
            },
            onReasoningDelta: (delta) => {
              accumulatedReasoning += delta
              updateAssistant()
            },
            onToolStart: (toolCall) => {
              accumulatedToolCalls.push(toolCall)
              updateAssistant()
            },
            onToolDone: (toolCall) => {
              const index = accumulatedToolCalls.findIndex(tc => tc.id === toolCall.id)
              if (index !== -1) accumulatedToolCalls[index] = toolCall
              updateAssistant()
            },
          },
          tracing: settings.tracing,
          modelName: settings.model,
          provider: settings.provider,
          reasoningEnabled: effectiveReasoningEnabled,
        })

        // Final update
        if (workflowResult.text || workflowResult.toolCalls.length > 0) {
          if (onUpdateAssistantMessage) {
            onUpdateAssistantMessage(assistantMsg.id, {
              content: workflowResult.text,
              reasoning: accumulatedReasoning,
              toolCalls: workflowResult.toolCalls,
            })
          }
        }
      }
    } catch (err) {
      logError('Edit message failed:', err)
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [editingMessageId, editContent, messages, settings, tabId, onEditUserMessage, onAddAssistantMessage, onUpdateAssistantMessage])

  const handleNavigateBranch = useCallback(async (messageId: string, direction: 'prev' | 'next') => {
    if (!onNavigateBranch || isStreaming) return
    await onNavigateBranch(messageId, direction)
  }, [onNavigateBranch, isStreaming])

  // Available for future use - regenerate assistant response
  const _handleRegenerate = useCallback(async (messageId: string) => {
    if (!onRegenerateAssistant || isStreaming) return

    // Delete the assistant message
    await onRegenerateAssistant(messageId)

    // The messages will be reloaded, and we need to add a new assistant message
    // and trigger the workflow. This is handled by the parent re-rendering with new messages.
    // For now, we'll trigger via handleRetry-like logic after the reload.
    setTimeout(() => {
      handleRetry()
    }, 100)
  }, [onRegenerateAssistant, isStreaming, handleRetry])

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false)
  }, [])

  const handleSaveSettings = useCallback(
    async (newSettings: Parameters<typeof updateSettings>[0]) => {
      await updateSettings(newSettings)
      // Don't clear messages on settings save anymore - they're persisted
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

  const suggestions = [
    {
      title: 'Summarize this page',
      label: 'with key actions available',
      action: 'Summarize this page and list key actions I can take.',
    },
    {
      title: 'Fill a form',
      label: 'with sample data',
      action: 'Fill the main form on this page with realistic sample data.',
    },
    {
      title: 'Find CTA buttons',
      label: 'and describe them',
      action: 'Find the primary call-to-action buttons and describe them.',
    },
    {
      title: 'Extract key info',
      label: 'from this page',
      action: 'Extract key information and highlight important details.',
    },
  ]

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <div className="agent-chat aui-thread-root">
          <div className="aui-topbar">
            <div className="aui-topbar-info">
              {!sidebarOpen && onToggleSidebar && (
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  onClick={onToggleSidebar}
                  aria-label="Open sidebar"
                >
                  <PanelLeft size={18} />
                </button>
              )}
              <span className="provider-badge">{currentProvider.name}</span>
              <span className="model-name">{settings.model}</span>
              {tabId > 0 && <span className="tab-badge">Tab {tabId}</span>}
            </div>
            <div className="aui-topbar-actions">
              {messages.length > 0 && (
                <button
                  type="button"
                  className="button-icon"
                  onClick={handleClear}
                  aria-label="New chat"
                >
                  New
                </button>
              )}
              <button
                type="button"
                className="button-icon"
                onClick={handleOpenSettings}
                aria-label="Open settings"
              >
                Settings
              </button>
            </div>
          </div>

      {displayError && (
        <div className="error-banner">
          <span>{displayError}</span>
          <button
            type="button"
            className="button-link"
            onClick={handleOpenSettings}
          >
            Configure
          </button>
        </div>
      )}

      <ErrorNotification
        errors={notificationErrors}
        onDismiss={handleDismissError}
        onDismissAll={handleDismissAllErrors}
      />

      <div className="aui-thread-viewport">
        {messages.length === 0 ? (
          <div className="aui-thread-welcome-root">
            <div className="aui-thread-welcome-message">
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="aui-thread-welcome-title"
              >
                Hello there!
              </m.div>
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="aui-thread-welcome-subtitle"
              >
                How can I help you today?
              </m.div>
            </div>
            <div className="aui-thread-welcome-suggestions">
              {suggestions.map((suggestion, index) => (
                <m.button
                  key={suggestion.action}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                  type="button"
                  className="aui-thread-welcome-suggestion"
                  onClick={() => handleSuggestion(suggestion.action)}
                >
                  <span className="aui-thread-welcome-suggestion-title">
                    {suggestion.title}
                  </span>
                  <span className="aui-thread-welcome-suggestion-label">
                    {suggestion.label}
                  </span>
                </m.button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const hasContent = message.content && message.content.trim().length > 0
            const hasToolCalls = message.toolCalls && message.toolCalls.length > 0
            const isEmptyAssistant = message.role === 'assistant' && !hasContent && !hasToolCalls
            const isStreamingMessage = isStreaming && message.id === messages[messages.length - 1]?.id

            if (message.role === 'user') {
              const isEditing = editingMessageId === message.id
              const isUserHovered = hoveredMessageId === message.id
              const hasBranches = (message.siblingCount ?? 1) > 1
              const canShowBranchPicker = hasBranches && !isStreaming

              return (
                <m.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="aui-user-message-root"
                  data-role="user"
                  onMouseEnter={() => setHoveredMessageId(message.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  {isEditing ? (
                    // Edit mode
                    <div className="aui-user-message-edit">
                      <textarea
                        ref={editTextareaRef}
                        className="aui-user-message-edit-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSubmitEdit()
                          } else if (e.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                        rows={3}
                      />
                      <div className="aui-user-message-edit-actions">
                        <button
                          type="button"
                          className="aui-user-message-edit-cancel"
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="aui-user-message-edit-submit"
                          onClick={handleSubmitEdit}
                          disabled={!editContent.trim()}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Normal display mode
                    <>
                      <div className="aui-user-message-content">
                        {message.content && <div className="message-text">{message.content}</div>}
                        {message.attachments && message.attachments.length > 0 && (
                          <MessageAttachments attachments={message.attachments} />
                        )}
                        {/* Edit button - show on hover when not streaming */}
                        {isUserHovered && !isStreaming && onEditUserMessage && (
                          <button
                            type="button"
                            className="aui-user-message-edit-btn"
                            onClick={() => handleStartEdit(message.id, message.content)}
                            aria-label="Edit message"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </div>
                      {/* Branch picker - show when message has siblings and not streaming */}
                      {canShowBranchPicker && (
                        <BranchPicker
                          currentIndex={message.siblingIndex ?? 0}
                          total={message.siblingCount ?? 1}
                          onPrev={() => handleNavigateBranch(message.id, 'prev')}
                          onNext={() => handleNavigateBranch(message.id, 'next')}
                          disabled={isStreaming}
                        />
                      )}
                    </>
                  )}
                </m.div>
              )
            }

            const isLastMessage = message.id === messages[messages.length - 1]?.id
            const isHovered = hoveredMessageId === message.id
            const showActionBar = isLastMessage || isHovered || isStreamingMessage
            const isCopied = copiedMessageId === message.id

            return (
              <m.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="aui-assistant-message-root"
                data-role="assistant"
                onMouseEnter={() => setHoveredMessageId(message.id)}
                onMouseLeave={() => setHoveredMessageId(null)}
              >
                <div className="aui-assistant-message-content">
                  {(message.reasoning || (isStreamingMessage && !hasContent && !hasToolCalls)) && (
                    <ThinkingBlock
                      reasoning={message.reasoning || ''}
                      isStreaming={isStreamingMessage && !hasContent}
                    />
                  )}
                  {hasContent && (
                    <MarkdownMessage content={message.content} isStreaming={isStreamingMessage} />
                  )}
                  {hasToolCalls && (
                    <div className="message-tool-calls">
                      {message.toolCalls!.map((tc) => (
                        <ToolCallDisplay key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}
                  {isEmptyAssistant && !message.reasoning && isStreaming && (
                    <div className="message-text message-loading">Thinking...</div>
                  )}
                  {isEmptyAssistant && !message.reasoning && !isStreaming && (
                    <div className="message-text message-error">(Empty response)</div>
                  )}
                </div>
                <div
                  className={`aui-assistant-action-bar-root ${showActionBar ? '' : 'aui-action-bar-hidden'} ${isHovered && !isLastMessage ? 'aui-action-bar-floating' : ''}`}
                >
                  <TooltipIconButton
                    tooltip={isCopied ? 'Copied' : 'Copy'}
                    onClick={() => handleCopyMessage(message.id, message.content)}
                  >
                    {isCopied ? <Check size={16} /> : <Copy size={16} />}
                  </TooltipIconButton>
                  <TooltipIconButton
                    tooltip="Retry"
                    onClick={handleRetry}
                    disabled={isStreaming}
                  >
                    <RefreshCw size={16} />
                  </TooltipIconButton>
                  {isStreamingMessage && (
                    <TooltipIconButton tooltip="Stop" onClick={handleStop}>
                      <Square size={14} />
                    </TooltipIconButton>
                  )}
                </div>
              </m.div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="aui-composer-wrapper" onSubmit={handleSubmit}>
        {attachments.length > 0 && (
          <AttachmentPreview
            attachments={attachments}
            onRemove={handleRemoveAttachment}
          />
        )}
        <div className="aui-composer-root">
          <textarea
            ref={textareaRef}
            className="aui-composer-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              validationError
                ? 'Configure your API key to start...'
                : 'Send a message...'
            }
            disabled={isStreaming || !!validationError}
            rows={1}
            aria-label="Message input"
          />
          <div className="aui-composer-action-wrapper">
            <div className="aui-composer-actions-left">
              <ComposerMenu
                onFilesSelected={handleFilesSelected}
                disabled={isStreaming || !!validationError}
              />
              {showReasoningToggle && (
                <button
                  type="button"
                  className={`reasoning-btn ${settings.reasoningEnabled ? 'active' : ''}`}
                  onClick={handleToggleReasoning}
                  title={settings.reasoningEnabled ? 'Reasoning enabled' : 'Reasoning disabled'}
                >
                  <Brain size={16} />
                </button>
              )}
            </div>
            {isStreaming ? (
              <button
                type="button"
                className="aui-composer-cancel"
                onClick={handleStop}
                aria-label="Stop generation"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                type="submit"
                className="aui-composer-send"
                disabled={!canSend}
                aria-label="Send message"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onClose={handleCloseSettings}
        />
      )}
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
