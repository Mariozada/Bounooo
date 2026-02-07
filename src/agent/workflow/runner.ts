import type {
  AgentOptions,
  AgentResult,
  AgentSession,
  AgentCallbacks,
  ToolCallInfo,
  FinishReason,
} from './types'
import { createSession, isAborted } from './session'
import { streamLLMResponse, hasToolCalls } from './stream'
import { ToolQueue, getToolCallsFromResults } from './tools'
import { appendStepMessages } from './messages'
import { getTracer, type SpanContext, type TracingConfig } from '../tracing'

const log = (...args: unknown[]) => console.log('[Workflow:Runner]', ...args)
const logError = (...args: unknown[]) => console.error('[Workflow:Runner]', ...args)

interface TracingContext {
  config: TracingConfig
  agentSpan: { context: SpanContext; end: (result: { output?: string; error?: string }) => void }
}

function createResult(
  finishReason: FinishReason,
  text: string,
  toolCalls: ToolCallInfo[],
  steps: number,
  error?: string
): AgentResult {
  return {
    text: text.trim(),
    toolCalls,
    steps,
    finishReason,
    error,
  }
}

interface ExecuteStepOptions {
  session: AgentSession
  stepNumber: number
  callbacks?: AgentCallbacks
  tracingContext?: TracingContext
  modelName?: string
  provider?: string
  reasoningEnabled?: boolean
}

async function executeStep(options: ExecuteStepOptions): Promise<{ shouldContinue: boolean; text: string; toolCalls: ToolCallInfo[]; reasoning?: string }> {
  const { session, stepNumber, callbacks, tracingContext, modelName, provider, reasoningEnabled } = options

  log(`=== Step ${stepNumber} ===`)
  callbacks?.onStepStart?.(stepNumber)

  const tracer = getTracer(tracingContext?.config)
  const stepSpan = tracer.startChainSpan(`step.${stepNumber}`, tracingContext?.agentSpan.context)

  // Create a queue that starts executing tool calls as they arrive from the stream
  const toolQueue = new ToolQueue(session, {
    onToolStart: callbacks?.onToolStart,
    onToolDone: callbacks?.onToolDone,
    tracing: tracingContext ? {
      config: tracingContext.config,
      parentContext: stepSpan.context,
    } : undefined,
  })

  // Stream LLM response — tool calls are pushed into the queue as they're parsed
  const stepResult = await streamLLMResponse(session, {
    onTextDelta: callbacks?.onTextDelta,
    onToolCallParsed: (toolCall) => {
      callbacks?.onToolStart?.(toolCall)
      toolQueue.push(toolCall)
    },
    onReasoningDelta: callbacks?.onReasoningDelta,
    tracing: tracingContext ? {
      config: tracingContext.config,
      parentContext: stepSpan.context,
      modelName,
      provider,
    } : undefined,
    reasoningEnabled,
    provider,
    modelId: modelName,
  })

  log('Step streamed:', {
    textLength: stepResult.text.length,
    toolCalls: stepResult.toolCalls.length,
    hasReasoning: !!stepResult.reasoning,
  })

  if (stepResult.text.trim()) {
    callbacks?.onTextDone?.(stepResult.text)
  }

  if (stepResult.reasoning) {
    callbacks?.onReasoningDone?.(stepResult.reasoning)
  }

  if (!hasToolCalls(stepResult)) {
    log('No tool calls, finishing')
    callbacks?.onStepComplete?.(stepNumber, stepResult)
    stepSpan.end()
    return {
      shouldContinue: false,
      text: stepResult.text,
      toolCalls: [],
      reasoning: stepResult.reasoning,
    }
  }

  // Wait for any remaining tool calls still in the queue to finish
  const toolResults = await toolQueue.drain()

  appendStepMessages(session, stepResult, toolResults)

  const completedToolCalls = getToolCallsFromResults(toolResults)
  callbacks?.onStepComplete?.(stepNumber, { ...stepResult, toolCalls: completedToolCalls })
  stepSpan.end()

  return {
    shouldContinue: true,
    text: stepResult.text,
    toolCalls: completedToolCalls,
    reasoning: stepResult.reasoning,
  }
}

export async function runWorkflow(options: AgentOptions): Promise<AgentResult> {
  const { callbacks, tracing, modelName, provider, reasoningEnabled } = options
  const session = createSession(options)

  log('Starting workflow', {
    sessionId: session.id,
    maxSteps: session.config.maxSteps,
    tools: session.toolDefinitions.map(t => t.name),
    tracingEnabled: tracing?.enabled ?? false,
  })

  const tracer = getTracer(tracing)
  let tracingContext: TracingContext | undefined

  if (tracing?.enabled) {
    const inputMessage = options.messages[options.messages.length - 1]?.content ?? ''
    const agentSpan = tracer.startAgentSpan({
      sessionId: session.id,
      inputMessage,
    })
    tracingContext = { config: tracing, agentSpan }
    log('Tracing enabled, agent span started')
  }

  callbacks?.onStreamStart?.()

  let step = 0
  let finalText = ''
  const allToolCalls: ToolCallInfo[] = []

  try {
    while (step < session.config.maxSteps) {
      if (isAborted(session)) {
        log('Aborted by user')
        callbacks?.onStreamDone?.()
        tracingContext?.agentSpan.end({ output: finalText, error: 'Aborted by user' })
        await tracer.flush()
        return createResult('aborted', finalText, allToolCalls, step)
      }

      const result = await executeStep({
        session,
        stepNumber: step + 1,
        callbacks,
        tracingContext,
        modelName,
        provider,
        reasoningEnabled,
      })

      finalText += result.text
      allToolCalls.push(...result.toolCalls)

      if (!result.shouldContinue) {
        callbacks?.onStreamDone?.()
        tracingContext?.agentSpan.end({ output: finalText })
        await tracer.flush()
        return createResult('stop', finalText, allToolCalls, step + 1)
      }

      step++
    }

    log('Reached max steps limit')
    callbacks?.onStreamDone?.()
    tracingContext?.agentSpan.end({ output: finalText })
    await tracer.flush()
    return createResult(
      'max-steps',
      finalText + '\n\n(Reached maximum steps limit)',
      allToolCalls,
      step
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    const isAbortError = errorMessage === 'AbortError' || errorMessage.includes('aborted')

    if (isAbortError) {
      log('Aborted via error')
      callbacks?.onStreamDone?.()
      tracingContext?.agentSpan.end({ output: finalText, error: 'Aborted' })
      await tracer.flush()
      return createResult('aborted', finalText, allToolCalls, step)
    }

    logError('Workflow error:', err)
    callbacks?.onStreamDone?.()
    tracingContext?.agentSpan.end({ error: errorMessage })
    await tracer.flush()
    throw err
  }
}
