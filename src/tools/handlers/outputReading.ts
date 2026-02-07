import { registerTool } from '../registry'
import { readOutput, processOutput } from '@shared/outputStore'

async function handleReadResult(params: Record<string, unknown>): Promise<unknown> {
  const result_id = params.result_id as string
  if (!result_id) {
    return { error: 'result_id is required' }
  }

  return readOutput({
    result_id,
    offset: params.offset as number | undefined,
    limit: params.limit as number | undefined,
    pattern: params.pattern as string | undefined,
  })
}

async function handleProcessResult(params: Record<string, unknown>): Promise<unknown> {
  const result_id = params.result_id as string
  const code = params.code as string

  if (!result_id) {
    return { error: 'result_id is required' }
  }
  if (!code) {
    return { error: 'code is required' }
  }

  return processOutput({ result_id, code })
}

export function registerOutputReadingTools(): void {
  registerTool('read_result', handleReadResult)
  registerTool('process_result', handleProcessResult)
}
