import type {
  TracingConfig,
  ChatMessage,
  OISpanKind,
  ToolCallTrace,
  MessageContent,
} from './types'
import { OI, DEFAULT_TRACING_CONFIG, isMultimodalMessage } from './types'
import { generateTraceId, generateSpanId } from './ids'
import { getExporter, type PhoenixSpan } from './exporter'

const log = (...args: unknown[]) => console.log('[Tracing]', ...args)

export interface SpanContext {
  traceId: string
  spanId: string
}

export interface LLMSpanOptions {
  model: string
  provider?: string
  inputMessages: ChatMessage[]
  parentContext?: SpanContext
  // SDK-level debug info (from debugMiddleware)
  sdkParams?: {
    systemPrompt?: string
    messagesRaw?: unknown  // The actual SDK messages
    providerOptions?: Record<string, unknown>
    settings?: Record<string, unknown>
    tools?: unknown[]
  }
}

export interface LLMSpanResult {
  outputMessage?: ChatMessage
  toolCalls?: ToolCallTrace[]
  error?: string
  // SDK-level params captured by debugMiddleware (available at end time)
  sdkParams?: {
    messagesRaw?: unknown  // The actual SDK messages
    providerOptions?: Record<string, unknown>
    settings?: Record<string, unknown>
    tools?: unknown[]
  }
  // SDK-level response info (from debugMiddleware)
  sdkResponse?: {
    finishReason?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
    }
  }
}

export interface ToolSpanOptions {
  name: string
  input: Record<string, unknown>
  parentContext: SpanContext
}

export interface ToolSpanResult {
  output?: unknown
  error?: string
}

export interface AgentSpanOptions {
  sessionId: string
  inputMessage: string
}

function toISO(ms: number): string {
  return new Date(ms).toISOString()
}

// Format a single message content item for OpenInference
function formatMessageContent(content: MessageContent, prefix: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    [`${prefix}.${OI.MESSAGE_CONTENT_TYPE}`]: content.type,
  }

  if (content.type === 'text') {
    attrs[`${prefix}.${OI.MESSAGE_CONTENT_TEXT}`] = content.text
  } else if (content.type === 'image') {
    attrs[`${prefix}.${OI.MESSAGE_CONTENT_IMAGE}.${OI.IMAGE_URL}`] = content.image.url
  } else if (content.type === 'file') {
    attrs[`${prefix}.message_content.file.url`] = content.file.url
    if (content.file.name) {
      attrs[`${prefix}.message_content.file.name`] = content.file.name
    }
    if (content.file.mimeType) {
      attrs[`${prefix}.message_content.file.mime_type`] = content.file.mimeType
    }
  }

  return attrs
}

// Format messages array into flattened OpenInference attributes
function formatMessages(messages: ChatMessage[], attrPrefix: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}

  messages.forEach((msg, msgIdx) => {
    const msgPrefix = `${attrPrefix}.${msgIdx}`

    attrs[`${msgPrefix}.${OI.MESSAGE_ROLE}`] = msg.role

    if (isMultimodalMessage(msg)) {
      // Multimodal message with contents array
      msg.contents.forEach((content, contentIdx) => {
        const contentPrefix = `${msgPrefix}.${OI.MESSAGE_CONTENTS}.${contentIdx}`
        Object.assign(attrs, formatMessageContent(content, contentPrefix))
      })
    } else {
      // Simple text message
      attrs[`${msgPrefix}.${OI.MESSAGE_CONTENT}`] = msg.content
    }
  })

  return attrs
}

export class Tracer {
  private config: TracingConfig

  constructor(config: TracingConfig = DEFAULT_TRACING_CONFIG) {
    this.config = config
  }

