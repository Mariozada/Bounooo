import nunjucks from 'nunjucks'
import type { ToolDefinition } from '@tools/definitions'

// Import template as raw string (vite handles this with ?raw)
import systemTemplate from './templates/system.jinja?raw'

// Configure nunjucks environment
const env = new nunjucks.Environment(null, { autoescape: false })

/**
 * Render the system prompt with the given tools
 */
export function renderSystemPrompt(tools: ToolDefinition[]): string {
  return env.renderString(systemTemplate, { tools })
}

/**
 * Render a custom template string with context
 */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return env.renderString(template, context)
}
