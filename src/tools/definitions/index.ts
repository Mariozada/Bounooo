import type { ToolDefinition, ToolCategory } from './types'
import { readingTools } from './reading'
import { interactionTools } from './interaction'
import { navigationTools } from './navigation'
import { debuggingTools } from './debugging'
import { mediaTools } from './media'
import { uiTools } from './ui'
import { skillTools } from './skills'

export type { ToolDefinition, ToolParameter, ToolParameterType, ToolCategory } from './types'

const allToolDefinitions: ToolDefinition[] = [
  ...readingTools,
  ...interactionTools,
  ...navigationTools,
  ...debuggingTools,
  ...mediaTools,
  ...uiTools,
  ...skillTools,
]

const toolStateMap = new Map<string, boolean>()

for (const tool of allToolDefinitions) {
  toolStateMap.set(tool.name, tool.enabled)
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return allToolDefinitions.map(tool => ({
    ...tool,
    enabled: toolStateMap.get(tool.name) ?? tool.enabled
  }))
}

export function getEnabledToolDefinitions(): ToolDefinition[] {
  return getAllToolDefinitions().filter(tool => tool.enabled)
}

export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return getAllToolDefinitions().filter(tool => tool.category === category)
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  const tool = allToolDefinitions.find(t => t.name === name)
  if (!tool) return undefined
  return {
    ...tool,
    enabled: toolStateMap.get(tool.name) ?? tool.enabled
  }
}

export function setToolEnabled(name: string, enabled: boolean): void {
  if (allToolDefinitions.some(t => t.name === name)) {
    toolStateMap.set(name, enabled)
  }
}

export function isToolEnabled(name: string): boolean {
  return toolStateMap.get(name) ?? false
}

export function resetToolStates(): void {
  for (const tool of allToolDefinitions) {
    toolStateMap.set(tool.name, tool.enabled)
  }
}

export function getToolNamesByCategory(): Record<ToolCategory, string[]> {
  const result: Record<ToolCategory, string[]> = {
    reading: [],
    interaction: [],
    navigation: [],
    debugging: [],
    media: [],
    ui: [],
    skills: [],
    mcp: [],
  }

  for (const tool of allToolDefinitions) {
    result[tool.category].push(tool.name)
  }

  return result
}
