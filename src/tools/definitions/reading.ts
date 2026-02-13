import type { ToolDefinition } from './types'

export const readingTools: ToolDefinition[] = [
  {
    name: 'read_page',
    description: 'Get the accessibility tree of the page. The current tab\'s tree is auto-provided in <website_state> each turn — only call this for a different tab, filter, depth, or subtree.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'filter',
        type: 'string',
        description: '"all" for complete tree, "interactive" for clickable/input elements only',
        enum: ['all', 'interactive'],
        default: 'all'
      },
      {
        name: 'depth',
        type: 'number',
        description: 'Maximum tree depth',
        default: 15
      },
      {
        name: 'ref_id',
        type: 'string',
        description: 'Focus on a specific element subtree (e.g., "ref_1")',
        required: false
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'get_page_text',
    description: 'Extract raw text content from the page (title, URL, body text). Use when you need to read content rather than interact with elements.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'find',
    description: 'Find elements using natural language. Faster than read_page when you know what you\'re looking for.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'query',
        type: 'string',
        description: 'Natural language query (e.g., "login button", "email input")',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'read_result',
    description: 'Paginate or search a stored large tool output. When outputs exceed 25k chars, they are stored with a result_id — use this to explore them.',
    parameters: [
      {
        name: 'result_id',
        type: 'string',
        description: 'ID of the stored output (e.g., "read_page_1")',
        required: true
      },
      {
        name: 'offset',
        type: 'number',
        description: 'Starting line number (1-indexed)',
        default: 1
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Number of lines to return',
        default: 200
      },
      {
        name: 'pattern',
        type: 'string',
        description: 'Regex pattern to filter lines',
        required: false
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'process_result',
    description: 'Run JavaScript on a stored large tool output. The output is available as the DATA variable (string).',
    parameters: [
      {
        name: 'result_id',
        type: 'string',
        description: 'ID of the stored output (e.g., "fetch_url_3")',
        required: true
      },
      {
        name: 'code',
        type: 'string',
        description: 'JavaScript code to execute. DATA contains the stored output. Return a value.',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  }
]
