import type { AgentSession, AgentOptions, Message } from './types'
import { renderSystemPrompt } from '@prompts/render'
import { getEnabledToolDefinitions } from '@tools/definitions'
import { setCurrentTabId, setCurrentGroupId } from '../tools'

let sessionCounter = 0

function generateSessionId(): string {
  return `session_${Date.now()}_${++sessionCounter}`
}

export function createSession(options: AgentOptions): AgentSession {
  const { model, messages, tabId, groupId, maxSteps = 15, abortSignal } = options

  setCurrentTabId(tabId)
  setCurrentGroupId(groupId)

  const toolDefinitions = getEnabledToolDefinitions()
  const systemPrompt = renderSystemPrompt(toolDefinitions)

  return {
    id: generateSessionId(),
    model,
    messages: [...messages],
    systemPrompt,
    toolDefinitions,
    config: {
      maxSteps,
      tabId,
      groupId,
    },
    abortSignal,
  }
}

export function appendAssistantMessage(session: AgentSession, content: string): void {
  session.messages.push({
    role: 'assistant',
    content,
  })
}

export function appendUserMessage(session: AgentSession, content: string): void {
  session.messages.push({
    role: 'user',
    content,
  })
}

export function getMessages(session: AgentSession): Message[] {
  return session.messages
}

export function isAborted(session: AgentSession): boolean {
  return session.abortSignal?.aborted ?? false
}
