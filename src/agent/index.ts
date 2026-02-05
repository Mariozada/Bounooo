export { createProvider, validateSettings, ProviderError } from './providers'
export { PROVIDER_CONFIGS, getModelsForProvider, getDefaultModelForProvider, getModelConfig } from './config'
export type { ModelConfig, ProviderConfig } from './config'

export { setCurrentTabId, getCurrentTabId } from './tools'

export { formatToolResult } from './xmlParser'

export { XMLStreamParser, STREAM_EVENT_TYPES, parsePartialJSON } from './streamParser'
export type { StreamEvent, ToolCallEvent, ToolResultEvent } from './streamParser'

export { runWorkflow } from './workflow'
export type {
  AgentOptions,
  AgentResult,
  AgentCallbacks,
  ToolCallInfo,
  Message,
  FinishReason,
} from './workflow'

export { getTracer } from './tracing'
export type { TracingConfig } from './tracing'
