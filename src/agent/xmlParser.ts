export function formatToolResult(toolName: string, result: unknown): string {
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)

  return `<tool_result name="${toolName}">
${resultStr}
</tool_result>`
}
