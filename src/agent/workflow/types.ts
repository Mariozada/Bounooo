import type { LanguageModel } from 'ai'
import type { ToolDefinition } from '@tools/definitions'
import type { TracingConfig } from '../tracing'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolCallInfo {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'error'
  result?: unknown
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface AgentConfig {
  maxSteps: number
  tabId: number
}

export interface AgentSession {
  id: string
  model: LanguageModel
  messages: Message[]
  systemPrompt: string
  toolDefinitions: ToolDefinition[]
  config: AgentConfig
  abortSignal?: AbortSignal
}

export interface StepResult {
  text: string
  toolCalls: ToolCallInfo[]
  reasoning?: string
}

export interface ToolExecutionResult {
  toolCall: ToolCallInfo
  result: unknown
  hasError: boolean
}

export type FinishReason = 'stop' | 'aborted' | 'max-steps' | 'error'

export interface AgentResult {
  text: string
  toolCalls: ToolCallInfo[]
  steps: number
  finishReason: FinishReason
  error?: string
}

export interface AgentCallbacks {
  onStreamStart?: () => void
  onStreamDone?: () => void
  onStepStart?: (step: number) => void
  onStepComplete?: (step: number, result: StepResult) => void
  onTextDelta?: (text: string) => void
  onTextDone?: (fullText: string) => void
  onToolStart?: (toolCall: ToolCallInfo) => void
  onToolDone?: (toolCall: ToolCallInfo) => void
  onReasoningDelta?: (text: string) => void
  onReasoningDone?: (fullText: string) => void
}

export interface AgentOptions {
  model: LanguageModel
  messages: Message[]
  tabId: number
  maxSteps?: number
  abortSignal?: AbortSignal
  callbacks?: AgentCallbacks
  tracing?: TracingConfig
  modelName?: string  // For tracing - extracted from model
  provider?: string   // For tracing
  reasoningEnabled?: boolean  // Enable streaming reasoning/thinking
}
