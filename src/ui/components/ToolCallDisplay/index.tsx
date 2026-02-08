import { useState, Component, type FC, type ReactNode } from 'react'
import type { ToolCallInfo } from '@agent/index'
import type { ToolCallDisplayProps, ToolRendererProps } from './helpers'
import { STATUS_ICONS, formatToolName, str, formatJson, getRunningLabel, KV } from './helpers'
import { TOOL_RENDERERS } from './renderers'

export type { ToolCallInfo }

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ToolCallDisplay] Render error:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

// ─── Fallback Generic Renderer ───────────────────────────────────────────────

const GenericRenderer: FC<ToolRendererProps> = ({ input, result, status, error }) => {
  const [showFull, setShowFull] = useState(false)

  const hasError = !!error
  const hasResult = result !== undefined
  const errorLines = (error || '').split('\n')
  const isLongError = errorLines.length > 3 || (error || '').length > 200
  const json = hasResult ? formatJson(result) : ''
  const lines = json.split('\n')

  return (
    <div className="tool-call-output">
      {Object.keys(input).length > 0 && (
        <div className="tool-body">
          {Object.entries(input).slice(0, 4).map(([k, v]) => (
            <KV key={k} label={k} value={str(v, 60)} />
          ))}
        </div>
      )}
      {status === 'completed' || status === 'error' ? (
        hasError ? (
          <>
            <pre className="tool-call-output-preview tool-call-error-content">
              {showFull || !isLongError
                ? error
                : errorLines.slice(0, 3).join('\n') + ((error || '').length > 200 ? '...' : '')}
            </pre>
            {isLongError && (
              <button
                type="button"
                className="tool-call-toggle"
                onClick={() => setShowFull(!showFull)}
              >
                {showFull ? 'Show less' : 'Show full error'}
              </button>
            )}
          </>
        ) : hasResult ? (
          <>
            <pre className="tool-call-output-preview">
              {showFull ? json : lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n...' : '')}
            </pre>
            {lines.length > 8 && (
              <button
                type="button"
                className="tool-call-toggle"
                onClick={() => setShowFull(!showFull)}
              >
                {showFull ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        ) : (
          <div className="tool-call-success">Completed successfully</div>
        )
      ) : null}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

const ToolCallContent: FC<ToolCallDisplayProps> = ({
  toolCall,
  defaultExpanded = false,
  showHeader = true,
  allowCollapse = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const statusIcon = STATUS_ICONS[toolCall.status] || '?'
  const isFinished = toolCall.status === 'completed' || toolCall.status === 'error'
  const canToggle = isFinished && allowCollapse
  const isExpanded = allowCollapse ? expanded : true

  const Renderer = TOOL_RENDERERS[toolCall.name]
  const hasCustomRenderer = !!Renderer

  return (
    <div className={`tool-call tool-call--${toolCall.status}${showHeader ? '' : ' tool-call--detail'}`}>
      {showHeader && (
        <div className="tool-call-header">
          <span className="tool-call-icon" aria-hidden="true">{statusIcon}</span>
          <span className="tool-call-name">{formatToolName(toolCall.name)}</span>
          {canToggle ? (
            <button
              type="button"
              className="tool-call-show-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide' : 'Show'}
            </button>
          ) : (
            <span className="tool-call-status">
              {toolCall.status === 'running' ? 'Running' : toolCall.status === 'pending' ? 'Pending' : 'Completed'}
            </span>
          )}
        </div>
      )}

      {toolCall.status === 'running' && (
        <div className="tool-call-input-summary">
          {getRunningLabel(toolCall.name, toolCall.input)}
        </div>
      )}

      {isFinished && isExpanded && (
        hasCustomRenderer ? (
          toolCall.error ? (
            <div className="tool-call-output">
              <pre className="tool-call-output-preview tool-call-error-content">
                {toolCall.error}
              </pre>
            </div>
          ) : (
            <Renderer
              input={toolCall.input}
              result={toolCall.result}
              status={toolCall.status}
              error={toolCall.error}
            />
          )
        ) : (
          <GenericRenderer
            input={toolCall.input}
            result={toolCall.result}
            status={toolCall.status}
            error={toolCall.error}
          />
        )
      )}
    </div>
  )
}

export const ToolCallDisplay: FC<ToolCallDisplayProps> = ({
  toolCall,
  defaultExpanded,
  showHeader,
  allowCollapse,
}) => {
  const fallback = (
    <div className="tool-call tool-call--error">
      <div className="tool-call-header">
        <span className="tool-call-icon">✕</span>
        <span className="tool-call-name">{toolCall?.name || 'Unknown Tool'}</span>
        <span className="tool-call-status">Render Error</span>
      </div>
      <div className="tool-call-output">
        <div className="tool-call-error">Failed to display tool call details</div>
      </div>
    </div>
  )

  return (
    <ErrorBoundary fallback={fallback}>
      <ToolCallContent
        toolCall={toolCall}
        defaultExpanded={defaultExpanded}
        showHeader={showHeader}
        allowCollapse={allowCollapse}
      />
    </ErrorBoundary>
  )
}
