import type { ToolDefinition } from './types'

export const readingTools: ToolDefinition[] = [
  {
    name: 'read_page',
    description: 'Get the accessibility tree of the current page. Use this to understand the page structure and find element refs for interaction.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target browser tab ID. Use the starting tabId unless you intentionally switch tabs.',
        required: true
      },
      {
        name: 'filter',
        type: 'string',
        description: 'Filter elements: "all" for complete tree, "interactive" for clickable/input elements only',
        enum: ['all', 'interactive'],
        default: 'all'
      },
      {
        name: 'depth',
        type: 'number',
        description: 'Maximum depth to traverse the DOM tree',
        default: 15
      },
      {
        name: 'ref_id',
        type: 'string',
        description: 'Focus on a specific element by ref (e.g., "ref_1")',
        required: false
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'get_page_text',
    description: 'Extract raw text content from the page including title, URL, and body text.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target browser tab ID. Use the starting tabId unless you intentionally switch tabs.',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'find',
    description: 'Find elements on the page using natural language query. Returns matching elements with their refs.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target browser tab ID. Use the starting tabId unless you intentionally switch tabs.',
        required: true
      },
      {
        name: 'query',
        type: 'string',
        description: 'Natural language search query (e.g., "login button", "email input field")',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'read_result',
    description: 'Read a stored large tool output with pagination and search. When a tool returns more than 25,000 characters, the output is stored and you receive a preview with a result_id. Use this tool to explore the full output.',
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
        description: 'Line number to start reading from (1-indexed)',
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
        description: 'Regex pattern to filter lines. Returns only matching lines with their line numbers.',
        required: false
      }
    ],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'process_result',
    description: 'Run JavaScript code on a stored large tool output. The stored output is available as the DATA variable (string). Use this to parse, filter, or transform large outputs.',
    parameters: [
      {
        name: 'result_id',
        type: 'string',
        description: 'ID of the stored output (e.g., "web_fetch_3")',
        required: true
      },
      {
        name: 'code',
        type: 'string',
        description: 'JavaScript code to execute. The stored output is available as DATA (string). Return a value.',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  }
]
