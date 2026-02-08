import { useState, useCallback, useEffect, type FC } from 'react'
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plug,
  Info,
} from 'lucide-react'
import {
  loadMcpServers,
  addMcpServer,
  removeMcpServer,
  updateMcpServer,
  toggleMcpServer,
  setToolDisabled,
  McpManager,
  type McpServerConfig,
} from '@mcp/index'

export const McpTab: FC = () => {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [refreshingServer, setRefreshingServer] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setServers(await loadMcpServers())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = useCallback(async () => {
    if (!jsonInput.trim()) {
      setError('Please enter a JSON configuration')
      return
    }

    let parsed: Record<string, { url: string; headers?: Record<string, string> }>
    try {
      parsed = JSON.parse(jsonInput.trim())
    } catch {
      setError('Invalid JSON. Expected format: { "server-name": { "url": "..." } }')
      return
    }

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Expected a JSON object with server names as keys')
      return
    }

    // Unwrap common wrapper keys: { "mcpServers": {...} } or { "servers": {...} }
    for (const key of ['mcpServers', 'servers'] as const) {
      if (key in parsed && typeof (parsed as Record<string, unknown>)[key] === 'object') {
        parsed = (parsed as Record<string, unknown>)[key] as typeof parsed
        break
      }
    }

    const entries = Object.entries(parsed)
    if (entries.length === 0) {
      setError('No servers found in JSON')
      return
    }

    setIsAdding(true)
    setError(null)
    setSuccess(null)

    const added: string[] = []
    const failed: string[] = []

    for (const [name, config] of entries) {
      if (!config.url) {
        failed.push(`${name}: missing "url"`)
        continue
      }

      try {
        const tools = await McpManager.discoverTools(config.url, config.headers)
        await addMcpServer({
          name,
          url: config.url,
          enabled: true,
          headers: config.headers,
          cachedTools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            icon: t.icon,
            inputSchema: t.inputSchema,
          })),
        })
        added.push(`${name} (${tools.length} tools)`)
      } catch (err) {
        failed.push(`${name}: ${(err as Error).message}`)
      }
    }

    if (added.length > 0) {
      setSuccess(`Added: ${added.join(', ')}`)
      setJsonInput('')
      setShowAddForm(false)
    }
    if (failed.length > 0) {
      setError(`Failed: ${failed.join('; ')}`)
    }

    await load()
    setIsAdding(false)
  }, [jsonInput, load])

  const handleRemove = useCallback(async (server: McpServerConfig) => {
    if (!confirm(`Remove MCP server "${server.name}"?`)) return
    try {
      await removeMcpServer(server.id)
      setSuccess(`Server "${server.name}" removed`)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [load])

  const handleToggle = useCallback(async (server: McpServerConfig) => {
    try {
      await toggleMcpServer(server.id)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [load])

  const handleRefresh = useCallback(async (server: McpServerConfig) => {
    setRefreshingServer(server.id)
    setError(null)
    try {
      const tools = await McpManager.discoverTools(server.url, server.headers)
      await updateMcpServer(server.id, {
        cachedTools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })
      setSuccess(`Refreshed "${server.name}": ${tools.length} tools found`)
      await load()
    } catch (err) {
      setError(`Refresh failed: ${(err as Error).message}`)
    } finally {
      setRefreshingServer(null)
    }
  }, [load])

  const handleToolToggle = useCallback(async (serverId: string, toolName: string, currentlyDisabled: boolean) => {
    try {
      await setToolDisabled(serverId, toolName, !currentlyDisabled)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [load])

  const getToolStats = (server: McpServerConfig) => {
    const total = server.cachedTools?.length || 0
    const disabled = server.disabledTools?.length || 0
    return { total, disabled, enabled: total - disabled }
  }

  return (
    <div className="settings-tab-content">
      {error && (
        <div className="status-message error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>&times;</button>
        </div>
      )}
      {success && (
        <div className="status-message success">
          <CheckCircle size={16} />
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess(null)}>&times;</button>
        </div>
      )}

      {/* MCP Servers */}
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4>MCP Servers{servers.length > 0 && ` (${servers.length})`}</h4>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowAddForm(!showAddForm)}
            title="Add server"
          >
            <Plus size={18} />
          </button>
        </div>

        {showAddForm && (
          <div className="install-form">
            <div style={{ position: 'relative' }}>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={`{
  "server-name": {
    "url": "http://localhost:3000/mcp"
  }
}`}
                rows={8}
                spellCheck={false}
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}
              />
              <div className="mcp-json-info">
                <Info size={14} />
                <div className="mcp-json-info-tooltip">
                  <strong>JSON format</strong>
                  <pre>{`{
  "name": {
    "url": "http://...",
    "headers": { ... }
  }
}`}</pre>
                  <p><code>url</code> required (Streamable HTTP). <code>headers</code> optional. Multiple servers supported. Auto-unwraps <code>mcpServers</code> or <code>servers</code> wrappers.</p>
                </div>
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button-secondary"
                onClick={() => { setShowAddForm(false); setJsonInput('') }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleAdd}
                disabled={isAdding}
              >
                {isAdding ? 'Connecting...' : 'Add & Discover Tools'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="loading">Loading...</div>
        ) : servers.length === 0 && !showAddForm ? (
          <div className="empty-state">
            No MCP servers configured. Click + to add one.
          </div>
        ) : (
          <div className="skills-list">
            {servers.map((server) => {
              const stats = getToolStats(server)
              const isExpanded = expandedServer === server.id
              const isRefreshing = refreshingServer === server.id

              return (
                <div key={server.id} className={`skill-item ${!server.enabled ? 'disabled' : ''}`}>
                  <div className="skill-info" style={{ width: '100%' }}>
                    <div className="skill-header">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                        style={{ marginRight: 4 }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <Plug size={14} style={{ marginRight: 6, opacity: 0.6 }} />
                      <span className="skill-name">{server.name}</span>
                      <span className="skill-badge user">
                        {stats.total} tools{stats.disabled > 0 && ` (${stats.disabled} off)`}
                      </span>
                    </div>
                    <div className="skill-description">{server.url}</div>

                    <div className="skill-actions" style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => handleToggle(server)}
                        title={server.enabled ? 'Disable' : 'Enable'}
                      >
                        {server.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => handleRefresh(server)}
                        title="Refresh tools"
                        disabled={isRefreshing}
                      >
                        <RefreshCw size={16} className={isRefreshing ? 'spinning' : ''} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => handleRemove(server)}
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Expanded tool list */}
                    {isExpanded && server.cachedTools && (
                      <div className="mcp-tool-list">
                        {server.cachedTools.map((tool) => {
                          const isDisabled = server.disabledTools?.includes(tool.name) ?? false
                          return (
                            <div
                              key={tool.name}
                              className={`mcp-tool-item ${isDisabled ? 'disabled' : ''}`}
                            >
                              <div className="mcp-tool-info">
                                <span className="mcp-tool-name">
                                  {tool.icon && (
                                    <img
                                      src={tool.icon}
                                      alt=""
                                      className="mcp-tool-icon"
                                    />
                                  )}
                                  {tool.name}
                                </span>
                                {tool.description && (
                                  <span className="mcp-tool-desc">{tool.description}</span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="icon-button"
                                onClick={() => handleToolToggle(server.id, tool.name, !isDisabled)}
                                title={isDisabled ? 'Enable' : 'Disable'}
                              >
                                {isDisabled ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
