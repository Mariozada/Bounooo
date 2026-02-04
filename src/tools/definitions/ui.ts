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
        type: 'string',
        description: 'Comma-separated list of domains you will visit',
        required: true
      }
    ],
    enabled: true,
    category: 'ui'
  }
]
