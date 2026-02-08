import { streamText, type CoreMessage, type UserContent } from 'ai'
import { XMLStreamParser, STREAM_EVENT_TYPES, type ToolCallEvent } from '../streamParser'
import type { AgentSession, StepResult, ToolCallInfo, Message, ContentPart } from './types'
import { getMessageText } from './types'
import { getTracer, type SpanContext, type TracingConfig, type ChatMessage } from '../tracing'
import {
  generateRequestId,
  getCapturedParams,
  clearCapturedParams,
  formatCapturedParams,
} from '../debugMiddleware'

// Convert our Message format to Vercel AI SDK CoreMessage format
function convertToSDKMessages(messages: Message[]): CoreMessage[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return {
        role: msg.role,
        content: msg.content,
      } as CoreMessage
    }

    // Multimodal content
    if (msg.role === 'user') {
      const userContent: UserContent = msg.content.map(part => {
        switch (part.type) {
          case 'text':
            return { type: 'text' as const, text: part.text }
          case 'image':
            return {
              type: 'image' as const,
              image: part.image,
              ...(part.mediaType && { mimeType: part.mediaType }),
            }
          case 'file':
            return {
              type: 'file' as const,
              data: part.data,
              mimeType: part.mediaType,
              ...(part.filename && { name: part.filename }),
            }
        }
      })
      return {
        role: 'user' as const,
        content: userContent,
      }
    }

    // Assistant messages - extract just text for now
    // (assistant multimodal responses would need separate handling)
    const textContent = msg.content
      .filter((part): part is ContentPart & { type: 'text' } => part.type === 'text')
      .map(part => part.text)
      .join('')

    return {
      role: 'assistant' as const,
      content: textContent,
    }
  })
}

export interface StreamTracingOptions {
  config: TracingConfig
  parentContext: SpanContext
  modelName?: string
  provider?: string
}

export interface StreamCallbacks {
  onTextDelta?: (text: string) => void
  onToolCallParsed?: (toolCall: ToolCallInfo) => void
  onReasoningDelta?: (text: string) => void
  tracing?: StreamTracingOptions
  reasoningEnabled?: boolean
  provider?: string
  modelId?: string
  geminiThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
}

function isOpenAIReasoningModel(modelId?: string): boolean {
  if (!modelId) return false
  // Match o1, o1-mini, o1-pro, o3, o3-mini, o4-mini, etc.
  // Also match openrouter format: openai/o1, openai/o3-mini, etc.
  return /(?:^|\/)(o[1-4])(?:-|$)/i.test(modelId)
}

function isAnthropicModel(modelId?: string): boolean {
  if (!modelId) return false
  // Match anthropic/claude-* or just claude-*
  return modelId.toLowerCase().includes('claude')
}

function isGoogleModel(modelId?: string): boolean {
  if (!modelId) return false
  // Match google/gemini-* or just gemini-*
  return modelId.toLowerCase().includes('gemini')
}

function isGemini3Model(modelId?: string): boolean {
  if (!modelId) return false
  return modelId.toLowerCase().includes('gemini-3')
}

function getProviderOptions(provider?: string, reasoningEnabled?: boolean, modelId?: string, geminiThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'): Record<string, unknown> | undefined {
  if (!reasoningEnabled) return undefined

  // Direct Anthropic provider
  if (provider === 'anthropic') {
    return {
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 16000,
        },
      },
    }
  }

  // Direct Google provider
  if (provider === 'google') {
    return {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          ...(isGemini3Model(modelId) && geminiThinkingLevel && { thinkingLevel: geminiThinkingLevel }),
        },
      },
    }
  }

  // Direct OpenAI provider with o-series models
  if (provider === 'openai' && isOpenAIReasoningModel(modelId)) {
    return {
      openai: {
        reasoningEffort: 'medium',
      },
    }
  }

  // xAI Grok reasoning models handle reasoning automatically, no provider options needed

  // OpenRouter - detect underlying provider from model ID
  if (provider === 'openrouter') {
    if (isOpenAIReasoningModel(modelId)) {
      return {
        openai: {
          reasoningEffort: 'medium',
        },
      }
    }
    if (isAnthropicModel(modelId)) {
      return {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: 16000,
          },
        },
      }
    }
    if (isGoogleModel(modelId)) {
      return {
        google: {
          thinkingConfig: {
            includeThoughts: true,
            ...(isGemini3Model(modelId) && geminiThinkingLevel && { thinkingLevel: geminiThinkingLevel }),
          },
        },
      }
    }
  }

  return undefined
}

