import type { ToolResult } from '@shared/types'

type ToolHandler<T = unknown> = (params: Record<string, unknown>) => Promise<T>
const toolHandlers = new Map<string, ToolHandler>()

export function registerTool(name: string, handler: ToolHandler): void {
  console.log(`[Bouno:registry] Registered tool: ${name}`)
  toolHandlers.set(name, handler)
}

export async function executeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
  console.log(`[Bouno:registry] executeTool called: ${name}`, params)
  const handler = toolHandlers.get(name)

  if (!handler) {
    console.log(`[Bouno:registry] Unknown tool: ${name}`)
    return {
      success: false,
      error: `Unknown tool: ${name}. Available tools: ${Array.from(toolHandlers.keys()).join(', ')}`
    }
  }

  try {
    console.log(`[Bouno:registry] Executing handler for: ${name}`)
    const result = await handler(params) as Record<string, unknown>

    if (result && typeof result === 'object' && 'error' in result) {
      console.log(`[Bouno:registry] Handler returned error:`, result.error)
      return {
        success: false,
        error: result.error as string,
        result: result
      }
    }

    console.log(`[Bouno:registry] Handler success for: ${name}`)
    return {
      success: true,
      result
    }
  } catch (err) {
    const error = err as Error & { _debugLogs?: string[] }
    console.log(`[Bouno:registry] Handler threw error:`, error.message)
    return {
      success: false,
      error: error.message || String(err),
      result: { _debugLogs: error._debugLogs || [`Exception: ${error.message}`] }
    }
  }
}

export function getRegisteredTools(): string[] {
  return Array.from(toolHandlers.keys())
}

export function hasTool(name: string): boolean {
  return toolHandlers.has(name)
}
