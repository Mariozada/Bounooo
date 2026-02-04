/**
 * Agent Loop
 *
 * Core agent loop logic for browser automation.
 * Handles the iterative process of:
 * 1. Sending messages to the LLM
 * 2. Processing tool calls
 * 3. Continuing until completion or max steps
 */

import { generateText, type LanguageModel } from 'ai'
import { getBrowserTools, setCurrentTabId } from './tools'
import { renderSystemPrompt } from '@prompts/render'
import { getEnabledToolDefinitions } from '@tools/definitions'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Agent:Loop]', ...args)
const logError = (...args: unknown[]) => console.error('[Agent:Loop]', ...args)

export interface ToolCallInfo {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'completed' | 'error'
  result?: unknown
  error?: string
}

// Message type for the API
interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentLoopOptions {
  model: LanguageModel
  messages: Message[]
  tabId: number
  maxSteps?: number
  abortSignal?: AbortSignal
  onText?: (text: string) => void
  onToolCall?: (toolCall: ToolCallInfo) => void
  onToolResult?: (toolCall: ToolCallInfo) => void
  onStep?: (step: number) => void
}

export interface AgentLoopResult {
  text: string
  toolCalls: ToolCallInfo[]
  steps: number
  finishReason: string
}

/**
 * Run the agent loop
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    model,
    messages: initialMessages,
    tabId,
    maxSteps = 15,
    abortSignal,
    onText,
    onToolCall,
    onToolResult,
    onStep
  } = options

  // Set current tab for tool execution
  setCurrentTabId(tabId)

  // Get tools and system prompt
  const tools = getBrowserTools()
  const toolDefinitions = getEnabledToolDefinitions()
  const systemPrompt = renderSystemPrompt(toolDefinitions)

  log('Starting agent loop, max steps:', maxSteps)
  log('Tools available:', Object.keys(tools).join(', '))

  let currentMessages: Message[] = [...initialMessages]
  let step = 0
  let finalText = ''
  const allToolCalls: ToolCallInfo[] = []

  while (step < maxSteps) {
    log(`=== Step ${step + 1} ===`)
    onStep?.(step + 1)

    // Check for abort
    if (abortSignal?.aborted) {
      log('Aborted by user')
      break
    }

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        messages: currentMessages,
        tools,
        abortSignal
      })

      log('Step result:', {
        finishReason: result.finishReason,
        textLength: result.text?.length || 0,
        toolCalls: result.toolCalls?.length || 0,
        toolResults: result.toolResults?.length || 0
      })

      // Collect text
      if (result.text) {
        finalText += result.text
        log('Got text:', result.text.slice(0, 100))
        onText?.(result.text)
      }

      // Process tool calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        log('Processing', result.toolCalls.length, 'tool calls')

        for (const tc of result.toolCalls) {
          const toolCallInfo: ToolCallInfo = {
            id: tc.toolCallId,
            name: tc.toolName,
            input: (tc as unknown as { args: Record<string, unknown> }).args ?? {},
            status: 'running'
          }
          allToolCalls.push(toolCallInfo)
          onToolCall?.(toolCallInfo)
        }

        // Process tool results
        if (result.toolResults && result.toolResults.length > 0) {
          for (const tr of result.toolResults) {
            const toolCall = allToolCalls.find(tc => tc.id === tr.toolCallId)
            if (toolCall) {
              const trResult = (tr as unknown as { result: unknown }).result
              const hasError = trResult && typeof trResult === 'object' && 'error' in trResult
              toolCall.result = trResult
              toolCall.status = hasError ? 'error' : 'completed'
              toolCall.error = hasError ? String((trResult as { error: unknown }).error) : undefined
              log('Tool result for', toolCall.name, ':', toolCall.status)
              onToolResult?.(toolCall)
            }
          }
        }
      }

      // Check if we should continue
      if (result.finishReason === 'stop') {
        log('LLM finished with reason:', result.finishReason)
        return {
          text: finalText,
          toolCalls: allToolCalls,
          steps: step + 1,
          finishReason: result.finishReason
        }
      }

      if (result.finishReason === 'tool-calls' && result.response?.messages) {
        log('Adding response messages to continue conversation')
        currentMessages = [...currentMessages, ...(result.response.messages as Message[])]
      } else if (result.finishReason !== 'tool-calls') {
        log('Unexpected finish reason:', result.finishReason)
        return {
          text: finalText,
          toolCalls: allToolCalls,
          steps: step + 1,
          finishReason: result.finishReason
        }
      } else {
        log('No response messages to continue with')
        return {
          text: finalText,
          toolCalls: allToolCalls,
          steps: step + 1,
          finishReason: 'no-continuation'
        }
      }

      step++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const isAbortError = errorMessage === 'AbortError' || errorMessage.includes('aborted')

      if (isAbortError) {
        log('Aborted')
        return {
          text: finalText,
          toolCalls: allToolCalls,
          steps: step + 1,
          finishReason: 'aborted'
        }
      }

      logError('Error in agent loop:', err)
      throw err
    }
  }

  log('Reached max steps limit')
  return {
    text: finalText + '\n\n(Reached maximum steps limit)',
    toolCalls: allToolCalls,
    steps: step,
    finishReason: 'max-steps'
  }
}
