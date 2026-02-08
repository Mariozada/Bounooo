import {
  type FC,
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useEffect,
  useCallback,
} from 'react'
import { ArrowUp, Brain, Square, Trash2, X } from 'lucide-react'
import { ComposerMenu } from '../ComposerMenu'
import { AttachmentPreview } from '../AttachmentPreview'
import type { AttachmentFile } from '../FileAttachment'

interface QueuedMessagePreview {
  id: string
  preview: string
  attachmentCount: number
}

interface MessageComposerProps {
  inputValue: string
  attachments: AttachmentFile[]
  isStreaming: boolean
  isDisabled: boolean
  pendingAfterToolResult: number
  pendingAfterCompletion: number
  queuedAfterToolResult: QueuedMessagePreview[]
  queuedAfterCompletion: QueuedMessagePreview[]
  showReasoningToggle: boolean
  reasoningEnabled: boolean
  tabId: number
  placeholder?: string
  onInputChange: (value: string) => void
  onAttachmentsChange: (attachments: AttachmentFile[]) => void
  onSubmit: () => void
  onQueueAfterToolResult: () => void
  onQueueAfterCompletion: () => void
  onRemoveQueuedAfterToolResult: (id: string) => void
  onRemoveQueuedAfterCompletion: (id: string) => void
  onClearQueuedAfterToolResult: () => void
  onClearQueuedAfterCompletion: () => void
  onStop: () => void
  onToggleReasoning: () => void
  onCreateShortcut?: () => void
}

