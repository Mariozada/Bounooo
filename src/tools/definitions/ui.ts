import type { ToolDefinition } from './types'

export const uiTools: ToolDefinition[] = [
  {
    name: 'update_plan',
    description: 'Present your plan to the user before starting a multi-step task. Call this at the start and update it if the plan changes.',
    parameters: [
      {
        name: 'approach',
        type: 'string',
        description: 'High-level approach: what you will do and in what order',
        required: true
      },
      {
        name: 'domains',
        type: 'array',
        description: 'Domains you will visit',
        required: true,
        items: { type: 'string' }
      }
    ],
    enabled: true,
    category: 'ui'
  }
]
