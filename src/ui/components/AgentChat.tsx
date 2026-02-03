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
import { generateText, type CoreMessage, type CoreToolMessage } from 'ai'
import { useSettings } from '../hooks/useSettings'
import { createProvider, validateSettings, PROVIDER_CONFIGS } from '@agent/index'
import { SettingsPanel } from './SettingsPanel'
import { ToolCallDisplay, type ToolCallInfo } from './ToolCallDisplay'
import { browserTools, setCurrentTabId } from '../constants/agentTools'
import { BROWSER_AGENT_SYSTEM_PROMPT } from '../constants/systemPrompt'

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
        setCurrentTabId(tabId)

        // Build initial messages for API
        const apiMessages: CoreMessage[] = [
          ...messages
            .filter((m) => m.content && m.content.trim().length > 0 && !m.content.includes('(No response'))
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          { role: 'user' as const, content: text },
        ]

        // Manual agent loop
        let currentMessages = [...apiMessages]
        let step = 0
        let finalText = ''
        const allToolCalls: ToolCallInfo[] = []

        log('Starting manual agent loop, max steps:', MAX_STEPS)

        while (step < MAX_STEPS) {
          log(`=== Step ${step + 1} ===`)

          // Check for abort
          if (abortControllerRef.current?.signal.aborted) {
            log('Aborted by user')
            break
          }

          const result = await generateText({
            model,
            system: BROWSER_AGENT_SYSTEM_PROMPT,
            messages: currentMessages,
            tools: browserTools,
            abortSignal: abortControllerRef.current?.signal,
          })

          log('Step result:', {
            finishReason: result.finishReason,
            textLength: result.text?.length || 0,
            toolCalls: result.toolCalls?.length || 0,
            toolResults: result.toolResults?.length || 0,
          })

          // Collect any text
          if (result.text) {
            finalText += result.text
            log('Got text:', result.text.slice(0, 100))

            // Update UI with text
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: finalText, toolCalls: allToolCalls }
                  : m
              )
            )
          }

          // Process tool calls
          if (result.toolCalls && result.toolCalls.length > 0) {
            log('Processing', result.toolCalls.length, 'tool calls')

            for (const tc of result.toolCalls) {
              const toolCallInfo: ToolCallInfo = {
                id: tc.toolCallId,
                name: tc.toolName,
                input: tc.args as Record<string, unknown>,
                status: 'running',
              }
              allToolCalls.push(toolCallInfo)

              // Update UI to show tool is running
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: finalText, toolCalls: [...allToolCalls] }
                    : m
                )
              )
            }

            // Tool results come from the SDK's automatic execution
            if (result.toolResults && result.toolResults.length > 0) {
              for (const tr of result.toolResults) {
                const toolCall = allToolCalls.find((tc) => tc.id === tr.toolCallId)
                if (toolCall) {
                  const hasError = tr.result && typeof tr.result === 'object' && 'error' in tr.result
                  toolCall.result = tr.result
                  toolCall.status = hasError ? 'error' : 'completed'
                  toolCall.error = hasError ? String((tr.result as { error: unknown }).error) : undefined
                  log('Tool result for', toolCall.name, ':', toolCall.status)
                }
              }

              // Update UI with tool results
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: finalText, toolCalls: [...allToolCalls] }
                    : m
                )
              )
            }
          }

          // Check if we should continue
          if (result.finishReason === 'stop' || result.finishReason === 'end-turn') {
            log('LLM finished with reason:', result.finishReason)
            break
          }

          if (result.finishReason === 'tool-calls' && result.response?.messages) {
            // Add assistant message and tool results to conversation
            log('Adding response messages to continue conversation')
            currentMessages = [...currentMessages, ...result.response.messages as CoreMessage[]]
          } else if (result.finishReason !== 'tool-calls') {
            log('Unexpected finish reason:', result.finishReason)
            break
          } else {
            log('No response messages to continue with')
            break
          }

          step++
        }

        if (step >= MAX_STEPS) {
          logWarn('Reached max steps limit')
          finalText += '\n\n(Reached maximum steps limit)'
        }

        // Final update
        log('Agent loop complete, total steps:', step + 1)
        log('Final text length:', finalText.length)
        log('Total tool calls:', allToolCalls.length)

        if (finalText || allToolCalls.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: finalText, toolCalls: allToolCalls }
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
