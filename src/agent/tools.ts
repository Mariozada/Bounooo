import { tool } from 'ai'
import { z } from 'zod'

let currentTabId = 0
let currentGroupId: number | undefined

export function setCurrentTabId(tabId: number): void {
  currentTabId = tabId
}

export function setCurrentGroupId(groupId: number | undefined): void {
  currentGroupId = groupId
}

export function getCurrentTabId(): number {
  return currentTabId
}

export function getCurrentGroupId(): number | undefined {
  return currentGroupId
}

async function executeViaChromeMessage(
  toolName: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const paramsWithTab = {
    ...params,
    tabId: params.tabId ?? currentTabId,
    ...(currentGroupId !== undefined && { groupId: currentGroupId }),
  }

  console.log(`[Agent:Tool:${toolName}] Executing with params:`, paramsWithTab)

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_TOOL',
      tool: toolName,
      params: paramsWithTab,
    })

    console.log(`[Agent:Tool:${toolName}] Response:`, response?.success ? 'success' : 'error')

    if (response?.success) {
      return response.result ?? { success: true }
    } else {
      return { error: response?.error ?? 'Tool execution failed' }
    }
  } catch (err) {
    console.error(`[Agent:Tool:${toolName}] Exception:`, err)
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

const browserToolsDefinition = {
  read_page: tool({
    description: 'Get the accessibility tree of the current page. Use this to understand the page structure and find element refs for interaction.',
    inputSchema: z.object({
      filter: z.enum(['all', 'interactive']).optional().default('all').describe('Filter elements: "all" for complete tree, "interactive" for clickable/input elements only'),
      depth: z.number().optional().default(15).describe('Maximum depth to traverse the DOM tree'),
      ref_id: z.string().optional().describe('Focus on a specific element by ref (e.g., "ref_1")'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('read_page', params),
  }),

  get_page_text: tool({
    description: 'Extract raw text content from the page including title, URL, and body text.',
    inputSchema: z.object({}),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('get_page_text', params),
  }),

  find: tool({
    description: 'Find elements on the page using natural language query. Returns matching elements with their refs.',
    inputSchema: z.object({
      query: z.string().describe('Natural language search query (e.g., "login button", "email input field")'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('find', params),
  }),

  computer: tool({
    description: 'Perform mouse and keyboard actions on the page. Use refs from read_page to target elements.',
    inputSchema: z.object({
      action: z.enum([
        'left_click', 'right_click', 'double_click', 'triple_click',
        'type', 'key', 'scroll', 'scroll_to', 'hover',
        'left_click_drag', 'screenshot', 'zoom', 'wait'
      ]).describe('The action to perform'),
      ref: z.string().optional().describe('Element ref to interact with (e.g., "ref_1"). Required for click, type, hover actions'),
      coordinate: z.tuple([z.number(), z.number()]).optional().describe('x,y coordinates for click/drag actions'),
      text: z.string().optional().describe('Text to type or key to press (e.g., "Hello", "Enter", "Tab")'),
      modifiers: z.string().optional().describe('Modifier keys: ctrl, shift, alt, cmd (comma-separated)'),
      scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction'),
      scroll_amount: z.number().optional().default(3).describe('Number of scroll steps'),
      start_coordinate: z.tuple([z.number(), z.number()]).optional().describe('Start x,y for drag operations'),
      repeat: z.number().optional().default(1).describe('Times to repeat key press'),
      duration: z.number().optional().describe('Seconds to wait (for wait action)'),
      region: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe('x0,y0,x1,y1 region for zoom'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('computer', params),
  }),

  form_input: tool({
    description: 'Set form input values directly. Use for text inputs, textareas, selects, checkboxes, and radio buttons.',
    inputSchema: z.object({
      ref: z.string().describe('Element ref of the form input (e.g., "ref_1")'),
      value: z.string().describe('Value to set in the input'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('form_input', params),
  }),

  upload_image: tool({
    description: 'Upload an image to a file input or drag target.',
    inputSchema: z.object({
      imageId: z.string().describe('Screenshot ID from a previous computer screenshot action'),
      ref: z.string().optional().describe('File input element ref'),
      coordinate: z.tuple([z.number(), z.number()]).optional().describe('x,y coordinates for drag & drop upload'),
      filename: z.string().optional().default('image.png').describe('Filename for the uploaded image'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('upload_image', params),
  }),

  navigate: tool({
    description: 'Navigate to a URL or go back/forward in history.',
    inputSchema: z.object({
      url: z.string().describe('URL to navigate to, or "back"/"forward" for history navigation'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('navigate', params),
  }),

  tabs_context: tool({
    description: 'List all open browser tabs with their URLs and titles.',
    inputSchema: z.object({}),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('tabs_context', params),
  }),

  tabs_create: tool({
    description: 'Create a new browser tab.',
    inputSchema: z.object({
      url: z.string().optional().describe('URL to open in the new tab'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('tabs_create', params),
  }),

  resize_window: tool({
    description: 'Resize the browser window.',
    inputSchema: z.object({
      width: z.number().describe('Window width in pixels'),
      height: z.number().describe('Window height in pixels'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('resize_window', params),
  }),

  web_fetch: tool({
    description: 'Fetch content from a URL (useful for APIs or getting raw HTML).',
    inputSchema: z.object({
      url: z.string().describe('URL to fetch'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('web_fetch', params),
  }),

  read_console_messages: tool({
    description: 'Read browser console messages (logs, errors, warnings).',
    inputSchema: z.object({
      pattern: z.string().optional().describe('Filter pattern for messages'),
      limit: z.number().optional().default(100).describe('Maximum number of messages'),
      onlyErrors: z.boolean().optional().default(false).describe('Only return error messages'),
      clear: z.boolean().optional().default(false).describe('Clear messages after reading'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('read_console_messages', params),
  }),

  read_network_requests: tool({
    description: 'Read HTTP network requests made by the page.',
    inputSchema: z.object({
      pattern: z.string().optional().describe('URL pattern to filter requests'),
      limit: z.number().optional().default(100).describe('Maximum number of requests'),
      clear: z.boolean().optional().default(false).describe('Clear requests after reading'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('read_network_requests', params),
  }),

  javascript_tool: tool({
    description: 'Execute JavaScript code in the page context. Use with caution - prefer other tools when possible.',
    inputSchema: z.object({
      code: z.string().describe('JavaScript code to execute'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('javascript_tool', params),
  }),

  gif_creator: tool({
    description: 'Record and export GIF animations of browser actions.',
    inputSchema: z.object({
      action: z.enum(['start_recording', 'stop_recording', 'export', 'clear']).describe('GIF action to perform'),
      download: z.boolean().optional().default(false).describe('Download the GIF file'),
      filename: z.string().optional().describe('Filename for download'),
      coordinate: z.tuple([z.number(), z.number()]).optional().describe('x,y for drag & drop upload'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('gif_creator', params),
  }),

  read_result: tool({
    description: 'Read a stored large tool output with pagination and search. When a tool returns more than 25,000 characters, the output is stored and you receive a preview with a result_id. Use this tool to explore the full output.',
    inputSchema: z.object({
      result_id: z.string().describe('ID of the stored output (e.g., "read_page_1")'),
      offset: z.number().optional().default(1).describe('Line number to start reading from (1-indexed)'),
      limit: z.number().optional().default(200).describe('Number of lines to return'),
      pattern: z.string().optional().describe('Regex pattern to filter lines. Returns only matching lines with their line numbers.'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('read_result', params),
  }),

  process_result: tool({
    description: 'Run JavaScript code on a stored large tool output. The stored output is available as the DATA variable (string). Use this to parse, filter, or transform large outputs.',
    inputSchema: z.object({
      result_id: z.string().describe('ID of the stored output (e.g., "web_fetch_3")'),
      code: z.string().describe('JavaScript code to execute. The stored output is available as DATA (string). Return a value.'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('process_result', params),
  }),

  update_plan: tool({
    description: 'Present a plan to the user for approval before proceeding.',
    inputSchema: z.object({
      approach: z.string().describe('High-level description of the steps you plan to take'),
      domains: z.array(z.string()).describe('List of domains you will visit'),
    }),
    execute: async (params): Promise<Record<string, unknown>> => executeViaChromeMessage('update_plan', params),
  }),
}

export function getBrowserTools(): typeof browserToolsDefinition {
  return browserToolsDefinition
}

export function getTool<K extends keyof typeof browserToolsDefinition>(
  name: K
): typeof browserToolsDefinition[K] {
  return browserToolsDefinition[name]
}
