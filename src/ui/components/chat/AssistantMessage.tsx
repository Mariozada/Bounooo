import { type FC } from 'react'
import * as m from 'motion/react-m'
import { Check, Copy, RefreshCw, Square } from 'lucide-react'
import { MarkdownMessage } from '../MarkdownMessage'
import { ToolCallDisplay } from '../ToolCallDisplay'
import { TooltipIconButton } from '../TooltipIconButton'
import { ThinkingBlock } from '../ThinkingBlock'
import type { ToolCallInfo } from '@agent/index'

interface AssistantMessageProps {
  id: string
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  isStreaming: boolean
  isLastMessage: boolean
  isHovered: boolean
  isCopied: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onCopy: () => void
  onRetry: () => void
  onStop: () => void
}

export const AssistantMessage: FC<AssistantMessageProps> = ({
  content,
  reasoning,
  toolCalls,
  isStreaming,
  isLastMessage,
  isHovered,
  isCopied,
  onMouseEnter,
  onMouseLeave,
  onCopy,
  onRetry,
  onStop,
}) => {
  const hasContent = content && content.trim().length > 0
  const hasToolCalls = toolCalls && toolCalls.length > 0
  const isEmptyAssistant = !hasContent && !hasToolCalls
  const showActionBar = isLastMessage || isHovered || isStreaming

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="aui-assistant-message-root"
      data-role="assistant"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="aui-assistant-message-content">
        {(reasoning || (isStreaming && !hasContent && !hasToolCalls)) && (
          <ThinkingBlock
            reasoning={reasoning || ''}
            isStreaming={isStreaming && !hasContent}
          />
        )}
        {hasContent && (
          <MarkdownMessage content={content} isStreaming={isStreaming} />
        )}
        {hasToolCalls && (
          <div className="message-tool-calls">
            {toolCalls!.map((tc) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {isEmptyAssistant && !reasoning && isStreaming && (
          <div className="message-text message-loading">Thinking...</div>
        )}
        {isEmptyAssistant && !reasoning && !isStreaming && (
          <div className="message-text message-error">(Empty response)</div>
        )}
      </div>
      <div
        className={`aui-assistant-action-bar-root ${showActionBar ? '' : 'aui-action-bar-hidden'} ${!isLastMessage ? 'aui-action-bar-floating' : ''}`}
      >
        <TooltipIconButton
          tooltip={isCopied ? 'Copied' : 'Copy'}
          onClick={onCopy}
        >
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Retry"
          onClick={onRetry}
          disabled={isStreaming}
        >
          <RefreshCw size={16} />
        </TooltipIconButton>
        {isStreaming && (
          <TooltipIconButton tooltip="Stop" onClick={onStop}>
            <Square size={14} />
          </TooltipIconButton>
        )}
      </div>
    </m.div>
  )
}
