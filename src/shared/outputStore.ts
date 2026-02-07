import { MAX_TOOL_OUTPUT_CHARS, OUTPUT_PREVIEW_CHARS, MAX_STORED_OUTPUT_CHARS } from '@shared/constants'

const outputStore = new Map<string, string[]>()
let outputCounter = 0

function formatLineNumber(lineNum: number, width: number): string {
  return String(lineNum).padStart(width, ' ')
}

function getLineNumWidth(totalLines: number): number {
  return Math.max(String(totalLines).length, 4)
}

export function storeOutput(toolName: string, output: string): string {
  outputCounter++
  const id = `${toolName}_${outputCounter}`
  const stored = output.length > MAX_STORED_OUTPUT_CHARS
    ? output.slice(0, MAX_STORED_OUTPUT_CHARS)
    : output
  outputStore.set(id, stored.split('\n'))
  return id
}

export function formatStoredPreview(id: string, toolName: string, output: string): string {
  const lines = outputStore.get(id)
  if (!lines) return output

  const totalLines = lines.length
  const totalChars = output.length

  const head = output.slice(0, OUTPUT_PREVIEW_CHARS)
  const tail = output.slice(-OUTPUT_PREVIEW_CHARS)

  return [
    `[Large output stored: id="${id}", ${totalLines} lines, ${totalChars} chars]`,
    '',
    `--- First ${OUTPUT_PREVIEW_CHARS} chars ---`,
    head,
    '',
    `--- Last ${OUTPUT_PREVIEW_CHARS} chars ---`,
    tail,
    '',
    'Use read_result to explore (offset, limit, pattern) or process_result to run JS on it.',
  ].join('\n')
}

export function isLargeOutput(output: string): boolean {
  return output.length > MAX_TOOL_OUTPUT_CHARS
}

export function readOutput(params: {
  result_id: string
  offset?: number
  limit?: number
  pattern?: string
}): { output: string } {
  const { result_id, offset = 1, limit = 200, pattern } = params

  const lines = outputStore.get(result_id)
  if (!lines) {
    return { output: `Error: Output expired — re-run the original tool to get fresh data.` }
  }

  const totalLines = lines.length
  const width = getLineNumWidth(totalLines)

  if (pattern) {
    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'i')
    } catch {
      return { output: `Error: Invalid regex pattern "${pattern}"` }
    }

    const matches: string[] = []
    for (let i = 0; i < totalLines; i++) {
      if (regex.test(lines[i])) {
        matches.push(`${formatLineNumber(i + 1, width)}│ ${lines[i]}`)
      }
    }

    if (matches.length === 0) {
      return { output: `No matches for "${pattern}" in ${result_id} (${totalLines} lines)` }
    }

    return {
      output: `${matches.length} matches for "${pattern}" in ${result_id} (${totalLines} lines):\n${matches.join('\n')}`,
    }
  }

  const startIdx = Math.max(0, offset - 1)
  const endIdx = Math.min(totalLines, startIdx + limit)
  const slice = lines.slice(startIdx, endIdx)

  const formatted = slice
    .map((line, i) => `${formatLineNumber(startIdx + i + 1, width)}│ ${line}`)
    .join('\n')

  return {
    output: `Lines ${startIdx + 1}–${endIdx} of ${totalLines} (${result_id}):\n${formatted}`,
  }
}

export function processOutput(params: {
  result_id: string
  code: string
}): { output: unknown } {
  const { result_id, code } = params

  const lines = outputStore.get(result_id)
  if (!lines) {
    return { output: `Error: Output expired — re-run the original tool to get fresh data.` }
  }

  const data = lines.join('\n')

  try {
    const fn = new Function('DATA', code)
    const result = fn(data)
    return { output: result }
  } catch (err) {
    return { output: `Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function clearOutputs(): void {
  outputStore.clear()
  outputCounter = 0
}
