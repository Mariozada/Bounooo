import type { AgentSession, AgentOptions, Message } from './types'
import { renderSystemPrompt } from '@prompts/render'
import { getEnabledToolDefinitions } from '@tools/definitions'
import { setCurrentTabId, setCurrentGroupId } from '../tools'

let sessionCounter = 0

function generateSessionId(): string {
  return `session_${Date.now()}_${++sessionCounter}`
}

export function createSession(options: AgentOptions): AgentSession {
  const {
    model,
    messages,
    tabId,
    groupId,
    maxSteps = 15,
    abortSignal,
    toolExecutor,
    activeSkill,
    availableSkills,
  } = options

  setCurrentTabId(tabId)
  setCurrentGroupId(groupId)

  const hasSkills = (availableSkills && availableSkills.length > 0) || activeSkill
  const toolDefinitions = getEnabledToolDefinitions().filter(
    t => hasSkills || t.category !== 'skills'
  )

  // Render system prompt with optional skills
  const systemPrompt = renderSystemPrompt({
    tools: toolDefinitions,
    activeSkill,
    availableSkills: hasSkills ? availableSkills : undefined,
  })

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
      toolExecutor,
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
