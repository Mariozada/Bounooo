/**
 * Lightweight MCP client using Streamable HTTP transport (JSON-RPC 2.0 over POST)
 */

const HTTP_STATUS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized — check your auth headers',
  403: 'Forbidden',
  404: 'Not Found — check the URL',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
}

let requestIdCounter = 0

function nextId(): number {
  return ++requestIdCounter
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpIcon {
  src: string
  mimeType?: string
  sizes?: string[]
}

interface McpToolSchema {
  name: string
  description?: string
  icons?: McpIcon[]
  inputSchema?: {
    type: 'object'
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; items?: { type?: string }; default?: unknown }>
    required?: string[]
  }
}

export interface McpToolInfo {
  name: string
  description: string
  icon?: string // src URL of the first icon, if any
  inputSchema?: McpToolSchema['inputSchema']
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>
  isError?: boolean
}

async function rpcCall(
  url: string,
  method: string,
  params: Record<string, unknown> = {},
  headers?: Record<string, string>,
): Promise<unknown> {
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextId(),
    method,
    params,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const status = res.statusText || HTTP_STATUS[res.status] || 'Error'
    throw new Error(`MCP server returned ${res.status} ${status}`)
  }

  const json = (await res.json()) as JsonRpcResponse
  if (json.error) {
    throw new Error(`MCP error ${json.error.code}: ${json.error.message}`)
  }
  return json.result
}

export async function mcpInitialize(
  url: string,
  headers?: Record<string, string>,
): Promise<{ capabilities: Record<string, unknown>; serverInfo?: { name: string; version?: string } }> {
  const result = await rpcCall(url, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'bouno', version: '1.0.0' },
  }, headers)

  // Send initialized notification (fire-and-forget)
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  }).catch(() => {})

  return result as { capabilities: Record<string, unknown>; serverInfo?: { name: string; version?: string } }
}

export async function mcpListTools(
  url: string,
  headers?: Record<string, string>,
): Promise<McpToolInfo[]> {
  const result = (await rpcCall(url, 'tools/list', {}, headers)) as { tools: McpToolSchema[] }
  return (result.tools || []).map((t) => ({
    name: t.name,
    description: t.description || '',
    icon: t.icons?.[0]?.src,
    inputSchema: t.inputSchema,
  }))
}

export async function mcpCallTool(
  url: string,
  name: string,
  args: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<McpCallResult> {
  const result = await rpcCall(url, 'tools/call', { name, arguments: args }, headers)
  return result as McpCallResult
}
