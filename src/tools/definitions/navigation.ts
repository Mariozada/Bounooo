import type { ToolDefinition } from './types'

export const navigationTools: ToolDefinition[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL, or pass "back"/"forward" for history navigation. Refs become stale after navigation — re-read the page.',
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
  {
    name: 'tabs_context',
    description: 'List all open tabs in your group with their IDs, URLs, and titles.',
    parameters: [],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'tabs_create',
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
    name: 'web_fetch',
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
  }
]
