export function formatToolResults(results: { name: string; result: unknown }[]): string {
  const inner = results.map(r => {
    const output = typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2)
    return `<result>\n<name>${r.name}</name>\n<output>${output}</output>\n</result>`
  }).join('\n')

  return `<tool_results>\n${inner}\n</tool_results>`
}
