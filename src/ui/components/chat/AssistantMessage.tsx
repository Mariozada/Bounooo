import { type FC, useMemo, useState, useEffect, useCallback, type KeyboardEvent } from 'react'
import * as m from 'motion/react-m'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, RefreshCw, Square } from 'lucide-react'
import { MarkdownMessage } from '../MarkdownMessage'
import { ToolCallDisplay } from '../ToolCallDisplay'
import { getSummaryLabel } from '../ToolCallDisplay/helpers'
import { TooltipIconButton } from '../TooltipIconButton'
import { ThinkingBlock } from '../ThinkingBlock'
import type { ToolCallInfo, AssistantMessageSegment } from '@agent/index'

// ─── Tool Group Panel ─────────────────────────────────────────────────────────

interface ToolGroupPanelProps {
  toolCalls: ToolCallInfo[]
}

const ToolGroupPanel: FC<ToolGroupPanelProps> = ({ toolCalls }) => {
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)

  const runningToolCount = useMemo(
    () => toolCalls.filter((tc) => tc.status === 'running').length,
    [toolCalls]
  )
  const pendingToolCount = useMemo(
    () => toolCalls.filter((tc) => tc.status === 'pending').length,
    [toolCalls]
  )
  const errorToolCount = useMemo(
    () => toolCalls.filter((tc) => tc.status === 'error').length,
    [toolCalls]
  )
  const hasActiveTools = runningToolCount > 0 || pendingToolCount > 0

  useEffect(() => {
    if (toolCalls.length === 0) {
      setSelectedToolCallId(null)
      setToolsExpanded(false)
      return
    }

    if (selectedToolCallId && toolCalls.some((tc) => tc.id === selectedToolCallId)) {
      return
    }

    let preferredIndex = toolCalls.length - 1
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const status = toolCalls[i].status
      if (status === 'running' || status === 'pending') {
        preferredIndex = i
        break
      }
    }

    setSelectedToolCallId(toolCalls[preferredIndex].id)
  }, [toolCalls, selectedToolCallId])

  const selectedToolIndex = useMemo(() => {
    if (!selectedToolCallId) return -1
    return toolCalls.findIndex((tc) => tc.id === selectedToolCallId)
  }, [toolCalls, selectedToolCallId])

  const selectedToolCall = useMemo(() => {
    if (toolCalls.length === 0) return null
    if (selectedToolIndex === -1) return toolCalls[toolCalls.length - 1]
    return toolCalls[selectedToolIndex]
  }, [toolCalls, selectedToolIndex])

  const moveToolSelection = useCallback(
    (direction: -1 | 1) => {
      if (toolCalls.length === 0) return
      const startIndex = selectedToolIndex === -1 ? toolCalls.length - 1 : selectedToolIndex
      const nextIndex = (startIndex + direction + toolCalls.length) % toolCalls.length
      setSelectedToolCallId(toolCalls[nextIndex].id)
    },
    [toolCalls, selectedToolIndex]
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

  const selectedIndexDisplay = selectedToolCall
    ? Math.max(toolCalls.findIndex((item) => item.id === selectedToolCall.id), 0) + 1
    : 0

  return (
    <div className="message-tool-calls">
      <button
        type="button"
        className="tool-strip-collapsed"
        onClick={() => setToolsExpanded((prev) => !prev)}
        aria-expanded={toolsExpanded}
        aria-label={toolsExpanded ? 'Collapse tool details' : 'Expand tool details'}
      >
        <span className="tool-strip-collapsed-main">
          <span className={`tool-strip-chip-dot tool-strip-chip-dot--${
            hasActiveTools
              ? (runningToolCount > 0 ? 'running' : 'pending')
              : (errorToolCount > 0 ? 'error' : 'completed')
          }`} />
          <span className="tool-strip-collapsed-text">
            {(() => {
              const displayTool = toolCalls.find((tc) => tc.status === 'running')
                || toolCalls.find((tc) => tc.status === 'pending')
                || toolCalls[toolCalls.length - 1]
              if (!displayTool) return ''
              const desc = getSummaryLabel(displayTool.name, displayTool.input, displayTool.status)
              return toolCalls.length === 1 ? desc : `${toolCalls.length} tools · ${desc}`
            })()}
          </span>
        </span>
        <span className="tool-strip-collapsed-right">
          {errorToolCount > 0 && (
            <span className="tool-strip-collapsed-badge tool-strip-collapsed-badge--error">
              {errorToolCount}
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
              <span className="tool-strip-index">{selectedIndexDisplay}/{toolCalls.length}</span>
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
            {toolCalls.map((toolItem) => {
              const selected = selectedToolCall?.id === toolItem.id
              return (
                <button
                  key={toolItem.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`tool-strip-chip tool-strip-chip--${toolItem.status}${selected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedToolCallId(toolItem.id)}
                  title={getSummaryLabel(toolItem.name, toolItem.input, toolItem.status)}
                >
                  <span className={`tool-strip-chip-dot tool-strip-chip-dot--${toolItem.status}`} />
                  <span className="tool-strip-chip-label">{getSummaryLabel(toolItem.name, toolItem.input, toolItem.status)}</span>
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
}

// ─── Assistant Message ────────────────────────────────────────────────────────

interface AssistantMessageProps {
  id: string
  content: string
  reasoning?: string
  error?: string
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
  error,
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
  const hasReasoning = Boolean(reasoning && reasoning.trim())
  const showThinkingBlock = hasReasoning || (isStreaming && !hasContent && !hasToolCalls)
  const toolCallsById = useMemo(
    () => new Map((toolCalls || []).map((tc) => [tc.id, tc])),
    [toolCalls]
  )
  const orderedSegments = useMemo(() => {
    if (assistantSegments && assistantSegments.length > 0) {
      // Filter out whitespace-only text segments (may exist in older stored messages)
      return assistantSegments.filter(
        (seg) => seg.type !== 'text' || seg.text?.trim()
      )
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

  // Group consecutive tool_call segments so each group gets its own panel
  const toolGroups = useMemo(() => {
    const groups: { firstSegmentId: string; toolCallIds: string[] }[] = []
    let currentGroup: { firstSegmentId: string; toolCallIds: string[] } | null = null
    const seen = new Set<string>()

    for (const segment of orderedSegments) {
      if (segment.type === 'tool_call') {
        if (seen.has(segment.toolCallId)) continue
        if (!toolCallsById.has(segment.toolCallId)) continue
        seen.add(segment.toolCallId)

        if (!currentGroup) {
          currentGroup = { firstSegmentId: segment.id, toolCallIds: [] }
          groups.push(currentGroup)
        }
        currentGroup.toolCallIds.push(segment.toolCallId)
      } else {
        currentGroup = null
      }
    }

    // Fallback when no segments matched but toolCalls exist
    if (groups.length === 0 && toolCalls && toolCalls.length > 0) {
      groups.push({
        firstSegmentId: `fallback_tool_${toolCalls[0].id}`,
        toolCallIds: toolCalls.map((tc) => tc.id),
      })
    }

    return groups
  }, [orderedSegments, toolCalls, toolCallsById])

  const toolGroupBySegmentId = useMemo(() => {
    const map = new Map<string, typeof toolGroups[number]>()
    for (const group of toolGroups) {
      map.set(group.firstSegmentId, group)
    }
    return map
  }, [toolGroups])

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
        {showThinkingBlock && (
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

          // Only render at the first segment of each tool group
          const group = toolGroupBySegmentId.get(segment.id)
          if (!group) return null

          const groupToolCalls = group.toolCallIds
            .map((id) => toolCallsById.get(id))
            .filter((tc): tc is ToolCallInfo => tc !== undefined)

          if (groupToolCalls.length === 0) return null

          return (
            <ToolGroupPanel
              key={segment.id}
              toolCalls={groupToolCalls}
            />
          )
        })}
        {isEmptyAssistant && !showThinkingBlock && isStreaming && (
          <div className="message-text message-loading">Thinking...</div>
        )}
        {isEmptyAssistant && !hasReasoning && !isStreaming && !error && (
          <div className="message-text message-error">(Empty response)</div>
        )}
        {error && !isStreaming && (
          <div className="message-text message-error">{error}</div>
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
