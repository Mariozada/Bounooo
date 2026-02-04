import type { ToolDefinition } from '@tools/definitions'

// Import precompiled template (our Vite plugin handles .jinja files)
import { render as renderSystemTemplate } from './templates/system.jinja'

/**
 * Render the system prompt with the given tools
 */
export function renderSystemPrompt(tools: ToolDefinition[]): string {
  return renderSystemTemplate({ tools })
}
