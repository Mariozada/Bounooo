import type { ToolCallInfo, ToolExecutionResult, AgentSession, ToolExecutor } from './types'
import { getTracer, type SpanContext, type TracingConfig } from '../tracing'

const log = (...args: unknown[]) => console.log('[Workflow:Tools]', ...args)
const logError = (...args: unknown[]) => console.error('[Workflow:Tools]', ...args)

const DEFAULT_POST_TOOL_DELAY = 0.5

/** Tools that cause page/DOM changes and benefit from a post-execution delay */
const TOOLS_WITH_DELAY = new Set([
  'navigate',
  'computer',
  'form_input',
  'javascript_tool',
  'tabs_create',
])

/** Computer actions that are read-only and don't need a delay */
const COMPUTER_ACTIONS_NO_DELAY = new Set([
  'wait',
  'screenshot',
  'zoom',
  'hover',
])

function needsPostDelay(toolName: string, input: Record<string, unknown>): boolean {
  if (!TOOLS_WITH_DELAY.has(toolName)) return false
  if (toolName === 'computer') {
    const action = input.action as string | undefined
    if (action && COMPUTER_ACTIONS_NO_DELAY.has(action)) return false
  }
  return true
}

function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}

async function sendToolMessage(
  name: string,
  params: Record<string, unknown>,
  groupId?: number,
  directExecutor?: ToolExecutor
): Promise<unknown> {
  const paramsWithGroup = { ...params, ...(groupId !== undefined && { groupId }) }

  // Use direct executor when running from the background service worker
  if (directExecutor) {
    try {
      const response = await directExecutor(name, paramsWithGroup) as Record<string, unknown> | null
      if (response && typeof response === 'object' && 'error' in response) {
        return response
      }
      return response ?? { success: true }
    } catch (err) {
      logError(`Direct tool executor error: ${name}`, err)
      return { error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_TOOL',
      tool: name,
      params: paramsWithGroup,
    })

    if (response?.success) {
      return response.result ?? { success: true }
    } else {
      return { error: response?.error ?? 'Tool execution failed' }
    }
  } catch (err) {
    logError(`Tool message error: ${name}`, err)
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

function isErrorResult(result: unknown): boolean {
  return result !== null && typeof result === 'object' && 'error' in result
}

export async function executeTool(
  toolCall: ToolCallInfo,
  groupId?: number,
  directExecutor?: ToolExecutor
): Promise<ToolExecutionResult> {
  log(`Executing: ${toolCall.name}`, toolCall.input)

  const updatedToolCall: ToolCallInfo = {
    ...toolCall,
    status: 'running',
    startedAt: Date.now(),
  }

  const result = await sendToolMessage(toolCall.name, toolCall.input, groupId, directExecutor)
  const hasError = isErrorResult(result)

  updatedToolCall.result = result
  updatedToolCall.status = hasError ? 'error' : 'completed'
  updatedToolCall.completedAt = Date.now()

  if (hasError) {
    updatedToolCall.error = String((result as { error: unknown }).error)
  }

  log(`Completed: ${toolCall.name}`, hasError ? 'error' : 'success')

  return { toolCall: updatedToolCall, result, hasError }
}

export interface ToolTracingOptions {
  config: TracingConfig
  parentContext: SpanContext
}

export interface ToolQueueCallbacks {
  onToolStart?: (toolCall: ToolCallInfo) => void
  onToolDone?: (toolCall: ToolCallInfo) => void
  tracing?: ToolTracingOptions
}

/**
 * Sequential tool execution queue. Tool calls are pushed in as they are parsed
 * from the stream and executed one at a time in order. Call `drain()` after the
 * stream ends to wait for remaining tools to finish.
 */
export class ToolQueue {
  private queue: ToolCallInfo[] = []
  private results: ToolExecutionResult[] = []
  private processing = false
  private done = false
  private resolve: (() => void) | null = null

  constructor(
    private session: AgentSession,
    private callbacks?: ToolQueueCallbacks
  ) {}

  /** Push a parsed tool call into the queue. Starts processing if idle. */
  push(toolCall: ToolCallInfo): void {
    this.queue.push(toolCall)
    if (!this.processing) {
      this._processNext()
    }
  }

  /** Signal that no more tool calls will arrive and wait for the queue to empty. */
  async drain(): Promise<ToolExecutionResult[]> {
    this.done = true
    if (!this.processing && this.queue.length === 0) {
      return this.results
    }
    await new Promise<void>(resolve => { this.resolve = resolve })
    return this.results
  }

  getResults(): ToolExecutionResult[] {
    return this.results
  }

  private async _processNext(): Promise<void> {
    if (this.session.abortSignal?.aborted) {
      this.queue = []
      this.processing = false
      if (this.done && this.resolve) {
        this.resolve()
      }
      return
    }

    if (this.queue.length === 0) {
      this.processing = false
      if (this.done && this.resolve) {
        this.resolve()
      }
      return
    }

    this.processing = true
    const toolCall = this.queue.shift()!
    const tracer = getTracer(this.callbacks?.tracing?.config)

    this.callbacks?.onToolStart?.(toolCall)

    const toolSpan = this.callbacks?.tracing ? tracer.startToolSpan({
      name: toolCall.name,
      input: toolCall.input,
      parentContext: this.callbacks.tracing.parentContext,
    }) : null

    const result = await executeTool(toolCall, this.session.config.groupId, this.session.config.toolExecutor)
    this.results.push(result)

    toolSpan?.end({
      output: result.result,
      error: result.hasError ? result.toolCall.error : undefined,
    })

    this.callbacks?.onToolDone?.(result.toolCall)

    // Delay after tools that cause page changes to let the DOM settle
    if (!result.hasError && needsPostDelay(toolCall.name, toolCall.input)) {
      const delay = this.session.config.postToolDelay ?? DEFAULT_POST_TOOL_DELAY
      if (delay > 0) {
        await sleep(delay)
      }
    }

    if (this.session.abortSignal?.aborted) {
      this.queue = []
      this.processing = false
      if (this.done && this.resolve) {
        this.resolve()
      }
      return
    }

    // Process next (without awaiting to avoid deep stack, use microtask)
    void this._processNext()
  }
}

export function getToolCallsFromResults(results: ToolExecutionResult[]): ToolCallInfo[] {
  return results.map(r => r.toolCall)
}
