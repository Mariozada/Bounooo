import { type FC, useMemo, useState } from 'react'
import * as m from 'motion/react-m'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, RefreshCw, Square } from 'lucide-react'
import { MarkdownMessage } from '../MarkdownMessage'
import { ToolCallDisplay } from '../ToolCallDisplay'
import { getSummaryLabel } from '../ToolCallDisplay/helpers'
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

// A rendered block is either a text segment or a group of consecutive tool calls
type RenderedBlock =
  | { type: 'text'; segment: AssistantMessageSegment & { type: 'text' } }
  | { type: 'tool_group'; toolCallIds: string[]; anchorId: string }

function getGroupSummary(tools: ToolCallInfo[]) {
  const running = tools.filter((tc) => tc.status === 'running').length
  const pending = tools.filter((tc) => tc.status === 'pending').length
  const errors = tools.filter((tc) => tc.status === 'error').length
  const hasActive = running > 0 || pending > 0

  const dotStatus = hasActive
    ? (running > 0 ? 'running' : 'pending')
    : (errors > 0 ? 'error' : 'completed')

  // Pick the most relevant tool to describe: running > pending > last
  const displayTool = tools.find((tc) => tc.status === 'running')
    || tools.find((tc) => tc.status === 'pending')
    || tools[tools.length - 1]
  const desc = getSummaryLabel(displayTool.name, displayTool.input)
  const label = tools.length === 1 ? desc : `${tools.length} tools · ${desc}`

  return { dotStatus, label, errors }
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

  // Group consecutive tool_call segments into blocks
  const renderedBlocks = useMemo<RenderedBlock[]>(() => {
    const blocks: RenderedBlock[] = []
    let currentGroup: { toolCallIds: string[]; anchorId: string } | null = null

    for (const segment of orderedSegments) {
      if (segment.type === 'tool_call') {
        if (!toolCallsById.has(segment.toolCallId)) continue
        if (currentGroup) {
          currentGroup.toolCallIds.push(segment.toolCallId)
        } else {
          currentGroup = { toolCallIds: [segment.toolCallId], anchorId: segment.id }
        }
      } else {
        if (currentGroup) {
          blocks.push({ type: 'tool_group', ...currentGroup })
          currentGroup = null
        }
        blocks.push({ type: 'text', segment: segment as AssistantMessageSegment & { type: 'text' } })
      }
    }
    if (currentGroup) {
      blocks.push({ type: 'tool_group', ...currentGroup })
    }
    return blocks
  }, [orderedSegments, toolCallsById])

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set())
  // Track which tool index is selected per group
  const [selectedIndexByGroup, setSelectedIndexByGroup] = useState<Map<string, number>>(new Map())

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
        {renderedBlocks.map((block) => {
          if (block.type === 'text') {
            if (!block.segment.text) return null
            return (
              <MarkdownMessage
                key={block.segment.id}
                content={block.segment.text}
                isStreaming={isStreaming && block.segment.id === lastTextSegmentId}
              />
            )
          }

          // Resolve tool calls for this group
          const groupTools = block.toolCallIds
            .map((id) => toolCallsById.get(id))
            .filter((tc): tc is ToolCallInfo => tc !== undefined)
          if (groupTools.length === 0) return null

          const isExpanded = expandedGroupIds.has(block.anchorId)
          const { dotStatus, label, errors } = getGroupSummary(groupTools)

          // Selected tool index for this group (default to latest active or last)
          let selectedIdx = selectedIndexByGroup.get(block.anchorId) ?? -1
          if (selectedIdx === -1 || selectedIdx >= groupTools.length) {
            // Auto-select: prefer running, then pending, then last
            selectedIdx = groupTools.findIndex((tc) => tc.status === 'running')
            if (selectedIdx === -1) selectedIdx = groupTools.findIndex((tc) => tc.status === 'pending')
            if (selectedIdx === -1) selectedIdx = groupTools.length - 1
          }
          const selectedTool = groupTools[selectedIdx]

          return (
            <div key={block.anchorId} className="message-tool-calls">
              <button
                type="button"
                className="tool-strip-collapsed"
                onClick={() => setExpandedGroupIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(block.anchorId)) {
                    next.delete(block.anchorId)
                  } else {
                    next.add(block.anchorId)
                  }
                  return next
                })}
                aria-expanded={isExpanded}
              >
                <span className="tool-strip-collapsed-main">
                  <span className={`tool-strip-chip-dot tool-strip-chip-dot--${dotStatus}`} />
                  <span className="tool-strip-collapsed-text">{label}</span>
                </span>
                <span className="tool-strip-collapsed-right">
                  {errors > 0 && (
                    <span className="tool-strip-collapsed-badge tool-strip-collapsed-badge--error">
                      {errors}
                    </span>
                  )}
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {isExpanded && (
                <div className="tool-strip-expanded">
                  {groupTools.length > 1 && (
                    <div className="tool-strip-nav">
                      <button
                        type="button"
                        className="tool-strip-nav-btn"
                        disabled={selectedIdx === 0}
                        onClick={() => setSelectedIndexByGroup((prev) => {
                          const next = new Map(prev)
                          next.set(block.anchorId, Math.max(0, selectedIdx - 1))
                          return next
                        })}
                        aria-label="Previous tool"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="tool-strip-nav-label">
                        {selectedIdx + 1} / {groupTools.length}
                      </span>
                      <button
                        type="button"
                        className="tool-strip-nav-btn"
                        disabled={selectedIdx === groupTools.length - 1}
                        onClick={() => setSelectedIndexByGroup((prev) => {
                          const next = new Map(prev)
                          next.set(block.anchorId, Math.min(groupTools.length - 1, selectedIdx + 1))
                          return next
                        })}
                        aria-label="Next tool"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                  <ToolCallDisplay toolCall={selectedTool} defaultExpanded />
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
