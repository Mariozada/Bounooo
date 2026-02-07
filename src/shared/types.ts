export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AXStateProperties {
  focusable?: boolean
  focused?: boolean
  editable?: boolean
  readonly?: boolean
  disabled?: boolean
  checked?: boolean | 'mixed'
  pressed?: boolean | 'mixed'
  selected?: boolean
  expanded?: boolean
  required?: boolean
  invalid?: boolean
  valueMin?: number
  valueMax?: number
  valueNow?: number
  valueText?: string
  busy?: boolean
  hidden?: boolean
  modal?: boolean
}

export interface ElementRef {
  ref: string
  tag: string
  role: string
  name?: string
  description?: string
  bounds?: Bounds
  visible?: boolean
  inViewport?: boolean
  interactive?: boolean
  ignored?: boolean
  states?: AXStateProperties
  value?: string
  placeholder?: string
  inputType?: string
  href?: string
  id?: string
  className?: string
  attributes?: Record<string, string>
  children?: ElementRef[]
  compoundChildren?: CompoundChild[]
}

export interface CompoundChild {
  role: string
  name: string
  valueNow?: string
}

export interface TabInfo {
  id: number
  title: string
  url: string
  active: boolean
  windowId: number
  index?: number
  pinned?: boolean
  audible?: boolean
}

export interface ReadPageParams {
  tabId: number
  depth?: number
  filter?: 'all' | 'interactive'
  ref_id?: string
}

export interface FindParams {
  tabId: number
  query: string
}

export interface FormInputParams {
  tabId: number
  ref: string
  value: string | boolean | number
}

export interface ComputerAction {
  action: 'left_click' | 'right_click' | 'double_click' | 'triple_click' |
          'type' | 'key' | 'scroll' | 'scroll_to' | 'hover' |
          'left_click_drag' | 'screenshot' | 'zoom' | 'wait'
  tabId: number
  coordinate?: [number, number]
  ref?: string
  text?: string
  modifiers?: string
  scroll_direction?: 'up' | 'down' | 'left' | 'right'
  scroll_amount?: number
  start_coordinate?: [number, number]
  repeat?: number
  duration?: number
  region?: [number, number, number, number]
}

export interface NavigateParams {
  tabId: number
  url: string
}

export interface ToolResult<T = unknown> {
  success: boolean
  result?: T
  error?: string
}

export interface ConsoleMessage {
  type: 'log' | 'error' | 'warn' | 'info' | 'debug' | 'exception'
  text: string
  timestamp: number
  source?: string
}

export interface NetworkRequest {
  url: string
  method: string
  type: string
  status: number
  statusText: string
  timestamp: number
  responseHeaders?: chrome.webRequest.HttpHeader[]
}

export interface Screenshot {
  imageId: string
  dataUrl: string
  width?: number
  height?: number
  timestamp: number
  tabId: number
}

export interface GifFrame {
  dataUrl: string
  timestamp: number
  tabId: number
  tool?: string
  actionType?: string
  coordinate?: [number, number]
  startCoordinate?: [number, number]
  ref?: string
  text?: string
  value?: string | boolean | number
  url?: string
  action?: string
}

export interface GifFrameMetadata {
  tool: string
  actionType?: string
  coordinate?: [number, number]
  startCoordinate?: [number, number]
  ref?: string
  text?: string
  value?: string | boolean | number
  url?: string
}

export interface GifRecordingState {
  recording: boolean
  frames: GifFrame[]
  startTime?: number
}
