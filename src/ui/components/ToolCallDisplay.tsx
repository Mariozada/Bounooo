import { useState, Component, type FC, type ReactNode } from 'react'
import type { ToolCallInfo } from '@agent/index'

export type { ToolCallInfo }

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo
}

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

const STATUS_ICONS: Record<ToolCallInfo['status'], string> = {
  pending: '○',
  running: '◐',
  completed: '●',
  error: '✕',
}

function formatToolName(name: string): string {
  if (!name) return 'Unknown Tool'
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function safeStringify(value: unknown, maxLen = 100): string {
  try {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') {
      return value.length > maxLen ? value.slice(0, maxLen) + '...' : value
    }
    const str = JSON.stringify(value)
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
  } catch {
    return '[Unable to display]'
  }
}

function summarizeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return 'No parameters'

  try {
    const entries = Object.entries(input as Record<string, unknown>)
    if (entries.length === 0) return 'No parameters'

    const summary = entries
      .slice(0, 2)
      .map(([key, value]) => {
        const strValue = safeStringify(value, 30)
        return `${key}: ${strValue}`
      })
      .join(', ')

    if (entries.length > 2) {
      return summary + ` (+${entries.length - 2} more)`
    }
    return summary
  } catch {
    return 'Parameters available'
  }
}

function formatJson(value: unknown): string {
  try {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2) || 'null'
  } catch {
    return '[Unable to display JSON]'
  }
}

function formatResultPreview(result: unknown, maxLines = 5): string {
  const json = formatJson(result)
  const lines = json.split('\n')
  if (lines.length <= maxLines) {
    return json
  }
  return lines.slice(0, maxLines).join('\n') + '\n...'
}

const ToolCallContent: FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false)
  const [showFullOutput, setShowFullOutput] = useState(false)
  const [showFullError, setShowFullError] = useState(false)

  const statusIcon = STATUS_ICONS[toolCall.status] || '?'
  const hasResult = toolCall.result !== undefined
  const hasError = !!toolCall.error
  const isFinished = toolCall.status === 'completed' || toolCall.status === 'error'

  const errorText = toolCall.error || ''
  const errorLines = errorText.split('\n')
  const isLongError = errorLines.length > 3 || errorText.length > 200

  return (
    <div className={`tool-call tool-call--${toolCall.status}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon" aria-hidden="true">{statusIcon}</span>
        <span className="tool-call-name">{formatToolName(toolCall.name)}</span>
        {isFinished ? (
          <button
            type="button"
            className="tool-call-show-btn"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        ) : (
          <span className="tool-call-status">
            {toolCall.status === 'running' ? 'Running' : 'Pending'}
          </span>
        )}
      </div>

      {toolCall.status === 'running' && (
        <div className="tool-call-input-summary">
          {summarizeInput(toolCall.input)}
        </div>
      )}

      {isFinished && expanded && (
        <div className="tool-call-output">
          {hasError ? (
            <>
              <pre className="tool-call-output-preview tool-call-error-content">
                {showFullError || !isLongError
                  ? errorText
                  : errorLines.slice(0, 3).join('\n') + (errorText.length > 200 ? '...' : '')}
              </pre>
              {isLongError && (
                <button
                  type="button"
                  className="tool-call-toggle"
                  onClick={() => setShowFullError(!showFullError)}
                >
                  {showFullError ? 'Show less' : 'Show full error'}
                </button>
              )}
            </>
          ) : hasResult ? (
            <>
              <pre className="tool-call-output-preview">
                {showFullOutput ? formatJson(toolCall.result) : formatResultPreview(toolCall.result, 8)}
              </pre>
              {formatJson(toolCall.result).split('\n').length > 8 && (
                <button
                  type="button"
                  className="tool-call-toggle"
                  onClick={() => setShowFullOutput(!showFullOutput)}
                >
                  {showFullOutput ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          ) : (
            <div className="tool-call-success">Completed successfully</div>
          )}
        </div>
      )}
    </div>
  )
}

export const ToolCallDisplay: FC<ToolCallDisplayProps> = ({ toolCall }) => {
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
      <ToolCallContent toolCall={toolCall} />
    </ErrorBoundary>
  )
}
