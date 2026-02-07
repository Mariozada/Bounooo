export type ToolParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export type ToolCategory = 'reading' | 'interaction' | 'navigation' | 'debugging' | 'media' | 'ui' | 'skills'

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
