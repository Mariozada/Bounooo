export const STREAM_EVENT_TYPES = {
  TEXT_DELTA: 'text_delta',
  TEXT_DONE: 'text_done',
  TOOL_CALL_START: 'tool_call_start',
  TOOL_CALL_DONE: 'tool_call_done',
  TOOL_RESULT: 'tool_result',
  STREAM_START: 'stream_start',
  STREAM_DONE: 'stream_done',
  STREAM_ERROR: 'stream_error',
} as const

export type StreamEventType = typeof STREAM_EVENT_TYPES[keyof typeof STREAM_EVENT_TYPES]

export interface ToolCallEvent {
  id: string
  name: string
  params: Record<string, unknown>
}

export interface ToolResultEvent {
  id: string
  name: string
  result: unknown
  error?: string
}

export interface StreamEvent {
  type: StreamEventType
  data?: unknown
}

type EventListener = (event: StreamEvent) => void

const INVOKE_OPEN = '<invoke'
const INVOKE_CLOSE = '</invoke>'
const LEGACY_TOOL_CALL_WRAPPER_TAGS = [
  '<tool_calls>',
  '</tool_calls>',
  '<tools_call>',
  '</tools_call>',
] as const
const TOOL_XML_START_TAGS = [INVOKE_OPEN, ...LEGACY_TOOL_CALL_WRAPPER_TAGS]

let domParser: DOMParser | null = null

function getDOMParser(): DOMParser {
  if (!domParser) domParser = new DOMParser()
  return domParser
}

/**
 * Streaming parser for tool calls. Preferred format is plain `<invoke>...</invoke>`
 * blocks. Legacy wrapper tags (`<tool_calls>...</tool_calls>`) are ignored if present.
 */
export class XMLStreamParser {
  private buffer = ''
  private textBuffer = ''
  private listeners: Map<StreamEventType | '*', EventListener[]> = new Map()
  private toolCallCounter = 0

  processChunk(chunk: string): void {
    this.buffer += chunk

    while (this.buffer.length > 0) {
      const nextTag = findNextToolTag(this.buffer)

      if (!nextTag) {
        const partial = getEarliestPartialIndex(this.buffer, TOOL_XML_START_TAGS)
        if (partial !== -1) {
          if (partial > 0) {
            this._emitTextDelta(this.buffer.substring(0, partial))
          }
          this.buffer = this.buffer.substring(partial)
        } else {
          this._emitTextDelta(this.buffer)
          this.buffer = ''
        }
        break
      }

      if (nextTag.index > 0) {
        this._emitTextDelta(this.buffer.substring(0, nextTag.index))
        this.buffer = this.buffer.substring(nextTag.index)
        continue
      }

      if (nextTag.kind === 'wrapper') {
        this.buffer = this.buffer.substring(nextTag.tag.length)
        continue
      }

      const invokeClose = this.buffer.indexOf(INVOKE_CLOSE)
      if (invokeClose === -1) {
        break
      }

      const end = invokeClose + INVOKE_CLOSE.length
      const rawInvoke = this.buffer.substring(0, end)
      this.buffer = this.buffer.substring(end)
      this._emitInvoke(rawInvoke)
    }
  }

  flush(): void {
    this.processChunk('')

    if (this.buffer) {
      const nextTag = findNextToolTag(this.buffer)

      if (nextTag && nextTag.index > 0) {
        this._emitTextDelta(this.buffer.substring(0, nextTag.index))
      } else if (!nextTag) {
        const partial = getEarliestPartialIndex(this.buffer, TOOL_XML_START_TAGS)
        if (partial === -1) {
          this._emitTextDelta(this.buffer)
        } else if (partial > 0) {
          this._emitTextDelta(this.buffer.substring(0, partial))
        }
      }

      this.buffer = ''
    }

    if (this.textBuffer) {
      this._emit({ type: STREAM_EVENT_TYPES.TEXT_DONE, data: this.textBuffer })
      this.textBuffer = ''
    }
  }

