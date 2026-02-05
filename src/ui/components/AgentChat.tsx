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
import { ArrowUp, Brain, Check, Copy, Pencil, RefreshCw, Square, X } from 'lucide-react'
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
import { SettingsPanel } from './SettingsPanel'
import { ToolCallDisplay } from './ToolCallDisplay'
import { MarkdownMessage } from './MarkdownMessage'
import { TooltipIconButton } from './TooltipIconButton'
import { FileAttachment, type AttachmentFile } from './FileAttachment'
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
  initialMessages?: ThreadMessage[]
  onAddUserMessage?: (content: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  onAddAssistantMessage?: (threadId?: string) => Promise<ThreadMessage>
  onUpdateAssistantMessage?: (
    id: string,
    updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[] }
  ) => Promise<void>
  onClearThread?: () => Promise<void>
  onNewThread?: () => Promise<void>
  // Branch operations
  onEditUserMessage?: (messageId: string, newContent: string, attachments?: AttachmentFile[]) => Promise<AddUserMessageResult>
  onNavigateBranch?: (messageId: string, direction: 'prev' | 'next') => Promise<void>
  onRegenerateAssistant?: (messageId: string) => Promise<void>
  sidebarOpen?: boolean
}

export const AgentChat: FC<AgentChatProps> = ({
  threadId,
  initialMessages = [],
  onAddUserMessage,
  onAddAssistantMessage,
  onUpdateAssistantMessage,
  onClearThread,
  onNewThread,
  onEditUserMessage,
  onNavigateBranch,
  onRegenerateAssistant,
  sidebarOpen = false,
}) => {
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings()
  const [showSettings, setShowSettings] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<Message[]>([])
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [notificationErrors, setNotificationErrors] = useState<NotificationError[]>([])
  // Edit mode state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  const tabId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const id = parseInt(params.get('tabId') || '0', 10)
    log('Tab ID from URL:', id)
    return id
  }, [])

  // Initialize messages from props
  useEffect(() => {
    const converted: Message[] = initialMessages.map((m) => ({
      id: m.id,
      parentId: m.parentId,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      attachments: m.attachments,
      reasoning: m.reasoning,
      siblingCount: m.siblingCount,
      siblingIndex: m.siblingIndex,
    }))
    setMessages(converted)
    // Clear edit mode when messages change
    setEditingMessageId(null)
  }, [initialMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

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

      // Create user message
      let userMessageId: string
      let messageThreadId: string | undefined
      if (onAddUserMessage) {
        const stored = await onAddUserMessage(text, messageAttachments)
        userMessageId = stored.id
        messageThreadId = stored.threadId
        setMessages((prev) => [...prev, {
          id: stored.id,
          role: 'user',
          content: text,
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
        }])
      } else {
        userMessageId = Date.now().toString()
        setMessages((prev) => [...prev, {
          id: userMessageId,
          role: 'user',
          content: text,
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
        }])
      }

      // Create assistant message placeholder
      let assistantMessageId: string
      if (onAddAssistantMessage) {
        // Pass the threadId from user message to ensure we use the correct thread
        const stored = await onAddAssistantMessage(messageThreadId)
        assistantMessageId = stored.id
      } else {
        assistantMessageId = (Date.now() + 1).toString()
      }

      setMessages((prev) => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        reasoning: '',
      }])

      setIsStreaming(true)
      abortControllerRef.current = new AbortController()

      try {
        log('Creating provider:', settings.provider, settings.model)
        const model = createProvider(settings)

        // Build agent messages, converting attachments to content parts
        const buildMessageContent = (msg: Message): string | ContentPart[] => {
          if (!msg.attachments || msg.attachments.length === 0) {
            return msg.content
          }
          // Multimodal message with attachments
          const parts: ContentPart[] = []
          if (msg.content.trim()) {
            parts.push({ type: 'text', text: msg.content })
          }
          for (const att of msg.attachments) {
            if (att.type === 'image') {
              parts.push({ type: 'image', image: att.dataUrl, mediaType: att.mediaType })
            } else {
              parts.push({ type: 'file', data: att.dataUrl, mediaType: att.mediaType, filename: att.file.name })
            }
          }
          return parts
        }

        const agentMessages: AgentMessage[] = [
          ...messagesRef.current
            .filter((m) => (m.content && m.content.trim().length > 0 && !m.content.includes('(No response')) || (m.attachments && m.attachments.length > 0))
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: buildMessageContent(m),
            })),
          { role: 'user' as const, content: buildMessageContent({ id: userMessageId, role: 'user', content: text, attachments: messageAttachments }) },
        ]

        let accumulatedText = ''
        let accumulatedReasoning = ''
        const accumulatedToolCalls: ToolCallInfo[] = []

        const updateAssistantMessage = () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: accumulatedText, toolCalls: [...accumulatedToolCalls], reasoning: accumulatedReasoning }
                : m
            )
          )
        }

        // Debounced persistence
        let persistTimeout: ReturnType<typeof setTimeout> | null = null
        const persistUpdate = () => {
          if (persistTimeout) clearTimeout(persistTimeout)
          persistTimeout = setTimeout(() => {
            if (onUpdateAssistantMessage) {
              onUpdateAssistantMessage(assistantMessageId, {
                content: accumulatedText,
                reasoning: accumulatedReasoning,
                toolCalls: accumulatedToolCalls,
              })
            }
          }, 500)
        }

        const result = await runWorkflow({
          model,
          messages: agentMessages,
          tabId,
          maxSteps: MAX_STEPS,
          abortSignal: abortControllerRef.current?.signal,
          callbacks: {
            onTextDelta: (delta) => {
              accumulatedText += delta
              updateAssistantMessage()
              persistUpdate()
            },
            onReasoningDelta: (delta) => {
              accumulatedReasoning += delta
              updateAssistantMessage()
              persistUpdate()
            },
            onToolStart: (toolCall) => {
              accumulatedToolCalls.push(toolCall)
              updateAssistantMessage()
              persistUpdate()
            },
            onToolDone: (toolCall) => {
              const index = accumulatedToolCalls.findIndex(tc => tc.id === toolCall.id)
              if (index !== -1) {
                accumulatedToolCalls[index] = toolCall
              }
              updateAssistantMessage()
              persistUpdate()
            },
          },
          tracing: settings.tracing,
          modelName: settings.model,
          provider: settings.provider,
          reasoningEnabled: settings.reasoningEnabled,
        })

        // Clear persist timeout and do final persist
        if (persistTimeout) clearTimeout(persistTimeout)

        log('Agent loop complete:', {
          steps: result.steps,
          finishReason: result.finishReason,
          textLength: result.text.length,
          toolCalls: result.toolCalls.length
        })

        if (result.text || result.toolCalls.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: result.text, toolCalls: result.toolCalls }
                : m
            )
          )

          // Final persist
          if (onUpdateAssistantMessage) {
            await onUpdateAssistantMessage(assistantMessageId, {
              content: result.text,
              reasoning: accumulatedReasoning,
              toolCalls: result.toolCalls,
            })
          }
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: '(No response received from the model)' }
                : m
            )
          )

          if (onUpdateAssistantMessage) {
            await onUpdateAssistantMessage(assistantMessageId, {
              content: '(No response received from the model)',
            })
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        logError('Agent loop error:', err)

        const isAbortError = errorMessage === 'AbortError' || errorMessage.includes('aborted')
        if (!isAbortError) {
          setError(errorMessage)
        }

        setMessages((prev) => {
          const assistantMsg = prev.find((m) => m.id === assistantMessageId)
          const hasContent = assistantMsg?.content && assistantMsg.content.trim().length > 0
          const hasToolCalls = assistantMsg?.toolCalls && assistantMsg.toolCalls.length > 0

          if (!hasContent && !hasToolCalls) {
            return prev.filter((m) => m.id !== assistantMessageId)
          }
          return prev
        })
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
        log('=== Agent loop finished ===')
      }
    },
    [isStreaming, validationError, settings, tabId, onAddUserMessage, onAddAssistantMessage, onUpdateAssistantMessage]
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
    setMessages([])
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

  const handleAddError = useCallback((message: string, details?: string) => {
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
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === 'user')
    if (lastUser?.content) {
      sendMessage(lastUser.content)
    }
  }, [sendMessage])

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

    try {
      setEditingMessageId(null)
      // Edit creates a new branch and triggers a new response
      const result = await onEditUserMessage(editingMessageId, editContent.trim())
      // Now send to get assistant response
      if (onAddAssistantMessage) {
        const assistantMsg = await onAddAssistantMessage(result.threadId)
        // Trigger the workflow (similar to sendMessage but for the edited branch)
        await runEditedMessageWorkflow(result.threadId, assistantMsg.id)
      }
    } catch (err) {
      logError('Edit message failed:', err)
    }
  }, [editingMessageId, editContent, onEditUserMessage, onAddAssistantMessage])

  const runEditedMessageWorkflow = useCallback(async (threadIdForWorkflow: string, assistantMessageId: string) => {
    setIsStreaming(true)
    abortControllerRef.current = new AbortController()

    try {
      const model = createProvider(settings)

      // Build messages from current state (which should now reflect the edited branch)
      const buildMessageContent = (msg: Message): string | ContentPart[] => {
        if (!msg.attachments || msg.attachments.length === 0) {
          return msg.content
        }
        const parts: ContentPart[] = []
        if (msg.content.trim()) {
          parts.push({ type: 'text', text: msg.content })
        }
        for (const att of msg.attachments) {
          if (att.type === 'image') {
            parts.push({ type: 'image', image: att.dataUrl, mediaType: att.mediaType })
          } else {
            parts.push({ type: 'file', data: att.dataUrl, mediaType: att.mediaType, filename: att.file.name })
          }
        }
        return parts
      }

      const agentMessages: AgentMessage[] = messagesRef.current
        .filter((m) => m.role === 'user' || (m.content && m.content.trim().length > 0))
        .filter((m) => m.id !== assistantMessageId) // Exclude the empty assistant placeholder
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: buildMessageContent(m),
        }))

      let accumulatedText = ''
      let accumulatedReasoning = ''
      const accumulatedToolCalls: ToolCallInfo[] = []

      const updateAssistantMessage = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: accumulatedText, toolCalls: [...accumulatedToolCalls], reasoning: accumulatedReasoning }
              : m
          )
        )
      }

      let persistTimeout: ReturnType<typeof setTimeout> | null = null
      const persistUpdate = () => {
        if (persistTimeout) clearTimeout(persistTimeout)
        persistTimeout = setTimeout(() => {
          if (onUpdateAssistantMessage) {
            onUpdateAssistantMessage(assistantMessageId, {
              content: accumulatedText,
              reasoning: accumulatedReasoning,
              toolCalls: accumulatedToolCalls,
            })
          }
        }, 500)
      }

      const result = await runWorkflow({
        model,
        messages: agentMessages,
        tabId,
        maxSteps: MAX_STEPS,
        abortSignal: abortControllerRef.current?.signal,
        callbacks: {
          onTextDelta: (delta) => {
            accumulatedText += delta
            updateAssistantMessage()
            persistUpdate()
          },
          onReasoningDelta: (delta) => {
            accumulatedReasoning += delta
            updateAssistantMessage()
            persistUpdate()
          },
          onToolStart: (toolCall) => {
            accumulatedToolCalls.push(toolCall)
            updateAssistantMessage()
            persistUpdate()
          },
          onToolDone: (toolCall) => {
            const index = accumulatedToolCalls.findIndex(tc => tc.id === toolCall.id)
            if (index !== -1) accumulatedToolCalls[index] = toolCall
            updateAssistantMessage()
            persistUpdate()
          },
        },
        tracing: settings.tracing,
        modelName: settings.model,
        provider: settings.provider,
        reasoningEnabled: settings.reasoningEnabled,
      })

      if (persistTimeout) clearTimeout(persistTimeout)

      if (result.text || result.toolCalls.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: result.text, toolCalls: result.toolCalls }
              : m
          )
        )
        if (onUpdateAssistantMessage) {
          await onUpdateAssistantMessage(assistantMessageId, {
            content: result.text,
            reasoning: accumulatedReasoning,
            toolCalls: result.toolCalls,
          })
        }
      }
    } catch (err) {
      logError('Edited message workflow error:', err)
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [settings, tabId, onUpdateAssistantMessage])

  const handleNavigateBranch = useCallback(async (messageId: string, direction: 'prev' | 'next') => {
    if (!onNavigateBranch || isStreaming) return
    await onNavigateBranch(messageId, direction)
  }, [onNavigateBranch, isStreaming])

  const handleRegenerate = useCallback(async (messageId: string) => {
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
              {/* Add spacing when sidebar is closed to account for toggle button */}
              {!sidebarOpen && <div style={{ width: 44 }} />}
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
              <FileAttachment
                onFilesSelected={handleFilesSelected}
                disabled={isStreaming || !!validationError}
              />
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
