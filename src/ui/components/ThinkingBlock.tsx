import { useState, type FC } from 'react'
import { ChevronDown, Brain } from 'lucide-react'
import { MarkdownMessage } from './MarkdownMessage'

interface ThinkingBlockProps {
  reasoning: string
  isStreaming?: boolean
}

export const ThinkingBlock: FC<ThinkingBlockProps> = ({ reasoning, isStreaming }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!reasoning && !isStreaming) return null

  const lineCount = reasoning.split('\n').length
  const charCount = reasoning.length

  return (
    <div className={`thinking-block ${isExpanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="thinking-block-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="thinking-block-title">
          <Brain size={14} className={isStreaming ? 'thinking-icon-pulse' : ''} />
          <span>{isStreaming ? 'Thinking...' : 'Thought process'}</span>
        </div>
        <div className="thinking-block-meta">
          {!isStreaming && (
            <span className="thinking-block-stats">
              {lineCount} lines, {charCount} chars
            </span>
          )}
          <ChevronDown
            size={14}
            className={`thinking-block-chevron ${isExpanded ? 'expanded' : ''}`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="thinking-block-content">
          {reasoning ? (
            <MarkdownMessage content={reasoning} isStreaming={isStreaming} />
          ) : (
            <p className="thinking-placeholder">Thinking...</p>
          )}
        </div>
      )}
    </div>
  )
}