  updateConfig(config: TracingConfig): void {
    this.config = config
    getExporter(config)
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  createContext(parentContext?: SpanContext): SpanContext {
    return {
      traceId: parentContext?.traceId ?? generateTraceId(),
      spanId: generateSpanId(),
    }
  }

  startAgentSpan(options: AgentSpanOptions): { context: SpanContext; end: (result: { output?: string; error?: string }) => void } {
    const context = this.createContext()
    const startTime = Date.now()

    log('Agent span started:', options.sessionId)

    return {
      context,
      end: (result) => {
        if (!this.config.enabled) return

        const span = this.buildSpan({
          name: 'agent',
          context,
          startTime,
          endTime: Date.now(),
          kind: 'AGENT',
          attributes: {
            [OI.SESSION_ID]: options.sessionId,
            [OI.INPUT_VALUE]: options.inputMessage,
            ...(result.output ? { [OI.OUTPUT_VALUE]: result.output } : {}),
          },
          error: result.error,
        })

        getExporter(this.config).addSpan(span)
      },
    }
  }

  startLLMSpan(options: LLMSpanOptions): { context: SpanContext; end: (result: LLMSpanResult) => void } {
    const context = this.createContext(options.parentContext)
    const startTime = Date.now()

    log('LLM span started:', options.model)

    return {
      context: {
        traceId: options.parentContext?.traceId ?? context.traceId,
        spanId: context.spanId,
      },
      end: (result) => {
        if (!this.config.enabled) return

        // Build attributes with properly formatted messages
        const attributes: Record<string, unknown> = {
          [OI.LLM_MODEL_NAME]: options.model,
          [OI.GEN_AI_REQUEST_MODEL]: options.model,
        }

        if (options.provider) {
          attributes[OI.LLM_PROVIDER] = options.provider
          attributes[OI.GEN_AI_SYSTEM] = options.provider
        }

        // Format input messages using OpenInference conventions
        Object.assign(attributes, formatMessages(options.inputMessages, OI.LLM_INPUT_MESSAGES))

        // Format output message if present
        if (result.outputMessage) {
          Object.assign(attributes, formatMessages([result.outputMessage], OI.LLM_OUTPUT_MESSAGES))
        }

        // === SDK-level debug attributes ===
        // Merge sdkParams from start (options) and end (result)
        // Start time: system prompt is known
        // End time: messages, settings, providerOptions are captured by middleware
        const mergedSdkParams = {
          ...options.sdkParams,
          ...result.sdkParams,
        }

        // System prompt (the actual rendered prompt sent to LLM)
        if (mergedSdkParams.systemPrompt) {
          attributes[OI.SDK_SYSTEM_PROMPT] = mergedSdkParams.systemPrompt
        }

        // Raw SDK messages (the actual format sent to provider)
        if (mergedSdkParams.messagesRaw) {
          attributes[OI.SDK_MESSAGES_RAW] = JSON.stringify(mergedSdkParams.messagesRaw)
        }

        // Provider-specific options (thinking config, reasoning effort, etc.)
        if (mergedSdkParams.providerOptions && Object.keys(mergedSdkParams.providerOptions).length > 0) {
          attributes[OI.SDK_PROVIDER_OPTIONS] = JSON.stringify(mergedSdkParams.providerOptions)
        }

        // Model settings (temperature, maxTokens, etc.)
        if (mergedSdkParams.settings && Object.keys(mergedSdkParams.settings).length > 0) {
          attributes[OI.SDK_SETTINGS] = JSON.stringify(mergedSdkParams.settings)

          // Also set individual GenAI attributes for standard tooling
          const settings = mergedSdkParams.settings as Record<string, unknown>
          if (settings.temperature !== undefined) {
            attributes[OI.GEN_AI_REQUEST_TEMPERATURE] = settings.temperature
          }
          if (settings.maxTokens !== undefined) {
            attributes[OI.GEN_AI_REQUEST_MAX_TOKENS] = settings.maxTokens
          }
          if (settings.topP !== undefined) {
            attributes[OI.GEN_AI_REQUEST_TOP_P] = settings.topP
          }
          if (settings.topK !== undefined) {
            attributes[OI.GEN_AI_REQUEST_TOP_K] = settings.topK
          }
          if (settings.frequencyPenalty !== undefined) {
            attributes[OI.GEN_AI_REQUEST_FREQUENCY_PENALTY] = settings.frequencyPenalty
          }
          if (settings.presencePenalty !== undefined) {
            attributes[OI.GEN_AI_REQUEST_PRESENCE_PENALTY] = settings.presencePenalty
          }
        }

        // Tool definitions
        if (mergedSdkParams.tools && mergedSdkParams.tools.length > 0) {
          attributes[OI.SDK_TOOLS] = JSON.stringify(mergedSdkParams.tools)
        }

        // === SDK-level response attributes ===
        if (result.sdkResponse) {
          if (result.sdkResponse.finishReason) {
            attributes[OI.GEN_AI_RESPONSE_FINISH_REASON] = result.sdkResponse.finishReason
          }
          if (result.sdkResponse.usage) {
            if (result.sdkResponse.usage.promptTokens !== undefined) {
              attributes[OI.GEN_AI_USAGE_INPUT_TOKENS] = result.sdkResponse.usage.promptTokens
            }
            if (result.sdkResponse.usage.completionTokens !== undefined) {
              attributes[OI.GEN_AI_USAGE_OUTPUT_TOKENS] = result.sdkResponse.usage.completionTokens
            }
          }
        }

        const span = this.buildSpan({
          name: `llm.${options.model}`,
          context: {
            traceId: options.parentContext?.traceId ?? context.traceId,
            spanId: context.spanId,
          },
          parentSpanId: options.parentContext?.spanId,
          startTime,
          endTime: Date.now(),
          kind: 'LLM',
          attributes,
          error: result.error,
        })

        getExporter(this.config).addSpan(span)
        log('LLM span ended:', options.model)
      },
    }
  }

  startToolSpan(options: ToolSpanOptions): { context: SpanContext; end: (result: ToolSpanResult) => void } {
    const context = this.createContext(options.parentContext)
    const startTime = Date.now()

    log('Tool span started:', options.name)

    return {
      context: {
        traceId: options.parentContext.traceId,
        spanId: context.spanId,
      },
      end: (result) => {
        if (!this.config.enabled) return

        const attributes: Record<string, unknown> = {
          [OI.TOOL_NAME]: options.name,
          [OI.TOOL_PARAMETERS]: JSON.stringify(options.input),
        }

        if (result.output !== undefined) {
          attributes[OI.TOOL_OUTPUT] = JSON.stringify(result.output)
        }

        const span = this.buildSpan({
          name: `tool.${options.name}`,
          context: {
            traceId: options.parentContext.traceId,
            spanId: context.spanId,
          },
          parentSpanId: options.parentContext.spanId,
          startTime,
          endTime: Date.now(),
          kind: 'TOOL',
          attributes,
          error: result.error,
        })

        getExporter(this.config).addSpan(span)
        log('Tool span ended:', options.name)
      },
    }
  }

  startChainSpan(name: string, parentContext?: SpanContext): { context: SpanContext; end: (error?: string) => void } {
    const context = this.createContext(parentContext)
    const startTime = Date.now()

    return {
      context: {
        traceId: parentContext?.traceId ?? context.traceId,
        spanId: context.spanId,
      },
      end: (error) => {
        if (!this.config.enabled) return

        const span = this.buildSpan({
          name,
          context: {
            traceId: parentContext?.traceId ?? context.traceId,
            spanId: context.spanId,
          },
          parentSpanId: parentContext?.spanId,
          startTime,
          endTime: Date.now(),
          kind: 'CHAIN',
          attributes: {},
          error,
        })

        getExporter(this.config).addSpan(span)
      },
    }
  }

  private buildSpan(options: {
    name: string
    context: SpanContext
    parentSpanId?: string
    startTime: number
    endTime: number
    kind: OISpanKind
    attributes: Record<string, unknown>
    error?: string
  }): PhoenixSpan {
    const { name, context, parentSpanId, startTime, endTime, kind, attributes, error } = options

    return {
      name,
      context: {
        trace_id: context.traceId,
        span_id: context.spanId,
      },
      parent_id: parentSpanId ?? null,
      span_kind: kind,
      start_time: toISO(startTime),
      end_time: toISO(endTime),
      status_code: error ? 'ERROR' : 'OK',
      status_message: error ?? '',
      attributes: {
        [OI.SPAN_KIND]: kind,
        ...attributes,
      },
    }
  }

  async flush(): Promise<void> {
    await getExporter(this.config).flush()
  }
}

// Singleton tracer instance
let tracerInstance: Tracer | null = null

export function getTracer(config?: TracingConfig): Tracer {
  if (!tracerInstance) {
    tracerInstance = new Tracer(config)
  } else if (config) {
    tracerInstance.updateConfig(config)
  }
  return tracerInstance
}
