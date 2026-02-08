/**
 * MCP server configuration storage (chrome.storage.local)
 */

export interface McpCachedTool {
  name: string
  description: string
  icon?: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; items?: { type?: string }; default?: unknown }>
    required?: string[]
  }
}

export interface McpServerConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  headers?: Record<string, string>
  disabledTools?: string[]
  cachedTools?: McpCachedTool[]
}

const STORAGE_KEY = 'bouno_mcp_servers'

export async function loadMcpServers(): Promise<McpServerConfig[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return (result[STORAGE_KEY] as McpServerConfig[]) || []
  } catch {
    return []
  }
}

export async function saveMcpServers(servers: McpServerConfig[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: servers })
}

export async function addMcpServer(
  server: Omit<McpServerConfig, 'id'>,
): Promise<McpServerConfig> {
  const servers = await loadMcpServers()
  const newServer: McpServerConfig = {
    ...server,
    id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }
  servers.push(newServer)
  await saveMcpServers(servers)
  return newServer
}

export async function removeMcpServer(id: string): Promise<void> {
  const servers = await loadMcpServers()
  await saveMcpServers(servers.filter((s) => s.id !== id))
}

export async function updateMcpServer(
  id: string,
  updates: Partial<McpServerConfig>,
): Promise<void> {
  const servers = await loadMcpServers()
  const index = servers.findIndex((s) => s.id === id)
  if (index !== -1) {
    servers[index] = { ...servers[index], ...updates }
    await saveMcpServers(servers)
  }
}

export async function toggleMcpServer(id: string): Promise<void> {
  const servers = await loadMcpServers()
  const server = servers.find((s) => s.id === id)
  if (server) {
    server.enabled = !server.enabled
    await saveMcpServers(servers)
  }
}

export async function setToolDisabled(
  serverId: string,
  toolName: string,
  disabled: boolean,
): Promise<void> {
  const servers = await loadMcpServers()
  const server = servers.find((s) => s.id === serverId)
  if (!server) return

  const disabledTools = new Set(server.disabledTools || [])
  if (disabled) {
    disabledTools.add(toolName)
  } else {
    disabledTools.delete(toolName)
  }
  server.disabledTools = [...disabledTools]
  await saveMcpServers(servers)
}
