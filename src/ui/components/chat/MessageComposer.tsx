import {
  type FC,
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useEffect,
  useCallback,
} from 'react'
import { ArrowUp, Brain, Square } from 'lucide-react'
import { ComposerMenu } from '../ComposerMenu'
import { AttachmentPreview } from '../AttachmentPreview'
import type { AttachmentFile } from '../FileAttachment'

interface MessageComposerProps {
  inputValue: string
  attachments: AttachmentFile[]
  isStreaming: boolean
  isDisabled: boolean
  showReasoningToggle: boolean
  reasoningEnabled: boolean
  tabId: number
  placeholder?: string
  onInputChange: (value: string) => void
  onAttachmentsChange: (attachments: AttachmentFile[]) => void
  onSubmit: () => void
  onStop: () => void
  onToggleReasoning: () => void
  onCreateShortcut?: () => void
}

export const MessageComposer: FC<MessageComposerProps> = ({
  inputValue,
  attachments,
  isStreaming,
  isDisabled,
  showReasoningToggle,
  reasoningEnabled,
  tabId,
  placeholder,
  onInputChange,
  onAttachmentsChange,
  onSubmit,
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

  const canSend = !isStreaming && (inputValue.trim() || attachments.length > 0) && !isDisabled

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (canSend) {
        onSubmit()
      }
    },
    [canSend, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (canSend) {
          onSubmit()
        }
      }
    },
    [canSend, onSubmit]
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
      ? 'Agent is working... Type your next message'
      : 'Send a message...'

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
              disabled={isStreaming || isDisabled}
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
      </div>
    </form>
  )
}
