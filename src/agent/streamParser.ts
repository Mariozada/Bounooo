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

const BLOCK_OPEN = '<tool_calls>'
const BLOCK_CLOSE = '</tool_calls>'
const INVOKE_CLOSE = '</invoke>'
let domParser: DOMParser | null = null
function getDOMParser(): DOMParser {
  if (!domParser) domParser = new DOMParser()
  return domParser
}

/**
 * Streaming parser for `<tool_calls>` blocks. Text outside blocks is emitted
 * as deltas. Inside a block, each `<invoke>...</invoke>` is emitted the moment
 * its close tag arrives — no waiting for `</tool_calls>`.
 */
export class XMLStreamParser {
  private buffer = ''
  private textBuffer = ''
  private inBlock = false
  private invokeBuffer = ''
  private listeners: Map<StreamEventType | '*', EventListener[]> = new Map()
  private toolCallCounter = 0

  processChunk(chunk: string): void {
    this.buffer += chunk

    while (this.buffer.length > 0) {
      if (this.inBlock) {
        // Check for block close first — the block may end without a pending invoke
        const blockClose = this.buffer.indexOf(BLOCK_CLOSE)
        const invokeClose = this.buffer.indexOf(INVOKE_CLOSE)

        if (invokeClose !== -1 && (blockClose === -1 || invokeClose < blockClose)) {
          // Complete invoke found — emit it
          const end = invokeClose + INVOKE_CLOSE.length
          this.invokeBuffer += this.buffer.substring(0, end)
          this.buffer = this.buffer.substring(end)
          this._emitInvoke()
        } else if (blockClose !== -1) {
          // Block closes (any trailing whitespace between last </invoke> and </tool_calls> is ignored)
          this.buffer = this.buffer.substring(blockClose + BLOCK_CLOSE.length)
          this.inBlock = false
          this.invokeBuffer = ''
        } else {
          // Neither found — keep partial data, check for split close tags
          const partial = Math.min(
            findPartialSuffix(this.buffer, INVOKE_CLOSE),
            findPartialSuffix(this.buffer, BLOCK_CLOSE)
          )
          const splitAt = partial === -1
            ? Math.max(findPartialSuffix(this.buffer, INVOKE_CLOSE), findPartialSuffix(this.buffer, BLOCK_CLOSE))
            : partial

          if (splitAt !== -1) {
            this.invokeBuffer += this.buffer.substring(0, splitAt)
            this.buffer = this.buffer.substring(splitAt)
          } else {
            this.invokeBuffer += this.buffer
            this.buffer = ''
          }
          break
        }
      } else {
        const openIndex = this.buffer.indexOf(BLOCK_OPEN)

        if (openIndex !== -1) {
          if (openIndex > 0) {
            this._emitTextDelta(this.buffer.substring(0, openIndex))
          }
          this.inBlock = true
          this.invokeBuffer = ''
          this.buffer = this.buffer.substring(openIndex + BLOCK_OPEN.length)
        } else {
          const partial = findPartialSuffix(this.buffer, BLOCK_OPEN)
          if (partial !== -1) {
            if (partial > 0) {
              this._emitTextDelta(this.buffer.substring(0, partial))
            }
            this.buffer = this.buffer.substring(partial)
            break
          } else {
            this._emitTextDelta(this.buffer)
            this.buffer = ''
          }
        }
      }
    }
  }

  flush(): void {
    if (this.buffer) {
      this._emitTextDelta(this.buffer)
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
    this.inBlock = false
    this.invokeBuffer = ''
  }

  // ---------------------------------------------------------------------------

  private _emitTextDelta(text: string): void {
    if (!text) return
    this.textBuffer += text
    this._emit({ type: STREAM_EVENT_TYPES.TEXT_DELTA, data: text })
  }

  /** Parse a single `<invoke>` element from the invoke buffer and emit it. */
  private _emitInvoke(): void {
    const raw = this.invokeBuffer.trim()
    this.invokeBuffer = ''
    if (!raw) return

    // Wrap in a root so DOMParser is happy
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * e.g. buffer="abc</inv" tag="</invoke>" → returns 3
 */
function findPartialSuffix(buffer: string, tag: string): number {
  const start = Math.max(0, buffer.length - tag.length)
  for (let i = start; i < buffer.length; i++) {
    if (tag.startsWith(buffer.substring(i))) return i
  }
  return -1
}
