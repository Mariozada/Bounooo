import type { ToolDefinition } from './types'

export const uiTools: ToolDefinition[] = [
  {
    name: 'update_plan',
    description: 'Present a plan to the user for approval before proceeding.',
    parameters: [
      {
        name: 'approach',
        type: 'string',
        description: 'High-level description of the steps you plan to take',
        required: true
      },
      {
        name: 'domains',
        type: 'array',
        description: 'List of domains you will visit',
        required: true,
        items: { type: 'string' }
      }
    ],
    enabled: true,
    category: 'ui'
  }
]
