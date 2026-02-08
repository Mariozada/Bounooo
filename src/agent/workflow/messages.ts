import type { StepResult, ToolExecutionResult, AgentSession } from './types'
import { formatToolResults } from '../xmlParser'
import { appendAssistantMessage, appendUserMessage } from './session'

export function buildAssistantResponse(stepResult: StepResult): string {
  let response = stepResult.text

  if (stepResult.toolCalls.length > 0) {
    if (!response.endsWith('\n') && response.length > 0) {
      response += '\n'
    }
    for (const tc of stepResult.toolCalls) {
      response += `<invoke name="${tc.name}">\n`
      for (const [key, value] of Object.entries(tc.input)) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
        response += `<parameter name="${key}">${valueStr}</parameter>\n`
      }
      response += `</invoke>\n`
    }
    response = response.trimEnd()
  }

  return response
}

export function buildToolResultsMessage(toolResults: ToolExecutionResult[]): string {
  return formatToolResults(
    toolResults.map(tr => ({ name: tr.toolCall.name, result: tr.result }))
  )
}

export function appendStepMessages(
  session: AgentSession,
  stepResult: StepResult,
  toolResults: ToolExecutionResult[]
): void {
  const assistantContent = buildAssistantResponse(stepResult)
  appendAssistantMessage(session, assistantContent)

  const toolResultsContent = buildToolResultsMessage(toolResults)
  appendUserMessage(session, toolResultsContent)
}
