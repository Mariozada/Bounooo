import { useState, useRef, useCallback, useEffect } from 'react'
import {
  createProvider,
  getModelConfig,
  runWorkflow,
  type ToolCallInfo,
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
  type Skill,
} from '@skills/index'

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
  onUpdateAssistantMessage?: (id: string, updates: { content?: string; reasoning?: string; toolCalls?: ToolCallInfo[] }) => void
}

interface UseWorkflowStreamOptions {
  settings: ProviderSettings
  tabId: number
  groupId?: number
  messages: Message[]
  callbacks: StreamCallbacks
}

interface UseWorkflowStreamReturn {
  isStreaming: boolean
  error: string | null
  sendMessage: (text: string, attachments?: AttachmentFile[]) => Promise<void>
  sendEditedMessage: (
    originalMessageId: string,
    newContent: string,
    messagesBeforeEdit: Message[],
    onEditUserMessage: (messageId: string, newContent: string) => Promise<{ id: string; threadId: string }>
  ) => Promise<void>
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
  const abortControllerRef = useRef<AbortController | null>(null)

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

  const runAgentWorkflow = useCallback(
    async (
      agentMessages: AgentMessage[],
      assistantMessageId: string,
      abortSignal: AbortSignal,
      skillOptions?: {
        activeSkill?: { skill: Skill; args?: Record<string, string> }
        availableSkills?: Skill[]
      }
    ) => {
      const model = createProvider(settings)
      let accumulatedText = ''
      let accumulatedReasoning = ''
      const accumulatedToolCalls: ToolCallInfo[] = []

      const updateAssistant = () => {
        if (onUpdateAssistantMessage) {
          onUpdateAssistantMessage(assistantMessageId, {
            content: accumulatedText,
            reasoning: accumulatedReasoning,
            toolCalls: accumulatedToolCalls,
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
            }
            updateAssistant()
          },
          onToolDone: (toolCall) => {
            const index = accumulatedToolCalls.findIndex((tc) => tc.id === toolCall.id)
            if (index !== -1) {
              accumulatedToolCalls[index] = toolCall
            }
            updateAssistant()
          },
        },
        tracing: settings.tracing as TracingSettings,
        modelName: settings.model,
        provider: settings.provider,
        reasoningEnabled: effectiveReasoningEnabled,
        // Pass skill options to workflow
        activeSkill: skillOptions?.activeSkill,
        availableSkills: skillOptions?.availableSkills,
      })

      log('Agent loop complete:', {
        steps: result.steps,
        finishReason: result.finishReason,
        textLength: result.text.length,
        toolCalls: result.toolCalls.length,
      })

      if (onUpdateAssistantMessage) {
        onUpdateAssistantMessage(assistantMessageId, {
          content: result.text,
          reasoning: accumulatedReasoning,
          toolCalls: result.toolCalls,
        })
      }

      return result
    },
    [settings, tabId, groupId, onUpdateAssistantMessage]
  )

  const sendMessage = useCallback(
    async (text: string, messageAttachments: AttachmentFile[] = []) => {
      log('=== Send Message ===')
      const hasContent = text.trim() || messageAttachments.length > 0
      if (!hasContent || isStreaming) {
        logWarn('Cannot send:', { text: !!text, attachments: messageAttachments.length, isStreaming })
        return
      }

      setError(null)

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

      // Load all enabled skills so the agent knows about them
      const availableSkills = await loadSkills()

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

      setIsStreaming(true)
      abortControllerRef.current = new AbortController()

      try {
        await runAgentWorkflow(
          agentMessages,
          assistantMessageId,
          abortControllerRef.current.signal,
          { activeSkill, availableSkills }
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
        setIsStreaming(false)
        abortControllerRef.current = null
        log('=== Agent loop finished ===')
      }
    },
    [isStreaming, messages, settings, tabId, groupId, onAddUserMessage, onAddAssistantMessage, runAgentWorkflow]
  )

  const sendEditedMessage = useCallback(
    async (
      originalMessageId: string,
      newContent: string,
      messagesBeforeEdit: Message[],
      onEditUserMessage: (messageId: string, newContent: string) => Promise<{ id: string; threadId: string }>
    ) => {
      const conversationHistory = buildConversationHistory(messagesBeforeEdit)

      setIsStreaming(true)
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
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [settings, onAddAssistantMessage, runAgentWorkflow]
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
    sendMessage,
    sendEditedMessage,
    stop,
    clearError,
  }
}
