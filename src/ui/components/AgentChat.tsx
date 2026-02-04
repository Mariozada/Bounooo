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
// Message type for the API
interface ApiMessage {
  role: 'user' | 'assistant'
  content: string
}
import { useSettings } from '../hooks/useSettings'
import {
  createProvider,
  validateSettings,
  PROVIDER_CONFIGS,
  runAgentLoop,
  type ToolCallInfo
} from '@agent/index'
import { SettingsPanel } from './SettingsPanel'
import { ToolCallDisplay } from './ToolCallDisplay'

const DEBUG = true
const MAX_STEPS = 15
const log = (...args: unknown[]) => DEBUG && console.log('[AgentChat]', ...args)
const logWarn = (...args: unknown[]) => DEBUG && console.warn('[AgentChat]', ...args)
const logError = (...args: unknown[]) => console.error('[AgentChat]', ...args)

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
}

export const AgentChat: FC = () => {
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings()
  const [showSettings, setShowSettings] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const tabId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const id = parseInt(params.get('tabId') || '0', 10)
    log('Tab ID from URL:', id)
    return id
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const validationError = validateSettings(settings)

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      log('=== Handle Submit ===')

      const text = inputValue.trim()
      if (!text || isStreaming || validationError) {
        logWarn('Cannot send:', { text: !!text, isStreaming, validationError })
        return
      }

      setInputValue('')
      setError(null)

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
      }
      setMessages((prev) => [...prev, userMessage])

      // Create assistant message placeholder
      const assistantMessageId = (Date.now() + 1).toString()
      setMessages((prev) => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        toolCalls: [],
      }])

      setIsStreaming(true)
      abortControllerRef.current = new AbortController()

      try {
        log('Creating provider:', settings.provider, settings.model)
        const model = createProvider(settings)

        // Build initial messages for API
        const apiMessages: ApiMessage[] = [
          ...messages
            .filter((m) => m.content && m.content.trim().length > 0 && !m.content.includes('(No response'))
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          { role: 'user' as const, content: text },
        ]

        // Track accumulated state for UI updates
        let accumulatedText = ''
        const accumulatedToolCalls: ToolCallInfo[] = []

        // Run the agent loop
        const result = await runAgentLoop({
          model,
          messages: apiMessages,
          tabId,
          maxSteps: MAX_STEPS,
          abortSignal: abortControllerRef.current?.signal,
          onText: (text) => {
            accumulatedText += text
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: accumulatedText, toolCalls: [...accumulatedToolCalls] }
                  : m
              )
            )
          },
          onToolCall: (toolCall) => {
            accumulatedToolCalls.push(toolCall)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: accumulatedText, toolCalls: [...accumulatedToolCalls] }
                  : m
              )
            )
          },
          onToolResult: (toolCall) => {
            const index = accumulatedToolCalls.findIndex(tc => tc.id === toolCall.id)
            if (index !== -1) {
              accumulatedToolCalls[index] = toolCall
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: accumulatedText, toolCalls: [...accumulatedToolCalls] }
                  : m
              )
            )
          }
        })

        log('Agent loop complete:', {
          steps: result.steps,
          finishReason: result.finishReason,
          textLength: result.text.length,
          toolCalls: result.toolCalls.length
        })

        // Final update
        if (result.text || result.toolCalls.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: result.text, toolCalls: result.toolCalls }
                : m
            )
          )
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: '(No response received from the model)' }
                : m
            )
          )
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        logError('Agent loop error:', err)

        const isAbortError = errorMessage === 'AbortError' || errorMessage.includes('aborted')
        if (!isAbortError) {
          setError(errorMessage)
        }

        // Keep partial results if any
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
    [inputValue, isStreaming, validationError, settings, messages, tabId]
  )

  const handleStop = useCallback(() => {
    log('Stop clicked')
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const canSend = !isStreaming && inputValue.trim() && !validationError

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

  const handleClear = useCallback(() => {
    setMessages([])
    setError(null)
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
      setMessages([])
      setError(null)
    },
    [updateSettings]
  )

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
    <div className="agent-chat">
      <div className="agent-header">
        <div className="agent-info">
          <span className="provider-badge">{currentProvider.name}</span>
          <span className="model-name">{settings.model}</span>
          {tabId > 0 && <span className="tab-badge">Tab {tabId}</span>}
        </div>
        <div className="agent-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="button-icon"
              onClick={handleClear}
              title="Clear chat"
              aria-label="Clear chat"
            >
              [x]
            </button>
          )}
          <button
            type="button"
            className="button-icon"
            onClick={handleOpenSettings}
            title="Settings"
            aria-label="Open settings"
          >
            [=]
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

      <div className="message-list">
        {messages.length === 0 ? (
          <div className="message-list-empty">
            <div className="empty-state">
              <p>Browser Automation Agent</p>
              <p className="help-text">
                Ask me to interact with the current page - click buttons, fill forms, navigate, and more.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const hasContent = message.content && message.content.trim().length > 0
            const hasToolCalls = message.toolCalls && message.toolCalls.length > 0
            const isEmptyAssistant = message.role === 'assistant' && !hasContent && !hasToolCalls

            return (
              <div
                key={message.id}
                className={`message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}
              >
                <div className="message-header">
                  <span className="message-role">
                    {message.role === 'user' ? 'You' : 'Agent'}
                  </span>
                </div>
                <div className="message-content">
                  {hasContent && (
                    <div className="message-text">{message.content}</div>
                  )}
                  {hasToolCalls && (
                    <div className="message-tool-calls">
                      {message.toolCalls!.map((tc) => (
                        <ToolCallDisplay key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}
                  {isEmptyAssistant && isStreaming && (
                    <div className="message-text message-loading">Thinking...</div>
                  )}
                  {isEmptyAssistant && !isStreaming && (
                    <div className="message-text message-error">(Empty response)</div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {isStreaming && (
        <div className="streaming-controls">
          <button
            type="button"
            className="stop-button"
            onClick={handleStop}
            aria-label="Stop generation"
          >
            Stop
          </button>
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            validationError
              ? 'Configure your API key to start...'
              : 'Ask me to do something on this page...'
          }
          disabled={isStreaming || !!validationError}
          rows={2}
        />
        <button
          type="submit"
          className="send-button"
          disabled={!canSend}
          aria-label="Send message"
        >
          {isStreaming ? '...' : '>'}
        </button>
      </form>

      {showSettings && (
        <div className="settings-overlay">
          <SettingsPanel
            settings={settings}
            onSave={handleSaveSettings}
            onClose={handleCloseSettings}
          />
        </div>
      )}
    </div>
  )
}