const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 2000

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return true
  }
  if (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 429) return true
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function streamLLMResponse(
  session: AgentSession,
  callbacks?: StreamCallbacks
): Promise<StepResult> {
  const parser = new XMLStreamParser()
  const toolCalls: ToolCallInfo[] = []
  let text = ''
  let reasoning = ''
  let rawOutput = ''  // Original LLM output for Phoenix (no filtering)

  // Generate a unique request ID for debug middleware correlation
  const requestId = generateRequestId()

  // Start LLM span if tracing enabled
  // Note: We'll update it with SDK params after streaming completes
  const tracer = getTracer(callbacks?.tracing?.config)

  // Build input messages for tracing - system prompt first, then conversation
  const tracedInputMessages: ChatMessage[] = []
  if (session.systemPrompt) {
    tracedInputMessages.push({
      role: 'system',
      content: session.systemPrompt,
    })
  }
  tracedInputMessages.push(...session.messages.map(m => ({
    role: m.role as ChatMessage['role'],
    content: getMessageText(m),
  })))

  const llmSpan = callbacks?.tracing ? tracer.startLLMSpan({
    model: callbacks.tracing.modelName ?? 'unknown',
    provider: callbacks.tracing.provider,
    inputMessages: tracedInputMessages,
    parentContext: callbacks.tracing.parentContext,
  }) : null

  // Convert messages to SDK format (handles multimodal content)
  const sdkMessages = convertToSDKMessages(session.messages)

  parser.on(STREAM_EVENT_TYPES.TEXT_DELTA, (event) => {
    const delta = event.data as string
    text += delta
    callbacks?.onTextDelta?.(delta)
  })

  parser.on(STREAM_EVENT_TYPES.TOOL_CALL_DONE, (event) => {
    const tc = event.data as ToolCallEvent
    const toolCallInfo: ToolCallInfo = {
      id: tc.id,
      name: tc.name,
      input: tc.params,
      status: 'pending',
    }
    toolCalls.push(toolCallInfo)
    callbacks?.onToolCallParsed?.(toolCallInfo)
  })

  try {
    // Build provider options, including debug middleware request ID
    const baseProviderOptions = getProviderOptions(callbacks?.provider, callbacks?.reasoningEnabled, callbacks?.modelId, callbacks?.geminiThinkingLevel) || {}
    const providerOptions = {
      ...baseProviderOptions,
      // Pass request ID to debug middleware for correlation
      debugMiddleware: { requestId },
    }

    // Retry loop for rate limit (429) errors
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await streamText({
          model: session.model,
          system: session.systemPrompt,
          messages: sdkMessages,
          abortSignal: session.abortSignal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          providerOptions: providerOptions as any,
        })

        // Use fullStream to capture reasoning events
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            rawOutput += part.text
            parser.processChunk(part.text)
          } else if (part.type === 'reasoning-delta') {
            reasoning += part.text
            callbacks?.onReasoningDelta?.(part.text)
          }
        }

        break // Success, exit retry loop
      } catch (err) {
        if (attempt < MAX_RETRIES && isRateLimitError(err) && !session.abortSignal?.aborted) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
          console.log(`[Stream] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
          await sleep(delay)
          continue
        }
        throw err
      }
    }

    parser.flush()

    // Retrieve captured SDK params from debug middleware
    const capturedParams = getCapturedParams(requestId)

    // Build SDK params and response for tracing
    let sdkParamsForTrace: {
      messagesRaw?: unknown
      providerOptions?: Record<string, unknown>
      settings?: Record<string, unknown>
      tools?: unknown[]
    } | undefined
    let sdkResponseForTrace: {
      finishReason?: string
      usage?: { promptTokens?: number; completionTokens?: number }
    } | undefined

    if (capturedParams) {
      const formatted = formatCapturedParams(capturedParams)

      // SDK params captured by middleware
      sdkParamsForTrace = {
        messagesRaw: capturedParams.prompt,
        providerOptions: formatted.sdkProviderOptions,
        settings: formatted.sdkSettings,
        tools: capturedParams.tools as unknown[] | undefined,
      }

      // SDK response info
      sdkResponseForTrace = {
        finishReason: capturedParams.response?.finishReason,
        usage: capturedParams.response?.usage,
      }

      // Log for debugging
      console.log('[Stream] SDK params captured:', {
        requestId,
        settingsKeys: Object.keys(formatted.sdkSettings),
        providerOptionsKeys: Object.keys(formatted.sdkProviderOptions),
        hasMessages: !!capturedParams.prompt,
        finishReason: capturedParams.response?.finishReason,
        promptTokens: capturedParams.response?.usage?.promptTokens,
        completionTokens: capturedParams.response?.usage?.completionTokens,
      })
    }

    // End LLM span with RAW output, SDK params, and SDK response
    llmSpan?.end({
      outputMessage: rawOutput ? { role: 'assistant', content: rawOutput } : undefined,
      toolCalls: toolCalls.map(tc => ({
        name: tc.name,
        input: tc.input,
      })),
      sdkParams: sdkParamsForTrace,
      sdkResponse: sdkResponseForTrace,
    })

    // Clean up captured params
    clearCapturedParams(requestId)

    return { text, toolCalls, reasoning: reasoning || undefined }
  } catch (err) {
    // Clean up captured params on error
    clearCapturedParams(requestId)

    // End LLM span with error (still include raw output captured so far)
    llmSpan?.end({
      outputMessage: rawOutput ? { role: 'assistant', content: rawOutput } : undefined,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    throw err
  }
}

export function hasToolCalls(result: StepResult): boolean {
  return result.toolCalls.length > 0
}
