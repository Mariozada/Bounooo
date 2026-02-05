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

export class XMLStreamParser {
  private buffer = ''
  private textBuffer = ''
  private inToolCall = false
  private toolCallBuffer = ''
  private toolCallName = ''
  private listeners: Map<StreamEventType | '*', EventListener[]> = new Map()
  private toolCallCounter = 0

  processChunk(chunk: string): void {
    this.buffer += chunk

    while (this.buffer.length > 0) {
      if (this.inToolCall) {
        const closeIndex = this.buffer.indexOf('</tool_call>')

        if (closeIndex !== -1) {
          this.toolCallBuffer += this.buffer.substring(0, closeIndex)
          this.buffer = this.buffer.substring(closeIndex + '</tool_call>'.length)
          this.inToolCall = false
          this._emitToolCall()
        } else {
          this.toolCallBuffer += this.buffer
          this.buffer = ''
        }
      } else {
        const openMatch = this.buffer.match(/<tool_call\s+name=["']([^"']+)["']>/)

        if (openMatch) {
          const openIndex = this.buffer.indexOf(openMatch[0])

          if (openIndex > 0) {
            const textBefore = this.buffer.substring(0, openIndex)
            this._emitTextDelta(textBefore)
          }

          this.inToolCall = true
          this.toolCallName = openMatch[1]
          this.toolCallBuffer = ''
          this.buffer = this.buffer.substring(openIndex + openMatch[0].length)
        } else {
          const partialMatch = this.buffer.match(/<tool_call[^>]*$|<tool_cal$|<tool_ca$|<tool_c$|<tool_$|<tool$|<too$|<to$|<t$|<$/)

          if (partialMatch) {
            const safeText = this.buffer.substring(0, partialMatch.index)
            if (safeText) {
              this._emitTextDelta(safeText)
            }
            this.buffer = this.buffer.substring(partialMatch.index!)
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
    this.inToolCall = false
    this.toolCallBuffer = ''
    this.toolCallName = ''
  }

  private _emitTextDelta(text: string): void {
    if (!text) return
    this.textBuffer += text
    this._emit({ type: STREAM_EVENT_TYPES.TEXT_DELTA, data: text })
  }

  private _emitToolCall(): void {
    const id = `tc_${++this.toolCallCounter}`
    const params = this._parseToolParams(this.toolCallBuffer)

    const toolCall: ToolCallEvent = {
      id,
      name: this.toolCallName,
      params,
    }

    this._emit({ type: STREAM_EVENT_TYPES.TOOL_CALL_START, data: toolCall })
    this._emit({ type: STREAM_EVENT_TYPES.TOOL_CALL_DONE, data: toolCall })

    this.toolCallBuffer = ''
    this.toolCallName = ''
  }

  private _parseToolParams(content: string): Record<string, unknown> {
    const params: Record<string, unknown> = {}
    const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
    let match: RegExpExecArray | null

    while ((match = paramRegex.exec(content)) !== null) {
      const [, paramName, rawValue] = match
      const value = this._extractValue(rawValue)
      params[paramName] = this._parseValue(value)
    }

    return params
  }

  private _extractValue(rawValue: string): string {
    const cdataMatch = rawValue.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
    if (cdataMatch) {
      return cdataMatch[1]
    }
    return rawValue.trim()
  }

  private _parseValue(value: string): unknown {
    if (value.startsWith('[') || value.startsWith('{')) {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }

    if (value === 'true') return true
    if (value === 'false') return false

    const num = Number(value)
    if (!isNaN(num) && value !== '') return num

    return value
  }

  private _emit(event: StreamEvent): void {
    const specific = this.listeners.get(event.type) || []
    for (const listener of specific) {
      listener(event)
    }

    const wildcard = this.listeners.get('*') || []
    for (const listener of wildcard) {
      listener(event)
    }
  }
}

export function parsePartialJSON(jsonString: string): unknown | undefined {
  try {
    const tokens = tokenize(jsonString)
    const cleanedTokens = cleanupTokens(tokens)
    const closedTokens = closeOpenBraces(cleanedTokens)
    const fixedJson = tokensToString(closedTokens)
    return JSON.parse(fixedJson)
  } catch {
    return undefined
  }
}

interface Token {
  type: 'brace' | 'paren' | 'separator' | 'delimiter' | 'string' | 'number' | 'name'
  value: string
}

function tokenize(str: string): Token[] {
  let i = 0
  const tokens: Token[] = []

  while (i < str.length) {
    const char = str[i]

    if (char === '\\') { i++; continue }
    if (char === '{') { tokens.push({ type: 'brace', value: '{' }); i++; continue }
    if (char === '}') { tokens.push({ type: 'brace', value: '}' }); i++; continue }
    if (char === '[') { tokens.push({ type: 'paren', value: '[' }); i++; continue }
    if (char === ']') { tokens.push({ type: 'paren', value: ']' }); i++; continue }
    if (char === ':') { tokens.push({ type: 'separator', value: ':' }); i++; continue }
    if (char === ',') { tokens.push({ type: 'delimiter', value: ',' }); i++; continue }

    if (char === '"') {
      let value = ''
      let incomplete = false
      let c = str[++i]

      while (c !== '"') {
        if (i === str.length) { incomplete = true; break }
        if (c === '\\') { value += c + str[++i]; c = str[++i] }
        else { value += c; c = str[++i] }
      }

      if (!incomplete) tokens.push({ type: 'string', value })
      i++
      continue
    }

    if (/\s/.test(char)) { i++; continue }

    if (/[0-9\-.]/.test(char)) {
      let numStr = ''
      if (char === '-') { numStr += char; i++ }
      while (/[0-9.]/.test(str[i]) && i < str.length) { numStr += str[i]; i++ }
      tokens.push({ type: 'number', value: numStr })
      continue
    }

    if (/[a-z]/i.test(char)) {
      let keyword = ''
      while (/[a-z]/i.test(str[i]) && i < str.length) { keyword += str[i]; i++ }
      if (['true', 'false', 'null'].includes(keyword)) {
        tokens.push({ type: 'name', value: keyword })
      }
      continue
    }

    i++
  }

  return tokens
}

function cleanupTokens(tokens: Token[]): Token[] {
  if (tokens.length === 0) return tokens

  const lastToken = tokens[tokens.length - 1]

  switch (lastToken.type) {
    case 'separator':
    case 'delimiter':
      return cleanupTokens(tokens.slice(0, -1))

    case 'number':
      const lastChar = lastToken.value[lastToken.value.length - 1]
      if (lastChar === '.' || lastChar === '-') {
        return cleanupTokens(tokens.slice(0, -1))
      }
      break

    case 'string':
      const prevToken = tokens[tokens.length - 2]
      if (prevToken?.type === 'delimiter' || (prevToken?.type === 'brace' && prevToken.value === '{')) {
        return cleanupTokens(tokens.slice(0, -1))
      }
      break
  }

  return tokens
}

function closeOpenBraces(tokens: Token[]): Token[] {
  const stack: string[] = []

  for (const token of tokens) {
    if (token.type === 'brace') {
      if (token.value === '{') stack.push('}')
      else stack.splice(stack.lastIndexOf('}'), 1)
    }
    if (token.type === 'paren') {
      if (token.value === '[') stack.push(']')
      else stack.splice(stack.lastIndexOf(']'), 1)
    }
  }

  stack.reverse().forEach(closer => {
    tokens.push({ type: closer === '}' ? 'brace' : 'paren', value: closer })
  })

  return tokens
}

function tokensToString(tokens: Token[]): string {
  return tokens.map(t => t.type === 'string' ? `"${t.value}"` : t.value).join('')
}
