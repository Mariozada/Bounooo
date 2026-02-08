import { type FC, useRef, useEffect } from 'react'
import * as m from 'motion/react-m'
import { Check, Copy, Pencil } from 'lucide-react'
import { MessageAttachments } from '../AttachmentPreview'
import { BranchPicker } from '../BranchPicker'
import { TooltipIconButton } from '../TooltipIconButton'
import type { AttachmentFile } from '../FileAttachment'

interface UserMessageProps {
  id: string
  content: string
  attachments?: AttachmentFile[]
  siblingCount?: number
  siblingIndex?: number
  isHovered: boolean
  isCopied: boolean
  isEditing: boolean
  editContent: string
  isStreaming: boolean
  canEdit: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onCopy: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  onEditContentChange: (content: string) => void
  onNavigateBranch: (direction: 'prev' | 'next') => void
}

export const UserMessage: FC<UserMessageProps> = ({
  content,
  attachments,
  siblingCount = 1,
  siblingIndex = 0,
  isHovered,
  isCopied,
  isEditing,
  editContent,
  isStreaming,
  canEdit,
  onMouseEnter,
  onMouseLeave,
  onCopy,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onEditContentChange,
  onNavigateBranch,
}) => {
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const hasBranches = siblingCount > 1
  const canShowBranchPicker = hasBranches && !isStreaming
  const canShowEditButton = !isStreaming && canEdit
  const canShowActions = !isStreaming

  useEffect(() => {
    if (isEditing) {
      editTextareaRef.current?.focus()
    }
  }, [isEditing])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmitEdit()
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="aui-user-message-root"
      data-role="user"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isEditing ? (
        <div className="aui-user-message-edit">
          <textarea
            ref={editTextareaRef}
            className="aui-user-message-edit-textarea"
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
          />
          <div className="aui-user-message-edit-actions">
            <button
              type="button"
              className="aui-user-message-edit-cancel"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="aui-user-message-edit-submit"
              onClick={onSubmitEdit}
              disabled={!editContent.trim()}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="aui-user-message-content">
            {content && <div className="message-text">{content}</div>}
            {attachments && attachments.length > 0 && (
              <MessageAttachments attachments={attachments} />
            )}
            {canShowActions && (
              <div className={`aui-user-message-actions ${isHovered ? 'is-visible' : ''}`}>
                <TooltipIconButton
                  tooltip={isCopied ? 'Copied' : 'Copy'}
                  className="aui-user-message-copy-btn"
                  onClick={onCopy}
                  aria-label="Copy message"
                >
                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                </TooltipIconButton>
                {canShowEditButton && (
                  <button
                    type="button"
                    className="aui-user-message-edit-btn"
                    onClick={onStartEdit}
                    aria-label="Edit message"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          {canShowBranchPicker && (
            <BranchPicker
              currentIndex={siblingIndex}
              total={siblingCount}
              onPrev={() => onNavigateBranch('prev')}
              onNext={() => onNavigateBranch('next')}
              disabled={isStreaming}
            />
          )}
        </>
      )}
    </m.div>
  )
}
