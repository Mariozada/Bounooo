/**
 * Tool Definitions Registry
 *
 * Central registry for all tool definitions. Provides functions to:
 * - Get all tool definitions
 * - Get enabled tools only
 * - Enable/disable tools dynamically
 */

import type { ToolDefinition, ToolCategory } from './types'
import { readingTools } from './reading'
import { interactionTools } from './interaction'
import { navigationTools } from './navigation'
import { debuggingTools } from './debugging'
import { mediaTools } from './media'
import { uiTools } from './ui'

export type { ToolDefinition, ToolParameter, ToolParameterType, ToolCategory } from './types'

// Combine all tool definitions
const allToolDefinitions: ToolDefinition[] = [
  ...readingTools,
  ...interactionTools,
  ...navigationTools,
  ...debuggingTools,
  ...mediaTools,
  ...uiTools
]

// Create a mutable map for runtime state (enabled/disabled)
const toolStateMap = new Map<string, boolean>()

// Initialize state from definitions
for (const tool of allToolDefinitions) {
  toolStateMap.set(tool.name, tool.enabled)
}

/**
 * Get all tool definitions
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return allToolDefinitions.map(tool => ({
    ...tool,
    enabled: toolStateMap.get(tool.name) ?? tool.enabled
  }))
}

/**
 * Get only enabled tool definitions
 */
export function getEnabledToolDefinitions(): ToolDefinition[] {
  return getAllToolDefinitions().filter(tool => tool.enabled)
}

/**
 * Get tool definitions by category
 */
export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return getAllToolDefinitions().filter(tool => tool.category === category)
}

/**
 * Get a single tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  const tool = allToolDefinitions.find(t => t.name === name)
  if (!tool) return undefined
  return {
    ...tool,
    enabled: toolStateMap.get(tool.name) ?? tool.enabled
  }
}

/**
 * Enable or disable a tool
 */
export function setToolEnabled(name: string, enabled: boolean): void {
  if (allToolDefinitions.some(t => t.name === name)) {
    toolStateMap.set(name, enabled)
  }
}

/**
 * Check if a tool is enabled
 */
export function isToolEnabled(name: string): boolean {
  return toolStateMap.get(name) ?? false
}

/**
 * Reset all tools to their default enabled state
 */
export function resetToolStates(): void {
  for (const tool of allToolDefinitions) {
    toolStateMap.set(tool.name, tool.enabled)
  }
}

/**
 * Get tool names grouped by category
 */
export function getToolNamesByCategory(): Record<ToolCategory, string[]> {
  const result: Record<ToolCategory, string[]> = {
    reading: [],
    interaction: [],
    navigation: [],
    debugging: [],
    media: [],
    ui: []
  }

  for (const tool of allToolDefinitions) {
    result[tool.category].push(tool.name)
  }

  return result
}
