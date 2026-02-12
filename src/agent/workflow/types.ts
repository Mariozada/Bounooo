import type { LanguageModel } from 'ai'
import type { ToolDefinition } from '@tools/definitions'
import type { TracingConfig } from '../tracing'
import type { Skill } from '@skills/types'
import type { TabInfo } from '@shared/types'

// Content part types for multimodal messages
export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image'
  image: string  // base64 data URL or http(s) URL
  mediaType?: string
}

export interface FilePart {
  type: 'file'
  data: string  // base64 data URL or http(s) URL
  mediaType: string
  filename?: string
}

export type ContentPart = TextPart | ImagePart | FilePart

export type MessageContent = string | ContentPart[]

export interface Message {
  role: 'user' | 'assistant'
  content: MessageContent
}

// Helper to extract text content from a message
export function getMessageText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content
  }
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('')
}

// Helper to check if a message has attachments
export function hasAttachments(message: Message): boolean {
  if (typeof message.content === 'string') {
    return false
  }
  return message.content.some(part => part.type === 'image' || part.type === 'file')
}

// Helper to get attachments from a message
export function getAttachments(message: Message): (ImagePart | FilePart)[] {
  if (typeof message.content === 'string') {
    return []
  }
  return message.content.filter(
    (part): part is ImagePart | FilePart => part.type === 'image' || part.type === 'file'
  )
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

export interface AssistantTextSegment {
  type: 'text'
  id: string
  text: string
}

export interface AssistantToolCallSegment {
  type: 'tool_call'
  id: string
  toolCallId: string
}

export type AssistantMessageSegment = AssistantTextSegment | AssistantToolCallSegment

/** Direct tool executor for background execution (bypasses chrome.runtime.sendMessage) */
export type ToolExecutor = (name: string, params: Record<string, unknown>) => Promise<unknown>

export interface AgentConfig {
  maxSteps: number
  tabId: number
  groupId?: number
  toolExecutor?: ToolExecutor
  /** Delay in seconds after tools that cause page changes (default: 0.5) */
  postToolDelay?: number
  /** Whether the model supports image/vision input */
  vision?: boolean
  /** Returns the current list of tabs in the agent's group. Called before each LLM call to inject fresh tab context. */
  getTabContext?: () => Promise<TabInfo[]>
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
  /** Called between steps (after tool results appended, before next LLM call). Return user messages to inject into the session. */
  onBeforeNextStep?: () => Promise<{ userMessages: MessageContent[] } | null>
}

export interface AgentOptions {
  model: LanguageModel
  messages: Message[]
  tabId: number
  groupId?: number
  maxSteps?: number
  abortSignal?: AbortSignal
  callbacks?: AgentCallbacks
  tracing?: TracingConfig
  modelName?: string  // For tracing - extracted from model
  provider?: string   // For tracing
  vision?: boolean  // Whether the model supports image input
  reasoningEnabled?: boolean  // Enable streaming reasoning/thinking
  geminiThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
  toolExecutor?: ToolExecutor  // Direct executor for background runs
  /** Returns the current list of tabs in the agent's group */
  getTabContext?: () => Promise<TabInfo[]>
  /** User-defined preference/instructions injected into system prompt */
  userPreference?: string

  // Skills
  activeSkill?: {
    skill: Skill
    args?: Record<string, string>
  }
  availableSkills?: Skill[]  // Auto-discoverable skills to include in prompt

  // MCP
  mcpTools?: ToolDefinition[]  // Tool definitions from MCP servers

  /** Delay in seconds after tools that cause page changes (default: 0.5) */
  postToolDelay?: number
  /** Enable GIF recording tool (default: false) */
  gifEnabled?: boolean
}
