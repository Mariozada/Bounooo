/**
 * MCP multi-server manager — builds tool definitions from cached configs
 * and routes tool execution to the correct server.
 */

import type { ToolDefinition, ToolParameter, ToolParameterType } from '@tools/definitions'
import type { McpServerConfig, McpCachedTool } from './storage'
import { mcpInitialize, mcpListTools, mcpCallTool, type McpToolInfo } from './client'

const MCP_PREFIX = 'mcp__'
const log = (...args: unknown[]) => console.log('[MCP:Manager]', ...args)

interface ServerEntry {
  config: McpServerConfig
  tools: McpCachedTool[]
}

function toToolParamType(jsonType?: string): ToolParameterType {
  switch (jsonType) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'array'
    case 'object':
      return 'object'
    default:
      return 'string'
  }
}

function convertInputSchema(schema?: McpCachedTool['inputSchema']): ToolParameter[] {
  if (!schema?.properties) return []
  const required = new Set(schema.required || [])

  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: toToolParamType(prop.type),
    description: prop.description || '',
    required: required.has(name),
    ...(prop.enum && { enum: prop.enum }),
    ...(prop.default !== undefined && { default: prop.default }),
    ...(prop.items && { items: { type: toToolParamType(prop.items.type) } }),
  }))
}

function prefixedName(serverName: string, toolName: string): string {
  return `${MCP_PREFIX}${serverName}__${toolName}`
}

export function parsePrefixedName(name: string): { serverName: string; toolName: string } | null {
  if (!name.startsWith(MCP_PREFIX)) return null
  const rest = name.slice(MCP_PREFIX.length)
  const sepIndex = rest.indexOf('__')
  if (sepIndex === -1) return null
  return { serverName: rest.slice(0, sepIndex), toolName: rest.slice(sepIndex + 2) }
}

export class McpManager {
  private servers: ServerEntry[] = []

  loadFromConfigs(configs: McpServerConfig[]): void {
    this.servers = configs
      .filter((c) => c.enabled && c.cachedTools?.length)
      .map((c) => ({ config: c, tools: c.cachedTools! }))

    log(
      'Loaded',
      this.servers.length,
      'servers,',
      this.servers.reduce((n, s) => n + s.tools.length, 0),
      'total tools',
    )
  }

  getToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = []

    for (const { config, tools } of this.servers) {
      const disabled = new Set(config.disabledTools || [])

      for (const tool of tools) {
        defs.push({
          name: prefixedName(config.name, tool.name),
          description: tool.description,
          parameters: convertInputSchema(tool.inputSchema),
          enabled: !disabled.has(tool.name),
          category: 'mcp',
        })
      }
    }

    return defs
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const parsed = parsePrefixedName(name)
    if (!parsed) return { success: false, error: `Invalid MCP tool name: ${name}` }

    const server = this.servers.find((s) => s.config.name === parsed.serverName)
    if (!server) return { success: false, error: `MCP server not found: ${parsed.serverName}` }

    try {
      const result = await mcpCallTool(
        server.config.url,
        parsed.toolName,
        args,
        server.config.headers,
      )

      // Extract text content from MCP result
      const textParts = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n')

      if (result.isError) {
        return { success: false, error: textParts || 'MCP tool returned an error' }
      }

      return { success: true, result: textParts || result.content }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  /**
   * Discover tools from an MCP server (used by settings UI when adding/refreshing).
   */
  static async discoverTools(
    url: string,
    headers?: Record<string, string>,
  ): Promise<McpToolInfo[]> {
    await mcpInitialize(url, headers)
    return mcpListTools(url, headers)
  }
}
