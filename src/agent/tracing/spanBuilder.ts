import type { OISpanKind, ChatMessage } from './types'
import { OI } from './types'
import type { PhoenixSpan } from './exporter'
import { formatMessages } from './messageFormatter'

export interface SpanContext {
  traceId: string
  spanId: string
}

export interface BuildSpanOptions {
  name: string
  context: SpanContext
  parentSpanId?: string
  startTime: number
  endTime: number
  kind: OISpanKind
  attributes: Record<string, unknown>
  error?: string
}

export function toISO(ms: number): string {
  return new Date(ms).toISOString()
}

export function buildSpan(options: BuildSpanOptions): PhoenixSpan {
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

export interface LLMAttributesOptions {
  model: string
  provider?: string
  inputMessages: ChatMessage[]
  outputMessage?: ChatMessage
  sdkParams?: {
    systemPrompt?: string
    messagesRaw?: unknown
    providerOptions?: Record<string, unknown>
    settings?: Record<string, unknown>
    tools?: unknown[]
  }
  sdkResponse?: {
    finishReason?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
    }
  }
}

export function buildLLMAttributes(options: LLMAttributesOptions): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [OI.LLM_MODEL_NAME]: options.model,
    [OI.GEN_AI_REQUEST_MODEL]: options.model,
  }

  if (options.provider) {
    attributes[OI.LLM_PROVIDER] = options.provider
    attributes[OI.GEN_AI_SYSTEM] = options.provider
  }

  // Format input messages
  Object.assign(attributes, formatMessages(options.inputMessages, OI.LLM_INPUT_MESSAGES))

  // Format output message if present
  if (options.outputMessage) {
    Object.assign(attributes, formatMessages([options.outputMessage], OI.LLM_OUTPUT_MESSAGES))
  }

  // SDK params
  if (options.sdkParams) {
    if (options.sdkParams.systemPrompt) {
      attributes[OI.SDK_SYSTEM_PROMPT] = options.sdkParams.systemPrompt
    }
    if (options.sdkParams.messagesRaw) {
      attributes[OI.SDK_MESSAGES_RAW] = JSON.stringify(options.sdkParams.messagesRaw)
    }
    if (options.sdkParams.providerOptions && Object.keys(options.sdkParams.providerOptions).length > 0) {
      attributes[OI.SDK_PROVIDER_OPTIONS] = JSON.stringify(options.sdkParams.providerOptions)
    }
    if (options.sdkParams.settings && Object.keys(options.sdkParams.settings).length > 0) {
      attributes[OI.SDK_SETTINGS] = JSON.stringify(options.sdkParams.settings)

      const settings = options.sdkParams.settings as Record<string, unknown>
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
    if (options.sdkParams.tools && options.sdkParams.tools.length > 0) {
      attributes[OI.SDK_TOOLS] = JSON.stringify(options.sdkParams.tools)
    }
  }

  // SDK response
  if (options.sdkResponse) {
    if (options.sdkResponse.finishReason) {
      attributes[OI.GEN_AI_RESPONSE_FINISH_REASON] = options.sdkResponse.finishReason
    }
    if (options.sdkResponse.usage) {
      if (options.sdkResponse.usage.promptTokens !== undefined) {
        attributes[OI.GEN_AI_USAGE_INPUT_TOKENS] = options.sdkResponse.usage.promptTokens
      }
      if (options.sdkResponse.usage.completionTokens !== undefined) {
        attributes[OI.GEN_AI_USAGE_OUTPUT_TOKENS] = options.sdkResponse.usage.completionTokens
      }
    }
  }

  return attributes
}