export const MessageComposer: FC<MessageComposerProps> = ({
  inputValue,
  attachments,
  isStreaming,
  isDisabled,
  pendingAfterToolResult,
  pendingAfterCompletion,
  queuedAfterToolResult,
  queuedAfterCompletion,
  showReasoningToggle,
  reasoningEnabled,
  tabId,
  placeholder,
  onInputChange,
  onAttachmentsChange,
  onSubmit,
  onQueueAfterToolResult,
  onQueueAfterCompletion,
  onRemoveQueuedAfterToolResult,
  onRemoveQueuedAfterCompletion,
  onClearQueuedAfterToolResult,
  onClearQueuedAfterCompletion,
  onStop,
  onToggleReasoning,
  onCreateShortcut,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [inputValue, resizeTextarea])

  const hasDraft = (inputValue.trim() || attachments.length > 0) && !isDisabled
  const canSend = !isStreaming && hasDraft
  const canQueue = isStreaming && hasDraft

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (isStreaming) {
        if (canQueue) {
          onQueueAfterToolResult()
        }
        return
      }
      if (canSend) {
        onSubmit()
      }
    },
    [canQueue, canSend, isStreaming, onQueueAfterToolResult, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (isStreaming) {
          if (!canQueue) {
            return
          }
          if (e.ctrlKey || e.metaKey) {
            onQueueAfterCompletion()
          } else {
            onQueueAfterToolResult()
          }
          return
        }

        if (canSend) {
          onSubmit()
        }
      }
    },
    [canQueue, canSend, isStreaming, onQueueAfterCompletion, onQueueAfterToolResult, onSubmit]
  )

  const handleFilesSelected = useCallback(
    (files: AttachmentFile[]) => {
      onAttachmentsChange([...attachments, ...files])
    },
    [attachments, onAttachmentsChange]
  )

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      onAttachmentsChange(attachments.filter((a) => a.id !== id))
    },
    [attachments, onAttachmentsChange]
  )

  const defaultPlaceholder = isDisabled
    ? 'Configure your API key to start...'
    : isStreaming
      ? 'Agent is working... type your next message'
      : 'Send a message...'
  const hasQueuedMessages = pendingAfterToolResult > 0 || pendingAfterCompletion > 0

  return (
    <form className="aui-composer-wrapper" onSubmit={handleSubmit}>
      {attachments.length > 0 && (
        <AttachmentPreview
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />
      )}
      <div className="aui-composer-root">
        <textarea
          ref={textareaRef}
          className="aui-composer-input"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          disabled={isDisabled}
          rows={1}
          aria-label="Message input"
        />
        <div className="aui-composer-action-wrapper">
          <div className="aui-composer-actions-left">
            <ComposerMenu
              onFilesSelected={handleFilesSelected}
              disabled={isDisabled}
              tabId={tabId}
              onCreateShortcut={onCreateShortcut}
            />
            {showReasoningToggle && (
              <button
                type="button"
                className={`reasoning-btn ${reasoningEnabled ? 'active' : ''}`}
                onClick={onToggleReasoning}
                title={reasoningEnabled ? 'Reasoning enabled' : 'Reasoning disabled'}
              >
                <Brain size={16} />
              </button>
            )}
          </div>
          {isStreaming ? (
            <div className="aui-composer-stream-actions">
              <button
                type="button"
                className="aui-composer-send"
                onClick={onQueueAfterToolResult}
                disabled={!canQueue}
                aria-label="Queue after next tool result"
                title="Queue after next tool result (Enter)"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="aui-composer-cancel"
                onClick={(e) => {
                  e.stopPropagation()
                  onStop()
                }}
                aria-label="Stop generation"
              >
                <Square size={14} />
              </button>
            </div>
          ) : (
            <button
              type="submit"
              className="aui-composer-send"
              disabled={!canSend}
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        {isStreaming && (
          <div className="aui-composer-queue-bar" role="status" aria-live="polite">
            <button
              type="button"
              className="aui-composer-queue-chip aui-composer-queue-chip--primary"
              onClick={onQueueAfterToolResult}
              disabled={!canQueue}
              aria-label="Queue after next tool result"
              title="Queue after next tool result (Enter)"
            >
              Next
              {pendingAfterToolResult > 0 && (
                <span className="aui-composer-queue-count">{pendingAfterToolResult}</span>
              )}
            </button>
            <button
              type="button"
              className="aui-composer-queue-chip"
              onClick={onQueueAfterCompletion}
              disabled={!canQueue}
              aria-label="Queue after full completion"
              title="Queue after full completion (Ctrl+Enter)"
            >
              Done
              {pendingAfterCompletion > 0 && (
                <span className="aui-composer-queue-count">{pendingAfterCompletion}</span>
              )}
            </button>
          </div>
        )}
        {isStreaming && hasQueuedMessages && (
          <div className="aui-composer-queue-list">
            {queuedAfterToolResult.length > 0 && (
              <div className="aui-composer-queue-group">
                <div className="aui-composer-queue-group-head">
                  <span className="aui-composer-queue-group-label">Next</span>
                  <button
                    type="button"
                    className="aui-composer-queue-clear-btn"
                    onClick={onClearQueuedAfterToolResult}
                    aria-label="Clear next queue"
                    title="Clear queue"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="aui-composer-queue-items">
                  {queuedAfterToolResult.map((item) => (
                    <span key={item.id} className="aui-composer-queue-item">
                      <span className="aui-composer-queue-item-text">
                        {item.preview}
                        {item.attachmentCount > 0 && ` (+${item.attachmentCount} attachment${item.attachmentCount > 1 ? 's' : ''})`}
                      </span>
                      <button
                        type="button"
                        className="aui-composer-queue-item-remove"
                        onClick={() => onRemoveQueuedAfterToolResult(item.id)}
                        aria-label="Remove queued message"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {queuedAfterCompletion.length > 0 && (
              <div className="aui-composer-queue-group">
                <div className="aui-composer-queue-group-head">
                  <span className="aui-composer-queue-group-label">Done</span>
                  <button
                    type="button"
                    className="aui-composer-queue-clear-btn"
                    onClick={onClearQueuedAfterCompletion}
                    aria-label="Clear completion queue"
                    title="Clear queue"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="aui-composer-queue-items">
                  {queuedAfterCompletion.map((item) => (
                    <span key={item.id} className="aui-composer-queue-item">
                      <span className="aui-composer-queue-item-text">
                        {item.preview}
                        {item.attachmentCount > 0 && ` (+${item.attachmentCount} attachment${item.attachmentCount > 1 ? 's' : ''})`}
                      </span>
                      <button
                        type="button"
                        className="aui-composer-queue-item-remove"
                        onClick={() => onRemoveQueuedAfterCompletion(item.id)}
                        aria-label="Remove queued message"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
