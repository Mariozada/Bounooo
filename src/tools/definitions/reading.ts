import type { ToolDefinition } from './types'

export const readingTools: ToolDefinition[] = [
  {
    name: 'read_page',
    description: 'Get the accessibility tree of the current page. Use this to understand the page structure and find element refs for interaction.',
    parameters: [
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
    parameters: [],
    enabled: true,
    category: 'reading'
  },
  {
    name: 'find',
    description: 'Find elements on the page using natural language query. Returns matching elements with their refs.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Natural language search query (e.g., "login button", "email input field")',
        required: true
      }
    ],
    enabled: true,
    category: 'reading'
  }
]
