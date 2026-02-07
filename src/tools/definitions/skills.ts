import type { ToolDefinition } from './types'

/**
 * Skill-related tool definitions
 */
export const skillTools: ToolDefinition[] = [
  {
    name: 'invoke_skill',
    description:
      'Invoke an installed skill to get specialized instructions for a task. Use this when you recognize a task that matches an available skill. The skill instructions will guide you on how to complete the task.',
    parameters: [
      {
        name: 'skill_name',
        type: 'string',
        description: 'The name of the skill to invoke (e.g., "summary")',
        required: true,
      },
    ],
    enabled: true,
    category: 'skills',
  },
]
