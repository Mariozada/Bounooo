import { streamText, type CoreMessage, type UserContent } from 'ai'
import { XMLStreamParser, STREAM_EVENT_TYPES, type ToolCallEvent } from '../streamParser'
import type { AgentSession, StepResult, ToolCallInfo, Message, ContentPart } from './types'
import { getMessageText } from './types'
import { getTracer, type SpanContext, type TracingConfig, type ChatMessage } from '../tracing'

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
}

function getProviderOptions(provider?: string, reasoningEnabled?: boolean): Record<string, unknown> | undefined {
  if (!reasoningEnabled) return undefined

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

  if (provider === 'google') {
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: 8000,
        },
      },
    }
  }

  return undefined
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

  // Start LLM span if tracing enabled
  const tracer = getTracer(callbacks?.tracing?.config)
  const llmSpan = callbacks?.tracing ? tracer.startLLMSpan({
    model: callbacks.tracing.modelName ?? 'unknown',
    provider: callbacks.tracing.provider,
    inputMessages: session.messages.map(m => ({
      role: m.role as ChatMessage['role'],
      content: getMessageText(m),  // Extract text for tracing
    })),
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
    const providerOptions = getProviderOptions(callbacks?.provider, callbacks?.reasoningEnabled)

    const result = await streamText({
      model: session.model,
      system: session.systemPrompt,
      messages: sdkMessages,
      abortSignal: session.abortSignal,
      providerOptions,
    })

    // Use fullStream to capture reasoning events
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        rawOutput += part.textDelta
        parser.processChunk(part.textDelta)
      } else if (part.type === 'reasoning') {
        reasoning += part.text
        callbacks?.onReasoningDelta?.(part.text)
      }
    }

    parser.flush()

    // End LLM span with RAW output (original, unfiltered)
    llmSpan?.end({
      outputMessage: rawOutput ? { role: 'assistant', content: rawOutput } : undefined,
      toolCalls: toolCalls.map(tc => ({
        name: tc.name,
        input: tc.input,
      })),
    })

    return { text, toolCalls, reasoning: reasoning || undefined }
  } catch (err) {
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
