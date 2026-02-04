import type { ToolDefinition } from './types'

export const mediaTools: ToolDefinition[] = [
  {
    name: 'gif_creator',
    description: 'Record and export GIF animations of browser actions.',
    parameters: [
      {
        name: 'action',
        type: 'string',
        description: 'GIF action to perform',
        required: true,
        enum: ['start_recording', 'stop_recording', 'export', 'clear']
      },
      {
        name: 'download',
        type: 'boolean',
        description: 'Download the GIF file',
        default: false
      },
      {
        name: 'filename',
        type: 'string',
        description: 'Filename for download',
        required: false
      },
      {
        name: 'coordinate',
        type: 'array',
        description: 'x,y for drag & drop upload',
        required: false,
        items: { type: 'number' }
      }
    ],
    enabled: true,
    category: 'media'
  }
]
