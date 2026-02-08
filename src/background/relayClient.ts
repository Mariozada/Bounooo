import { executeTool, getRegisteredTools } from '@tools/index'
import { getAllToolDefinitions } from '@tools/index'

interface RelayRequest {
  id: string
  type: 'execute_tool' | 'list_tools' | 'agent'
  payload: Record<string, unknown>
}

export interface RelayConfig {
  enabled: boolean
  url: string
  token: string
}

const STORAGE_KEY = 'bouno_relay_config'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000

let ws: WebSocket | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let intentionalClose = false

function getReconnectDelay(): number {
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS)
  // Add jitter (±25%)
  return delay * (0.75 + Math.random() * 0.5)
}

async function loadConfig(): Promise<RelayConfig | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const config = result[STORAGE_KEY] as RelayConfig | undefined
  if (!config?.enabled || !config?.url || !config?.token) return null
  return config
}

export async function loadRelayConfig(): Promise<RelayConfig> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const config = result[STORAGE_KEY] as RelayConfig | undefined
  return config ?? { enabled: false, url: '', token: '' }
}

export async function saveRelayConfig(config: RelayConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config })
}

export function getRelayStatus(): { connected: boolean } {
  return { connected: ws?.readyState === WebSocket.OPEN }
}

function disconnect(): void {
  intentionalClose = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
}

async function connect(): Promise<void> {
  const config = await loadConfig()
  if (!config) {
    console.log('[relay] No relay config found, skipping connection')
    return
  }

  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return
  }

  intentionalClose = false
  console.log(`[relay] Connecting to ${config.url}...`)

  try {
    ws = new WebSocket(config.url)
  } catch (err) {
    console.error('[relay] Failed to create WebSocket:', err)
    scheduleReconnect()
    return
  }

  const socket = ws

  socket.onopen = () => {
    console.log('[relay] Connected, sending auth...')
    socket.send(JSON.stringify({ type: 'auth', token: config.token }))
  }

  socket.onmessage = (event) => {
    const raw = typeof event.data === 'string' ? event.data : ''
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw)
    } catch {
      console.warn('[relay] Invalid message:', raw)
      return
    }

    // Auth response
    if (msg.type === 'auth_ok') {
      console.log('[relay] Authenticated')
      reconnectAttempt = 0
      socket.send(JSON.stringify({
        type: 'status',
        tools: getRegisteredTools(),
      }))
      return
    }

    // Request from server (must have both id and a request type)
    if (msg.id && msg.type && msg.type !== 'status') {
      handleRequest(msg as unknown as RelayRequest)
    }
  }

  ws.onclose = (event) => {
    console.log(`[relay] Disconnected: code=${event.code} reason=${event.reason}`)
    ws = null
    if (!intentionalClose && event.code !== 4001) {
      scheduleReconnect()
    }
  }

  ws.onerror = (event) => {
    console.error('[relay] WebSocket error:', event)
  }
}

function scheduleReconnect(): void {
  if (intentionalClose) return
  const delay = getReconnectDelay()
  reconnectAttempt++
  console.log(`[relay] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempt})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

async function handleRequest(request: RelayRequest): Promise<void> {
  let response: { id: string; success: boolean; data?: unknown; error?: string }

  try {
    switch (request.type) {
      case 'list_tools': {
        const definitions = getAllToolDefinitions()
        response = { id: request.id, success: true, data: definitions }
        break
      }

      case 'execute_tool': {
        const { tool, params } = request.payload as { tool: string; params: Record<string, unknown> }
        const result = await executeTool(tool, params)
        response = { id: request.id, success: result.success, data: result.result, error: result.error }
        break
      }

      case 'agent': {
        // Placeholder — will be implemented when agent endpoint is added
        response = { id: request.id, success: false, error: 'Agent endpoint not yet implemented' }
        break
      }

      default:
        response = { id: request.id, success: false, error: `Unknown request type: ${request.type}` }
    }
  } catch (err) {
    response = { id: request.id, success: false, error: (err as Error).message }
  }

  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response))
  }
}

// Auto-connect on load
connect()

// Listen for config changes from the UI
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    console.log('[relay] Config changed, reconnecting...')
    disconnect()
    connect()
  }
})
