import type { ToolDefinition } from './types'

export const debuggingTools: ToolDefinition[] = [
  {
    name: 'read_console_messages',
    description: 'Read browser console output (logs, errors, warnings).',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'pattern',
        type: 'string',
        description: 'Filter pattern for messages',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum messages to return',
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
    description: 'Read HTTP requests made by the page.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'pattern',
        type: 'string',
        description: 'URL pattern to filter requests',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum requests to return',
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
    description: 'Execute JavaScript in the page context. Use as a last resort when other tools can\'t achieve the task.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'code',
        type: 'string',
        description: 'JavaScript code to execute in the page',
        required: true
      }
    ],
    enabled: true,
    category: 'debugging'
  }
]