  on(event: StreamEventType | '*', listener: EventListener): () => void {
    const listeners = this.listeners.get(event) || []
    listeners.push(listener)
    this.listeners.set(event, listeners)
    return () => {
      const idx = listeners.indexOf(listener)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }

  reset(): void {
    this.buffer = ''
    this.textBuffer = ''
  }

  private _emitTextDelta(text: string): void {
    if (!text) return
    this.textBuffer += text
    this._emit({ type: STREAM_EVENT_TYPES.TEXT_DELTA, data: text })
  }

  private _emitInvoke(rawInvoke: string): void {
    const raw = rawInvoke.trim()
    if (!raw) return

    const doc = getDOMParser().parseFromString(`<r>${raw}</r>`, 'text/xml')
    if (doc.querySelector('parsererror')) {
      console.warn('[XMLStreamParser] Parse error, raw:', raw)
      return
    }

    const invoke = doc.querySelector('invoke')
    if (!invoke) return

    const name = invoke.getAttribute('name') || ''
    const params: Record<string, unknown> = {}

    for (const param of invoke.querySelectorAll('parameter')) {
      const paramName = param.getAttribute('name')
      if (paramName) {
        params[paramName] = parseValue((param.textContent || '').trim())
      }
    }

    const id = `tc_${++this.toolCallCounter}`
    const toolCall: ToolCallEvent = { id, name, params }
    this._emit({ type: STREAM_EVENT_TYPES.TOOL_CALL_START, data: toolCall })
    this._emit({ type: STREAM_EVENT_TYPES.TOOL_CALL_DONE, data: toolCall })
  }

  private _emit(event: StreamEvent): void {
    for (const listener of this.listeners.get(event.type) || []) {
      listener(event)
    }
    for (const listener of this.listeners.get('*') || []) {
      listener(event)
    }
  }
}

/** Coerce a string value to a JS primitive or parsed JSON. */
function parseValue(value: string): unknown {
  if (value.startsWith('[') || value.startsWith('{')) {
    try { return JSON.parse(value) } catch { return value }
  }
  if (value === 'true') return true
  if (value === 'false') return false
  const num = Number(value)
  if (!isNaN(num) && value !== '') return num
  return value
}

/**
 * Return the index where `buffer` ends with a prefix of `tag`, or -1.
 * e.g. buffer="abc</inv" tag="</invoke>" -> returns 3
 */
function findPartialSuffix(buffer: string, tag: string): number {
  const start = Math.max(0, buffer.length - tag.length)
  for (let i = start; i < buffer.length; i++) {
    if (tag.startsWith(buffer.substring(i))) return i
  }
  return -1
}

interface NextToolTag {
  index: number
  kind: 'invoke' | 'wrapper'
  tag: string
}

function findNextToolTag(buffer: string): NextToolTag | null {
  let match: NextToolTag | null = null

  const invokeIndex = findNextInvokeStart(buffer)
  if (invokeIndex !== -1) {
    match = { index: invokeIndex, kind: 'invoke', tag: INVOKE_OPEN }
  }

  for (const tag of LEGACY_TOOL_CALL_WRAPPER_TAGS) {
    const idx = buffer.indexOf(tag)
    if (idx === -1) continue
    if (!match || idx < match.index) {
      match = { index: idx, kind: 'wrapper', tag }
    }
  }

  return match
}

function findNextInvokeStart(buffer: string): number {
  let searchFrom = 0

  while (searchFrom < buffer.length) {
    const idx = buffer.indexOf(INVOKE_OPEN, searchFrom)
    if (idx === -1) {
      return -1
    }

    const nextChar = buffer[idx + INVOKE_OPEN.length]
    if (nextChar === '>' || /\s/.test(nextChar)) {
      return idx
    }

    searchFrom = idx + 1
  }

  return -1
}

function getEarliestPartialIndex(buffer: string, tags: readonly string[]): number {
  let earliest = -1

  for (const tag of tags) {
    const idx = findPartialSuffix(buffer, tag)
    if (idx === -1) continue
    if (earliest === -1 || idx < earliest) {
      earliest = idx
    }
  }

  return earliest
}
