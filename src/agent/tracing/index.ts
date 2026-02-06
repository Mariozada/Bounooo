export { getTracer, Tracer } from './tracer'
export type { SpanContext, LLMSpanOptions, LLMSpanResult, ToolSpanOptions, ToolSpanResult, AgentSpanOptions } from './tracer'

export { getExporter, PhoenixExporter } from './exporter'
export type { PhoenixSpan } from './exporter'

export { generateTraceId, generateSpanId } from './ids'

export { buildSpan, buildLLMAttributes } from './spanBuilder'
export { formatMessages, formatMessageContent } from './messageFormatter'

export type {
  TracingConfig,
  ChatMessage,
  SimpleMessage,
  MultimodalMessage,
  MessageContent,
  TextContent,
  ImageContent,
  FileContent,
  ToolCallTrace,
  OISpanKind,
} from './types'

export {
  DEFAULT_TRACING_CONFIG,
  OI,
  MAX_IMAGE_SIZE_BYTES,
  isMultimodalMessage,
} from './types'
