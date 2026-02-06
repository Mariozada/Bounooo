import { type FC, useRef, useEffect } from 'react'
import * as m from 'motion/react-m'
import { Pencil } from 'lucide-react'
import { MessageAttachments } from '../AttachmentPreview'
import { BranchPicker } from '../BranchPicker'
import type { AttachmentFile } from '../FileAttachment'

interface UserMessageProps {
  id: string
  content: string
  attachments?: AttachmentFile[]
  siblingCount?: number
  siblingIndex?: number
  isHovered: boolean
  isEditing: boolean
  editContent: string
  isStreaming: boolean
  canEdit: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
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
  isEditing,
  editContent,
  isStreaming,
  canEdit,
  onMouseEnter,
  onMouseLeave,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onEditContentChange,
  onNavigateBranch,
}) => {
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const hasBranches = siblingCount > 1
  const canShowBranchPicker = hasBranches && !isStreaming

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
            {isHovered && !isStreaming && canEdit && (
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
