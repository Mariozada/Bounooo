import type { ToolDefinition } from './types'

export const navigationTools: ToolDefinition[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL, or pass "back"/"forward" for history navigation.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'url',
        type: 'string',
        description: 'URL to navigate to, or "back"/"forward"',
        required: true
      }
    ],
    enabled: true,
    category: 'navigation'
  },
  // list_tabs removed — tab context is now injected into user messages automatically
  // {
  //   name: 'list_tabs',
  //   description: 'List all open tabs in your group with their IDs, URLs, and titles.',
  //   parameters: [],
  //   enabled: true,
  //   category: 'navigation'
  // },
  {
    name: 'close_tab',
    description: 'Close a browser tab. Only use when explicitly asked, as part of the task, or to clean up a tab you opened by accident. Cannot close the starting tab.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Tab ID to close',
        required: true
      }
    ],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'create_tab',
    description: 'Create a new browser tab (opens in background). Returns the new tab ID.',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to open',
        required: false
      }
    ],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'resize_window',
    description: 'Resize the browser window.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'width',
        type: 'number',
        description: 'Width in pixels',
        required: true
      },
      {
        name: 'height',
        type: 'number',
        description: 'Height in pixels',
        required: true
      }
    ],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'fetch_url',
    description: 'Fetch raw content from a URL. Use for APIs or when you need HTML/JSON rather than the rendered page.',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to fetch',
        required: true
      }
    ],
    enabled: true,
    category: 'navigation'
  },
]
