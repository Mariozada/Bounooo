import type { TracingConfig, ChatMessage, ToolCallTrace } from './types'
import { OI, DEFAULT_TRACING_CONFIG } from './types'
import { generateTraceId, generateSpanId } from './ids'
import { getExporter } from './exporter'
import { buildSpan, buildLLMAttributes, type SpanContext } from './spanBuilder'

const log = (...args: unknown[]) => console.log('[Tracing]', ...args)

export type { SpanContext }

export interface LLMSpanOptions {
  model: string
  provider?: string
  inputMessages: ChatMessage[]
  parentContext?: SpanContext
  sdkParams?: {
    systemPrompt?: string
    messagesRaw?: unknown
    providerOptions?: Record<string, unknown>
    settings?: Record<string, unknown>
    tools?: unknown[]
  }
}

export interface LLMSpanResult {
  outputMessage?: ChatMessage
  toolCalls?: ToolCallTrace[]
  error?: string
  sdkParams?: {
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

        const span = buildSpan({
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

        const mergedSdkParams = {
          ...options.sdkParams,
          ...result.sdkParams,
        }

        const attributes = buildLLMAttributes({
          model: options.model,
          provider: options.provider,
          inputMessages: options.inputMessages,
          outputMessage: result.outputMessage,
          sdkParams: mergedSdkParams,
          sdkResponse: result.sdkResponse,
        })

        const span = buildSpan({
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

        const span = buildSpan({
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

        const span = buildSpan({
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
