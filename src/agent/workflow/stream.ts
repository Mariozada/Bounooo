import { streamText } from 'ai'
import { XMLStreamParser, STREAM_EVENT_TYPES, type ToolCallEvent } from '../streamParser'
import type { AgentSession, StepResult, ToolCallInfo } from './types'
import { getTracer, type SpanContext, type TracingConfig, type ChatMessage } from '../tracing'

export interface StreamTracingOptions {
  config: TracingConfig
  parentContext: SpanContext
  modelName?: string
  provider?: string
}

export interface StreamCallbacks {
  onTextDelta?: (text: string) => void
  onToolCallParsed?: (toolCall: ToolCallInfo) => void
  tracing?: StreamTracingOptions
}

export async function streamLLMResponse(
  session: AgentSession,
  callbacks?: StreamCallbacks
): Promise<StepResult> {
  const parser = new XMLStreamParser()
  const toolCalls: ToolCallInfo[] = []
  let text = ''
  let rawOutput = ''  // Original LLM output for Phoenix (no filtering)

  // Start LLM span if tracing enabled
  const tracer = getTracer(callbacks?.tracing?.config)
  const llmSpan = callbacks?.tracing ? tracer.startLLMSpan({
    model: callbacks.tracing.modelName ?? 'unknown',
    provider: callbacks.tracing.provider,
    inputMessages: session.messages.map(m => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    })),
    parentContext: callbacks.tracing.parentContext,
  }) : null

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
    const result = await streamText({
      model: session.model,
      system: session.systemPrompt,
      messages: session.messages,
      abortSignal: session.abortSignal,
    })

    for await (const chunk of result.textStream) {
      // Capture raw output FIRST before any parsing
      rawOutput += chunk
      parser.processChunk(chunk)
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

    return { text, toolCalls }
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
