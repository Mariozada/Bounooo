/**
 * Tool Definition Types
 *
 * These types define the structure of tool metadata used for:
 * 1. Generating prompts via Jinja templates
 * 2. Creating AI SDK tool wrappers
 * 3. Enabling/disabling tools dynamically
 */

export type ToolParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export type ToolCategory = 'reading' | 'interaction' | 'navigation' | 'debugging' | 'media' | 'ui'

export interface ToolParameter {
  name: string
  type: ToolParameterType
  description: string
  required?: boolean
  enum?: string[]
  default?: unknown
  items?: {
    type: ToolParameterType
  }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolParameter[]
  enabled: boolean
  category: ToolCategory
}
