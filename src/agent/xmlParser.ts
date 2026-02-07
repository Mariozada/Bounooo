import { isLargeOutput, storeOutput, formatStoredPreview } from '@shared/outputStore'

export function formatToolResults(results: { name: string; result: unknown }[]): string {
  const inner = results.map(r => {
    const output = typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2)

    if (isLargeOutput(output)) {
      const id = storeOutput(r.name, output)
      const preview = formatStoredPreview(id, r.name, output)
      return `<result>\n<name>${r.name}</name>\n<output>${preview}</output>\n</result>`
    }

    return `<result>\n<name>${r.name}</name>\n<output>${output}</output>\n</result>`
  }).join('\n')

  return `<tool_results>\n${inner}\n</tool_results>`
}
