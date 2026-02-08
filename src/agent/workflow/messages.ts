import type { StepResult, ToolExecutionResult, AgentSession, Message, ContentPart } from './types'
import type { TabInfo } from '@shared/types'
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

/** Extract screenshot dataUrls from tool results and strip them from the result objects. */
function extractScreenshots(toolResults: ToolExecutionResult[]): string[] {
  const images: string[] = []

  for (const tr of toolResults) {
    const result = tr.result as Record<string, unknown> | null
    if (result && typeof result === 'object' && typeof result.dataUrl === 'string') {
      const dataUrl = result.dataUrl as string
      if (dataUrl.startsWith('data:image/')) {
        images.push(dataUrl)
        // Remove dataUrl from result so it's not sent as base64 text
        delete result.dataUrl
      }
    }
  }

  return images
}

export function buildToolResultsMessage(toolResults: ToolExecutionResult[]): string | ContentPart[] {
  const images = extractScreenshots(toolResults)

  const text = formatToolResults(
    toolResults.map(tr => ({ name: tr.toolCall.name, result: tr.result }))
  )

  if (images.length === 0) {
    return text
  }

  const parts: ContentPart[] = [{ type: 'text', text }]
  for (const dataUrl of images) {
    parts.push({ type: 'image', image: dataUrl, mediaType: 'image/png' })
  }
  return parts
}

function renderTabsList(tabs: TabInfo[], currentTabId: number): string {
  const lines = [`<tabs_list current="${currentTabId}">`]
  for (const tab of tabs) {
    const attrs = [`id="${tab.id}"`, `title="${tab.title}"`, `url="${tab.url}"`]
    if (tab.audible) attrs.push('audible')
    lines.push(`  <tab ${attrs.join(' ')} />`)
  }
  lines.push('</tabs_list>')
  return lines.join('\n')
}

/** Append fresh tab context to the last user message in the session. */
export function injectTabContext(messages: Message[], tabs: TabInfo[], currentTabId: number): void {
  const tabsXml = renderTabsList(tabs, currentTabId)

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    const msg = messages[i]

    if (typeof msg.content === 'string') {
      msg.content = msg.content + '\n\n' + tabsXml
    } else {
      msg.content = [...msg.content, { type: 'text', text: '\n\n' + tabsXml }]
    }
    return
  }
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
