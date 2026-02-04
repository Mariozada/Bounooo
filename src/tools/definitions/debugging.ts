import type { ToolDefinition } from './types'

export const debuggingTools: ToolDefinition[] = [
  {
    name: 'read_console_messages',
    description: 'Read browser console messages (logs, errors, warnings).',
    parameters: [
      {
        name: 'pattern',
        type: 'string',
        description: 'Filter pattern for messages',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of messages',
        default: 100
      },
      {
        name: 'onlyErrors',
        type: 'boolean',
        description: 'Only return error messages',
        default: false
      },
      {
        name: 'clear',
        type: 'boolean',
        description: 'Clear messages after reading',
        default: false
      }
    ],
    enabled: true,
    category: 'debugging'
  },
  {
    name: 'read_network_requests',
    description: 'Read HTTP network requests made by the page.',
    parameters: [
      {
        name: 'pattern',
        type: 'string',
        description: 'URL pattern to filter requests',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of requests',
        default: 100
      },
      {
        name: 'clear',
        type: 'boolean',
        description: 'Clear requests after reading',
        default: false
      }
    ],
    enabled: true,
    category: 'debugging'
  },
  {
    name: 'javascript_tool',
    description: 'Execute JavaScript code in the page context. Use with caution - prefer other tools when possible.',
    parameters: [
      {
        name: 'code',
        type: 'string',
        description: 'JavaScript code to execute',
        required: true
      }
    ],
    enabled: true,
    category: 'debugging'
  }
]
