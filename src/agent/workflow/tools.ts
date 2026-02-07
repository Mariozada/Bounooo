import type { ToolCallInfo, ToolExecutionResult, AgentSession } from './types'
import { getTracer, type SpanContext, type TracingConfig } from '../tracing'

const log = (...args: unknown[]) => console.log('[Workflow:Tools]', ...args)
const logError = (...args: unknown[]) => console.error('[Workflow:Tools]', ...args)

async function sendToolMessage(
  name: string,
  params: Record<string, unknown>,
  tabId: number,
  groupId?: number
): Promise<unknown> {
  const paramsWithTab = { ...params, tabId, ...(groupId !== undefined && { groupId }) }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_TOOL',
      tool: name,
      params: paramsWithTab,
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
  tabId: number,
  groupId?: number
): Promise<ToolExecutionResult> {
  log(`Executing: ${toolCall.name}`, toolCall.input)

  const updatedToolCall: ToolCallInfo = {
    ...toolCall,
    status: 'running',
    startedAt: Date.now(),
  }

  const result = await sendToolMessage(toolCall.name, toolCall.input, tabId, groupId)
  const hasError = isErrorResult(result)

  updatedToolCall.result = result
  updatedToolCall.status = hasError ? 'error' : 'completed'
  updatedToolCall.completedAt = Date.now()

  if (hasError) {
    updatedToolCall.error = String((result as { error: unknown }).error)
  }

  log(`Completed: ${toolCall.name}`, hasError ? 'error' : 'success')

  return {
    toolCall: updatedToolCall,
    result,
    hasError,
  }
}

export interface ToolTracingOptions {
  config: TracingConfig
  parentContext: SpanContext
}

export interface ExecuteToolsCallbacks {
  onToolStart?: (toolCall: ToolCallInfo) => void
  onToolDone?: (toolCall: ToolCallInfo) => void
  tracing?: ToolTracingOptions
}

export async function executeTools(
  toolCalls: ToolCallInfo[],
  session: AgentSession,
  callbacks?: ExecuteToolsCallbacks
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = []
  const tracer = getTracer(callbacks?.tracing?.config)

  for (const toolCall of toolCalls) {
    callbacks?.onToolStart?.(toolCall)

    // Start tool span if tracing enabled
    const toolSpan = callbacks?.tracing ? tracer.startToolSpan({
      name: toolCall.name,
      input: toolCall.input,
      parentContext: callbacks.tracing.parentContext,
    }) : null

    const result = await executeTool(toolCall, session.config.tabId, session.config.groupId)
    results.push(result)

    // End tool span
    toolSpan?.end({
      output: result.result,
      error: result.hasError ? result.toolCall.error : undefined,
    })

    callbacks?.onToolDone?.(result.toolCall)
  }

  return results
}

export function getToolCallsFromResults(results: ToolExecutionResult[]): ToolCallInfo[] {
  return results.map(r => r.toolCall)
}
