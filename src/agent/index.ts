export { createProvider, validateSettings, ProviderError } from './providers'
export { PROVIDER_CONFIGS, getModelsForProvider, getDefaultModelForProvider, getModelConfig } from './config'
export type { ModelConfig, ProviderConfig } from './config'

export { setCurrentTabId, setCurrentGroupId, getCurrentTabId, getCurrentGroupId } from './tools'

export { formatToolResults } from './xmlParser'

export { XMLStreamParser, STREAM_EVENT_TYPES } from './streamParser'
export type { StreamEvent, ToolCallEvent, ToolResultEvent } from './streamParser'

export { runWorkflow, getMessageText, hasAttachments, getAttachments } from './workflow'
export type {
  AgentOptions,
  AgentResult,
  AgentCallbacks,
  ToolCallInfo,
  Message,
  MessageContent,
  ContentPart,
  TextPart,
  ImagePart,
  FilePart,
  FinishReason,
} from './workflow'

export { getTracer } from './tracing'
export type { TracingConfig } from './tracing'
