import type { ToolDefinition } from './types'

export const interactionTools: ToolDefinition[] = [
  {
    name: 'computer',
    description: 'Perform mouse and keyboard actions on the page.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'action',
        type: 'string',
        description: 'The action to perform',
        required: true,
        enum: [
          'left_click', 'right_click', 'double_click', 'triple_click',
          'type', 'key', 'scroll', 'scroll_to', 'hover',
          'left_click_drag', 'screenshot', 'zoom', 'wait'
        ]
      },
      {
        name: 'ref',
        type: 'string',
        description: 'Element ref (e.g., "ref_1"). Required for click, type, hover',
        required: false
      },
      {
        name: 'coordinate',
        type: 'array',
        description: '[x, y] coordinates for click/drag when no ref available',
        required: false,
        items: { type: 'number' }
      },
      {
        name: 'text',
        type: 'string',
        description: 'Text to type or key to press (e.g., "Hello", "Enter", "Tab")',
        required: false
      },
      {
        name: 'modifiers',
        type: 'string',
        description: 'Modifier keys: ctrl, shift, alt, cmd (comma-separated)',
        required: false
      },
      {
        name: 'scroll_direction',
        type: 'string',
        description: 'Scroll direction',
        required: false,
        enum: ['up', 'down', 'left', 'right']
      },
      {
        name: 'scroll_amount',
        type: 'number',
        description: 'Number of scroll steps',
        default: 3
      },
      {
        name: 'start_coordinate',
        type: 'array',
        description: 'Start [x, y] for drag operations',
        required: false,
        items: { type: 'number' }
      },
      {
        name: 'repeat',
        type: 'number',
        description: 'Times to repeat key press',
        default: 1
      },
      {
        name: 'duration',
        type: 'number',
        description: 'Seconds to wait (for wait action)',
        required: false
      },
      {
        name: 'region',
        type: 'array',
        description: '[x0, y0, x1, y1] region for zoom',
        required: false,
        items: { type: 'number' }
      }
    ],
    enabled: true,
    category: 'interaction'
  },
  {
    name: 'form_input',
    description: 'Set form input values directly. More reliable than computer type action for filling forms.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'ref',
        type: 'string',
        description: 'Element ref of the form input',
        required: true
      },
      {
        name: 'value',
        type: 'string',
        description: 'Value to set',
        required: true
      }
    ],
    enabled: true,
    category: 'interaction'
  },
  {
    name: 'upload_image',
    description: 'Upload a screenshot to a file input or drag target on the page.',
    parameters: [
      {
        name: 'tabId',
        type: 'number',
        description: 'Target tab ID',
        required: true
      },
      {
        name: 'imageId',
        type: 'string',
        description: 'Screenshot ID from a previous computer screenshot action',
        required: true
      },
      {
        name: 'ref',
        type: 'string',
        description: 'File input element ref',
        required: false
      },
      {
        name: 'coordinate',
        type: 'array',
        description: '[x, y] for drag & drop upload',
        required: false,
        items: { type: 'number' }
      },
      {
        name: 'filename',
        type: 'string',
        description: 'Filename for the uploaded image',
        default: 'image.png'
      }
    ],
    enabled: true,
    category: 'interaction'
  }
]
