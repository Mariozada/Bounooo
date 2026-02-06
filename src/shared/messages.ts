export const MessageTypes = {
  READ_PAGE: 'READ_PAGE',
  GET_PAGE_TEXT: 'GET_PAGE_TEXT',
  FIND_ELEMENTS: 'FIND_ELEMENTS',
  FORM_INPUT: 'FORM_INPUT',
  COMPUTER_ACTION: 'COMPUTER_ACTION',
  UPLOAD_IMAGE: 'UPLOAD_IMAGE',
  GET_CONSOLE_MESSAGES: 'GET_CONSOLE_MESSAGES',
  CLEAR_CONSOLE_MESSAGES: 'CLEAR_CONSOLE_MESSAGES',

  GET_PAGE_INFO: 'GET_PAGE_INFO',
  HIGHLIGHT_TEXT: 'HIGHLIGHT_TEXT',
  GET_LINKS: 'GET_LINKS',
  GET_IMAGES: 'GET_IMAGES',

  GET_TAB_INFO: 'GET_TAB_INFO',
  EXECUTE_SCRIPT: 'EXECUTE_SCRIPT',
  EXECUTE_TOOL: 'EXECUTE_TOOL',
  CONSOLE_MESSAGE: 'CONSOLE_MESSAGE',
  CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
  TAKE_SCREENSHOT: 'TAKE_SCREENSHOT',
} as const

export type MessageType = typeof MessageTypes[keyof typeof MessageTypes]

export interface BaseMessage {
  type: MessageType
}

export interface ReadPageMessage extends BaseMessage {
  type: typeof MessageTypes.READ_PAGE
  depth?: number
  filter?: 'all' | 'interactive'
  ref_id?: string
}

export interface FindElementsMessage extends BaseMessage {
  type: typeof MessageTypes.FIND_ELEMENTS
  query: string
}

export interface FormInputMessage extends BaseMessage {
  type: typeof MessageTypes.FORM_INPUT
  ref: string
  value: string | boolean | number
}

export interface ComputerActionMessage extends BaseMessage {
  type: typeof MessageTypes.COMPUTER_ACTION
  action: string
  coordinate?: [number, number]
  ref?: string
  text?: string
  modifiers?: string
  scroll_direction?: string
  scroll_amount?: number
  start_coordinate?: [number, number]
  repeat?: number
}

export interface ExecuteToolMessage extends BaseMessage {
  type: typeof MessageTypes.EXECUTE_TOOL
  tool: string
  params: Record<string, unknown>
}

export interface ConsoleMessageData extends BaseMessage {
  type: typeof MessageTypes.CONSOLE_MESSAGE
  data: {
    type: string
    text: string
    timestamp: number
  }
}

export function createMessage<T extends BaseMessage>(message: T): T {
  return message
}
