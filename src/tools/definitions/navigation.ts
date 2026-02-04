import type { ToolDefinition } from './types'

export const navigationTools: ToolDefinition[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL or go back/forward in history.',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to navigate to, or "back"/"forward" for history navigation',
        required: true
      }
    ],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'tabs_context',
    description: 'List all open browser tabs with their URLs and titles.',
    parameters: [],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'tabs_create',
    description: 'Create a new browser tab.',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to open in the new tab',
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
        name: 'width',
        type: 'number',
        description: 'Window width in pixels',
        required: true
      },
      {
        name: 'height',
        type: 'number',
        description: 'Window height in pixels',
        required: true
      }
    ],
    enabled: true,
    category: 'navigation'
  },
  {
    name: 'web_fetch',
    description: 'Fetch content from a URL (useful for APIs or getting raw HTML).',
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
