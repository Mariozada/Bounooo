import { useState, useRef, useCallback, useEffect } from 'react'
import {
  createProvider,
  getModelConfig,
  runWorkflow,
  type ToolCallInfo,
  type AssistantMessageSegment,
  type Message as AgentMessage,
  type ContentPart,
} from '@agent/index'
import { MessageTypes } from '@shared/messages'
import type { ProviderSettings, TracingSettings } from '@shared/settings'
import type { AttachmentFile } from '@ui/components/FileAttachment'
import {
  parseSlashCommand,
  getSkillByNameFromCache,
  parseSkillArguments,
  initializeBuiltinSkills,
  loadSkills,
  getAutoDiscoverableSkills,
  type Skill,
} from '@skills/index'
import { McpManager, loadMcpServers, parsePrefixedName } from '@mcp/index'
import type { ToolDefinition } from '@tools/definitions'

const DEBUG = true
const MAX_STEPS = 15
const log = (...args: unknown[]) => DEBUG && console.log('[useWorkflowStream]', ...args)
const logWarn = (...args: unknown[]) => DEBUG && console.warn('[useWorkflowStream]', ...args)
const logError = (...args: unknown[]) => console.error('[useWorkflowStream]', ...args)

function sendScreenGlowOff(): void {
  chrome.runtime.sendMessage({
    type: MessageTypes.SET_SCREEN_GLOW,
    active: false,
  }).catch(() => {})
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AttachmentFile[]
}

interface StreamCallbacks {
  onAddUserMessage?: (content: string, attachments?: AttachmentFile[]) => Promise<{ id: string; threadId: string }>
  onAddAssistantMessage?: (threadId?: string, parentId?: string, modelInfo?: { model: string; provider: string }) => Promise<{ id: string }>
  onUpdateAssistantMessage?: (
    id: string,
    updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[]; assistantSegments?: AssistantMessageSegment[] }
  ) => void
}

interface UseWorkflowStreamOptions {
  settings: ProviderSettings
  tabId: number
  groupId?: number
  messages: Message[]
  callbacks: StreamCallbacks
}

export type QueueMode = 'immediate' | 'after_tool_result' | 'after_completion'

interface SendMessageOptions {
  mode?: QueueMode
}

interface QueuedMessage {
  id: string
  text: string
  attachments: AttachmentFile[]
}

export interface QueuedMessagePreview {
  id: string
  preview: string
  attachmentCount: number
}

interface UseWorkflowStreamReturn {
  isStreaming: boolean
  error: string | null
  pendingAfterToolResult: number
  pendingAfterCompletion: number
  queuedAfterToolResult: QueuedMessagePreview[]
  queuedAfterCompletion: QueuedMessagePreview[]
  sendMessage: (text: string, attachments?: AttachmentFile[], options?: SendMessageOptions) => Promise<void>
  sendEditedMessage: (
    originalMessageId: string,
    newContent: string,
    messagesBeforeEdit: Message[],
    onEditUserMessage: (messageId: string, newContent: string) => Promise<{ id: string; threadId: string }>
  ) => Promise<void>
  removeQueuedAfterToolResult: (id: string) => void
  removeQueuedAfterCompletion: (id: string) => void
  clearQueuedAfterToolResult: () => void
  clearQueuedAfterCompletion: () => void
  stop: () => void
  clearError: () => void
}

function buildMessageContent(content: string, attachments?: AttachmentFile[]): string | ContentPart[] {
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

function buildConversationHistory(messages: Message[]): AgentMessage[] {
  return messages
    .filter((m) => m.content?.trim() || m.attachments?.length)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: buildMessageContent(m.content, m.attachments),
    }))
}

function buildQueuePreview(message: QueuedMessage): QueuedMessagePreview {
  const compact = message.text.replace(/\s+/g, ' ').trim()
  const basePreview = compact.length > 0
    ? compact
    : '[Attachment only]'

  return {
    id: message.id,
    preview: basePreview.length > 72 ? `${basePreview.slice(0, 72)}...` : basePreview,
    attachmentCount: message.attachments.length,
  }
}

