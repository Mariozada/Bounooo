import { type FC, useMemo, useState, useEffect, useCallback, type KeyboardEvent } from 'react'
import * as m from 'motion/react-m'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, RefreshCw, Sparkles, Square } from 'lucide-react'
import { MarkdownMessage } from '../MarkdownMessage'
import { ToolCallDisplay } from '../ToolCallDisplay'
import { formatToolName } from '../ToolCallDisplay/helpers'
import { TooltipIconButton } from '../TooltipIconButton'
import { ThinkingBlock } from '../ThinkingBlock'
import type { ToolCallInfo, AssistantMessageSegment } from '@agent/index'

interface AssistantMessageProps {
  id: string
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  assistantSegments?: AssistantMessageSegment[]
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
  assistantSegments,
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
  const toolCallsById = useMemo(
    () => new Map((toolCalls || []).map((tc) => [tc.id, tc])),
    [toolCalls]
  )
  const orderedSegments = useMemo(() => {
    if (assistantSegments && assistantSegments.length > 0) {
      return assistantSegments
    }

    const fallback: AssistantMessageSegment[] = []
    if (hasContent) {
      fallback.push({
        type: 'text',
        id: 'fallback_text',
        text: content,
      })
    }

    for (const tc of toolCalls || []) {
      fallback.push({
        type: 'tool_call',
        id: `fallback_tool_${tc.id}`,
        toolCallId: tc.id,
      })
    }

    return fallback
  }, [assistantSegments, hasContent, content, toolCalls])
  const lastTextSegmentId = useMemo(() => {
    for (let i = orderedSegments.length - 1; i >= 0; i--) {
      if (orderedSegments[i].type === 'text') {
        return orderedSegments[i].id
      }
    }
    return null
  }, [orderedSegments])
  const orderedToolCallIds = useMemo(() => {
    const seen = new Set<string>()
    const ids: string[] = []

    for (const segment of orderedSegments) {
      if (segment.type !== 'tool_call') continue
      if (seen.has(segment.toolCallId)) continue
      if (!toolCallsById.has(segment.toolCallId)) continue
      seen.add(segment.toolCallId)
      ids.push(segment.toolCallId)
    }

    if (ids.length === 0 && toolCalls) {
      for (const toolCall of toolCalls) {
        if (seen.has(toolCall.id)) continue
        seen.add(toolCall.id)
        ids.push(toolCall.id)
      }
    }

    return ids
  }, [orderedSegments, toolCalls, toolCallsById])
  const orderedToolCalls = useMemo(
    () =>
      orderedToolCallIds
        .map((toolCallId) => toolCallsById.get(toolCallId))
        .filter((toolCall): toolCall is ToolCallInfo => toolCall !== undefined),
    [orderedToolCallIds, toolCallsById]
  )
  const firstToolSegmentId = useMemo(() => {
    for (const segment of orderedSegments) {
      if (segment.type === 'tool_call') {
        return segment.id
      }
    }
    return null
  }, [orderedSegments])
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)

  const runningToolCount = useMemo(
    () => orderedToolCalls.filter((toolCall) => toolCall.status === 'running').length,
    [orderedToolCalls]
  )
  const pendingToolCount = useMemo(
    () => orderedToolCalls.filter((toolCall) => toolCall.status === 'pending').length,
    [orderedToolCalls]
  )
  const completedToolCount = useMemo(
    () => orderedToolCalls.filter((toolCall) => toolCall.status === 'completed').length,
    [orderedToolCalls]
  )
  const errorToolCount = useMemo(
    () => orderedToolCalls.filter((toolCall) => toolCall.status === 'error').length,
    [orderedToolCalls]
  )
  const hasActiveTools = runningToolCount > 0 || pendingToolCount > 0
  const toolSummaryText = useMemo(() => {
    if (hasActiveTools) {
      if (runningToolCount > 0 && pendingToolCount > 0) {
        return `${runningToolCount} running · ${pendingToolCount} pending`
      }
      if (runningToolCount > 0) {
        return `${runningToolCount} running`
      }
      return `${pendingToolCount} pending`
    }

    if (errorToolCount > 0 && completedToolCount > 0) {
      return `${completedToolCount} done · ${errorToolCount} failed`
    }
    if (errorToolCount > 0) {
      return `${errorToolCount} failed`
    }
    return `${completedToolCount} completed`
  }, [completedToolCount, errorToolCount, hasActiveTools, pendingToolCount, runningToolCount])

  useEffect(() => {
    if (orderedToolCalls.length === 0) {
      setSelectedToolCallId(null)
      setToolsExpanded(false)
      return
    }

    if (selectedToolCallId && orderedToolCalls.some((toolCall) => toolCall.id === selectedToolCallId)) {
      return
    }

    let preferredIndex = orderedToolCalls.length - 1
    for (let i = orderedToolCalls.length - 1; i >= 0; i--) {
      const status = orderedToolCalls[i].status
      if (status === 'running' || status === 'pending') {
        preferredIndex = i
        break
      }
    }

    setSelectedToolCallId(orderedToolCalls[preferredIndex].id)
  }, [orderedToolCalls, selectedToolCallId])

  const selectedToolIndex = useMemo(() => {
    if (!selectedToolCallId) return -1
    return orderedToolCalls.findIndex((toolCall) => toolCall.id === selectedToolCallId)
  }, [orderedToolCalls, selectedToolCallId])

  const selectedToolCall = useMemo(() => {
    if (orderedToolCalls.length === 0) return null
    if (selectedToolIndex === -1) return orderedToolCalls[orderedToolCalls.length - 1]
    return orderedToolCalls[selectedToolIndex]
  }, [orderedToolCalls, selectedToolIndex])

  const moveToolSelection = useCallback(
    (direction: -1 | 1) => {
      if (orderedToolCalls.length === 0) return
      const startIndex = selectedToolIndex === -1 ? orderedToolCalls.length - 1 : selectedToolIndex
      const nextIndex = (startIndex + direction + orderedToolCalls.length) % orderedToolCalls.length
      setSelectedToolCallId(orderedToolCalls[nextIndex].id)
    },
    [orderedToolCalls, selectedToolIndex]
  )

  const handleToolRailKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveToolSelection(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        moveToolSelection(1)
      }
    },
    [moveToolSelection]
  )

  const isEmptyAssistant = orderedSegments.length === 0
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
        {orderedSegments.map((segment) => {
          if (segment.type === 'text') {
            if (!segment.text) return null
            return (
              <MarkdownMessage
                key={segment.id}
                content={segment.text}
                isStreaming={isStreaming && segment.id === lastTextSegmentId}
              />
            )
          }

          const toolCall = toolCallsById.get(segment.toolCallId)
          if (!toolCall) return null

          if (segment.id !== firstToolSegmentId) {
            return null
          }

          const selectedIndexDisplay = selectedToolCall
            ? Math.max(orderedToolCalls.findIndex((item) => item.id === selectedToolCall.id), 0) + 1
            : 0

          return (
            <div key={segment.id} className="message-tool-calls">
              <button
                type="button"
                className="tool-strip-collapsed"
                onClick={() => setToolsExpanded((prev) => !prev)}
                aria-expanded={toolsExpanded}
                aria-label={toolsExpanded ? 'Collapse tool details' : 'Expand tool details'}
              >
                <span className="tool-strip-collapsed-main">
                  <Sparkles
                    size={14}
                    className={`tool-strip-collapsed-icon${hasActiveTools ? ' is-active' : ''}`}
                  />
                  <span className="tool-strip-collapsed-text">
                    Tool Activity · {toolSummaryText}
                  </span>
                </span>
                <span className="tool-strip-collapsed-right">
                  {errorToolCount > 0 && (
                    <span className="tool-strip-collapsed-badge tool-strip-collapsed-badge--error">
                      {errorToolCount}
                    </span>
                  )}
                  {hasActiveTools && (
                    <span className="tool-strip-collapsed-badge tool-strip-collapsed-badge--active">
                      {runningToolCount + pendingToolCount}
                    </span>
                  )}
                  {toolsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {toolsExpanded && (
                <div
                  className="tool-strip"
                  tabIndex={0}
                  role="group"
                  aria-label="Tool calls"
                  onKeyDown={handleToolRailKeyDown}
                >
                  <div className="tool-strip-header">
                    <div className="tool-strip-title-wrap">
                      <span className="tool-strip-title">Tool Calls</span>
                      <span className="tool-strip-help">Use ← → to switch</span>
                    </div>
                    <div className="tool-strip-nav">
                      <button
                        type="button"
                        className="tool-strip-nav-btn"
                        onClick={() => moveToolSelection(-1)}
                        aria-label="Previous tool call"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="tool-strip-index">{selectedIndexDisplay}/{orderedToolCalls.length}</span>
                      <button
                        type="button"
                        className="tool-strip-nav-btn"
                        onClick={() => moveToolSelection(1)}
                        aria-label="Next tool call"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="tool-strip-row" role="tablist" aria-label="Tool call list">
                    {orderedToolCalls.map((toolItem) => {
                      const selected = selectedToolCall?.id === toolItem.id
                      return (
                        <button
                          key={toolItem.id}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          className={`tool-strip-chip tool-strip-chip--${toolItem.status}${selected ? ' is-selected' : ''}`}
                          onClick={() => setSelectedToolCallId(toolItem.id)}
                          title={formatToolName(toolItem.name)}
                        >
                          <span className={`tool-strip-chip-dot tool-strip-chip-dot--${toolItem.status}`} />
                          <span className="tool-strip-chip-label">{formatToolName(toolItem.name)}</span>
                        </button>
                      )
                    })}
                  </div>

                  {selectedToolCall && (
                    <div className="tool-strip-detail">
                      <ToolCallDisplay
                        toolCall={selectedToolCall}
                        defaultExpanded
                        showHeader={false}
                        allowCollapse={false}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
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