export function useWorkflowStream({
  settings,
  tabId,
  groupId,
  messages,
  callbacks,
}: UseWorkflowStreamOptions): UseWorkflowStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skillsReady, setSkillsReady] = useState(false)
  const [pendingAfterToolResult, setPendingAfterToolResult] = useState(0)
  const [pendingAfterCompletion, setPendingAfterCompletion] = useState(0)
  const [queuedAfterToolResult, setQueuedAfterToolResult] = useState<QueuedMessagePreview[]>([])
  const [queuedAfterCompletion, setQueuedAfterCompletion] = useState<QueuedMessagePreview[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const isStreamingRef = useRef(false)
  const afterToolResultQueueRef = useRef<QueuedMessage[]>([])
  const afterCompletionQueueRef = useRef<QueuedMessage[]>([])
  const hasCompletedToolCallInRunRef = useRef(false)
  const runMessageRef = useRef<((text: string, attachments: AttachmentFile[]) => Promise<void>) | null>(null)
  const queueCounterRef = useRef(0)

  const { onAddUserMessage, onAddAssistantMessage, onUpdateAssistantMessage } = callbacks

  // Initialize skills on mount
  useEffect(() => {
    initializeBuiltinSkills()
      .then(() => loadSkills())
      .then(() => setSkillsReady(true))
      .catch((err) => {
        logError('Failed to initialize skills:', err)
        setSkillsReady(true) // Continue without skills
      })
  }, [])

  const setStreamingState = useCallback((next: boolean) => {
    isStreamingRef.current = next
    setIsStreaming(next)
  }, [])

  const syncQueueCounts = useCallback(() => {
    setPendingAfterToolResult(afterToolResultQueueRef.current.length)
    setPendingAfterCompletion(afterCompletionQueueRef.current.length)
    setQueuedAfterToolResult(afterToolResultQueueRef.current.map(buildQueuePreview))
    setQueuedAfterCompletion(afterCompletionQueueRef.current.map(buildQueuePreview))
  }, [])

  const dequeueNextQueuedMessage = useCallback((): QueuedMessage | null => {
    if (afterToolResultQueueRef.current.length > 0) {
      const queuedItems = afterToolResultQueueRef.current.splice(0)
      const next: QueuedMessage = {
        text: queuedItems.map((item) => item.text).join('\n'),
        attachments: queuedItems.flatMap((item) => item.attachments),
      }
      syncQueueCounts()
      return next
    }

    const next = afterCompletionQueueRef.current.shift() ?? null
    if (next) {
      syncQueueCounts()
    }

    return next
  }, [syncQueueCounts])

  const maybeStartNextQueuedMessage = useCallback(() => {
    if (isStreamingRef.current) {
      return
    }

    const next = dequeueNextQueuedMessage()
    if (!next) {
      return
    }

    const runMessage = runMessageRef.current
    if (!runMessage) {
      return
    }

    void runMessage(next.text, next.attachments)
  }, [dequeueNextQueuedMessage])

  const enqueueMessage = useCallback(
    (text: string, attachments: AttachmentFile[], mode: Exclude<QueueMode, 'immediate'>) => {
      const queuedMessage: QueuedMessage = {
        id: `q_${Date.now()}_${++queueCounterRef.current}`,
        text,
        attachments: [...attachments],
      }

      if (mode === 'after_completion') {
        afterCompletionQueueRef.current.push(queuedMessage)
      } else {
        afterToolResultQueueRef.current.push(queuedMessage)

        // If a tool has already completed in this run, trigger the interruption now.
        if (hasCompletedToolCallInRunRef.current && abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          abortControllerRef.current.abort()
        }
      }

      syncQueueCounts()
      log('Message queued:', {
        mode,
        afterToolResult: afterToolResultQueueRef.current.length,
        afterCompletion: afterCompletionQueueRef.current.length,
      })
    },
    [syncQueueCounts]
  )

  const removeQueuedAfterToolResult = useCallback((id: string) => {
    const index = afterToolResultQueueRef.current.findIndex((message) => message.id === id)
    if (index === -1) return
    afterToolResultQueueRef.current.splice(index, 1)
    syncQueueCounts()
  }, [syncQueueCounts])

  const removeQueuedAfterCompletion = useCallback((id: string) => {
    const index = afterCompletionQueueRef.current.findIndex((message) => message.id === id)
    if (index === -1) return
    afterCompletionQueueRef.current.splice(index, 1)
    syncQueueCounts()
  }, [syncQueueCounts])

  const clearQueuedAfterToolResult = useCallback(() => {
    if (afterToolResultQueueRef.current.length === 0) return
    afterToolResultQueueRef.current = []
    syncQueueCounts()
  }, [syncQueueCounts])

  const clearQueuedAfterCompletion = useCallback(() => {
    if (afterCompletionQueueRef.current.length === 0) return
    afterCompletionQueueRef.current = []
    syncQueueCounts()
  }, [syncQueueCounts])

  const runAgentWorkflow = useCallback(
    async (
      agentMessages: AgentMessage[],
      assistantMessageId: string,
      abortSignal: AbortSignal,
      skillOptions?: {
        activeSkill?: { skill: Skill; args?: Record<string, string> }
        availableSkills?: Skill[]
      },
      mcpOptions?: {
        mcpTools?: ToolDefinition[]
        mcpManager?: McpManager
      }
    ) => {
      const model = createProvider(settings)
      let accumulatedText = ''
      let accumulatedReasoning = ''
      const accumulatedToolCalls: ToolCallInfo[] = []
      const assistantSegments: AssistantMessageSegment[] = []
      let textSegmentCounter = 0

      const cloneSegments = (): AssistantMessageSegment[] => assistantSegments.map((segment) => ({ ...segment }))

      const appendTextSegment = (delta: string): void => {
        const lastSegment = assistantSegments[assistantSegments.length - 1]
        if (lastSegment?.type === 'text') {
          lastSegment.text += delta
          return
        }

        textSegmentCounter += 1
        assistantSegments.push({
          type: 'text',
          id: `txt_${textSegmentCounter}`,
          text: delta,
        })
      }

      const ensureToolSegment = (toolCallId: string): void => {
        const exists = assistantSegments.some(
          (segment) => segment.type === 'tool_call' && segment.toolCallId === toolCallId
        )
        if (!exists) {
          assistantSegments.push({
            type: 'tool_call',
            id: `tool_${toolCallId}`,
            toolCallId,
          })
        }
      }

      const updateAssistant = () => {
        if (onUpdateAssistantMessage) {
          onUpdateAssistantMessage(assistantMessageId, {
            content: accumulatedText,
            reasoning: accumulatedReasoning,
            toolCalls: [...accumulatedToolCalls],
            assistantSegments: cloneSegments(),
          })
        }
      }

      const modelConfig = getModelConfig(settings.provider, settings.model)
      const effectiveReasoningEnabled =
        modelConfig?.reasoning === 'always'
          ? true
          : modelConfig?.reasoning === 'hybrid'
            ? settings.reasoningEnabled
            : false

      const result = await runWorkflow({
        model,
        messages: agentMessages,
        tabId,
        groupId,
        maxSteps: MAX_STEPS,
        abortSignal,
        callbacks: {
          onTextDelta: (delta) => {
            accumulatedText += delta
            appendTextSegment(delta)
            updateAssistant()
          },
          onReasoningDelta: (delta) => {
            accumulatedReasoning += delta
            updateAssistant()
          },
          onToolStart: (toolCall) => {
            const exists = accumulatedToolCalls.some((tc) => tc.id === toolCall.id)
            if (!exists) {
              accumulatedToolCalls.push(toolCall)
              ensureToolSegment(toolCall.id)
            }
            updateAssistant()
          },
          onToolDone: (toolCall) => {
            hasCompletedToolCallInRunRef.current = true
            const index = accumulatedToolCalls.findIndex((tc) => tc.id === toolCall.id)
            if (index !== -1) {
              accumulatedToolCalls[index] = toolCall
            }
            updateAssistant()

            if (afterToolResultQueueRef.current.length > 0 && abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
              log('Interrupting after completed tool call to run queued clarification')
              abortControllerRef.current.abort()
            }
          },
        },
        tracing: settings.tracing as TracingSettings,
        modelName: settings.model,
        provider: settings.provider,
        reasoningEnabled: effectiveReasoningEnabled,
        // Pass skill options to workflow
        activeSkill: skillOptions?.activeSkill,
        availableSkills: skillOptions?.availableSkills,
        // Pass MCP tools to workflow
        mcpTools: mcpOptions?.mcpTools,
        // Route MCP tool calls to the MCP manager
        ...(mcpOptions?.mcpManager && {
          toolExecutor: async (name: string, params: Record<string, unknown>) => {
            if (parsePrefixedName(name)) {
              return mcpOptions.mcpManager!.executeTool(name, params)
            }
            // Fall through to normal chrome.runtime.sendMessage for built-in tools
            const response = await chrome.runtime.sendMessage({
              type: 'EXECUTE_TOOL',
              tool: name,
              params,
            })
            if (response?.success) {
              return response.result ?? { success: true }
            }
            return { error: response?.error ?? 'Tool execution failed' }
          },
        }),
      })

      log('Agent loop complete:', {
        steps: result.steps,
        finishReason: result.finishReason,
        textLength: result.text.length,
        toolCalls: result.toolCalls.length,
      })

      if (assistantSegments.length === 0 && result.text) {
        textSegmentCounter += 1
        assistantSegments.push({
          type: 'text',
          id: `txt_${textSegmentCounter}`,
          text: result.text,
        })
      }

      for (const toolCall of result.toolCalls) {
        ensureToolSegment(toolCall.id)
      }

      if (onUpdateAssistantMessage) {
        onUpdateAssistantMessage(assistantMessageId, {
          content: result.text,
          reasoning: accumulatedReasoning,
          toolCalls: result.toolCalls,
          assistantSegments: cloneSegments(),
        })
      }

      return result
    },
    [settings, tabId, groupId, onUpdateAssistantMessage]
  )

  const runMessage = useCallback(
    async (text: string, messageAttachments: AttachmentFile[] = []) => {
      log('=== Send Message ===')
      const hasContent = text.trim() || messageAttachments.length > 0
      if (!hasContent || isStreamingRef.current) {
        logWarn('Cannot send:', { text: !!text, attachments: messageAttachments.length, isStreaming: isStreamingRef.current })
        return
      }

      setError(null)
      hasCompletedToolCallInRunRef.current = false

      // Skills are initialized async on mount; ensure commands don't race startup.
      if (!skillsReady) {
        await loadSkills()
      }

      // Check for slash command (skill invocation)
      let activeSkill: { skill: Skill; args?: Record<string, string> } | undefined
      let messageToSend = text
      const slashCommand = parseSlashCommand(text)

      if (slashCommand) {
        log('Slash command detected:', slashCommand)
        const skill = await getSkillByNameFromCache(slashCommand.skillName)

        if (skill) {
          log('Skill found:', skill.name)
          const args = parseSkillArguments(slashCommand.args, skill.arguments)
          activeSkill = { skill, args }

          // Transform the message: remove slash command, keep just the task
          // If there are args, treat them as the user's actual request
          // Otherwise, create a clear instruction based on the skill
          if (slashCommand.args.trim()) {
            messageToSend = slashCommand.args.trim()
          } else {
            // Default messages for known skills
            messageToSend = `Use the ${skill.name} skill on the current web page. Follow the skill instructions.`
          }
        } else {
          log('Skill not found:', slashCommand.skillName)
          // Not a valid skill - treat as regular message
        }
      }

      // Only pass auto-discoverable skills (not commands like /summary)
      const availableSkills = await getAutoDiscoverableSkills()

      // Load MCP server configs and build tool definitions
      let mcpManager: McpManager | undefined
      let mcpTools: ToolDefinition[] | undefined
      try {
        const mcpServers = await loadMcpServers()
        const enabledServers = mcpServers.filter((s) => s.enabled && s.cachedTools?.length)
        if (enabledServers.length > 0) {
          mcpManager = new McpManager()
          mcpManager.loadFromConfigs(enabledServers)
          mcpTools = mcpManager.getToolDefinitions()
          log('MCP tools loaded:', mcpTools.length)
        }
      } catch (err) {
        logError('Failed to load MCP servers:', err)
      }

      const conversationHistory = buildConversationHistory(messages)

      let userMessageId: string
      let messageThreadId: string | undefined
      if (onAddUserMessage) {
        // Store the original message (including slash command) for history
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

      const agentMessages: AgentMessage[] = [
        ...conversationHistory,
        { role: 'user' as const, content: buildMessageContent(messageToSend, messageAttachments) },
      ]

      setStreamingState(true)
      abortControllerRef.current = new AbortController()

      try {
        await runAgentWorkflow(
          agentMessages,
          assistantMessageId,
          abortControllerRef.current.signal,
          { activeSkill, availableSkills },
          mcpTools?.length ? { mcpTools, mcpManager } : undefined,
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        logError('Agent loop error:', err)

        const isAbortError = errorMessage === 'AbortError' || errorMessage.includes('aborted')
        if (!isAbortError) {
          setError(errorMessage)
        }
      } finally {
        sendScreenGlowOff()
        setStreamingState(false)
        abortControllerRef.current = null
        hasCompletedToolCallInRunRef.current = false
        log('=== Agent loop finished ===')
        maybeStartNextQueuedMessage()
      }
    },
    [
      groupId,
      messages,
      maybeStartNextQueuedMessage,
      onAddAssistantMessage,
      onAddUserMessage,
      runAgentWorkflow,
      settings.model,
      settings.provider,
      setStreamingState,
      skillsReady,
      tabId,
    ]
  )

  useEffect(() => {
    runMessageRef.current = runMessage
  }, [runMessage])

  const sendMessage = useCallback(
    async (
      text: string,
      messageAttachments: AttachmentFile[] = [],
      options?: SendMessageOptions
    ) => {
      const hasContent = text.trim() || messageAttachments.length > 0
      if (!hasContent) {
        return
      }

      const requestedMode = options?.mode ?? 'immediate'
      if (isStreamingRef.current) {
        const queueMode = requestedMode === 'after_completion' ? 'after_completion' : 'after_tool_result'
        enqueueMessage(text, messageAttachments, queueMode)
        return
      }

      await runMessage(text, messageAttachments)
    },
    [enqueueMessage, runMessage]
  )

  const sendEditedMessage = useCallback(
    async (
      originalMessageId: string,
      newContent: string,
      messagesBeforeEdit: Message[],
      onEditUserMessage: (messageId: string, newContent: string) => Promise<{ id: string; threadId: string }>
    ) => {
      const conversationHistory = buildConversationHistory(messagesBeforeEdit)

      setStreamingState(true)
      hasCompletedToolCallInRunRef.current = false
      abortControllerRef.current = new AbortController()

      try {
        const result = await onEditUserMessage(originalMessageId, newContent)

        if (onAddAssistantMessage) {
          const assistantMsg = await onAddAssistantMessage(result.threadId, result.id, {
            model: settings.model,
            provider: settings.provider,
          })

          const agentMessages: AgentMessage[] = [
            ...conversationHistory,
            { role: 'user' as const, content: newContent },
          ]

          await runAgentWorkflow(agentMessages, assistantMsg.id, abortControllerRef.current!.signal)
        }
      } catch (err) {
        logError('Edit message failed:', err)
      } finally {
        sendScreenGlowOff()
        setStreamingState(false)
        abortControllerRef.current = null
        hasCompletedToolCallInRunRef.current = false
        maybeStartNextQueuedMessage()
      }
    },
    [settings, onAddAssistantMessage, runAgentWorkflow, setStreamingState, maybeStartNextQueuedMessage]
  )

  const stop = useCallback(() => {
    log('Stop clicked')
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Listen for STOP_AGENT from content script (via background)
  useEffect(() => {
    const listener = (message: { type: string }) => {
      if (message.type === MessageTypes.STOP_AGENT) {
        stop()
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [stop])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isStreaming,
    error,
    pendingAfterToolResult,
    pendingAfterCompletion,
    queuedAfterToolResult,
    queuedAfterCompletion,
    sendMessage,
    sendEditedMessage,
    removeQueuedAfterToolResult,
    removeQueuedAfterCompletion,
    clearQueuedAfterToolResult,
    clearQueuedAfterCompletion,
    stop,
    clearError,
  }
}
