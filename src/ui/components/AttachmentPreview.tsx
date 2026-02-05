import { type FC, useMemo } from 'react'
import type { AttachmentFile } from './FileAttachment'

interface AttachmentPreviewProps {
  attachments: AttachmentFile[]
  onRemove: (id: string) => void
  editable?: boolean
}

interface AttachmentItemProps {
  attachment: AttachmentFile
  onRemove?: () => void
  editable?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mediaType: string): JSX.Element {
  if (mediaType === 'application/pdf') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

const AttachmentItem: FC<AttachmentItemProps> = ({ attachment, onRemove, editable = true }) => {
  const preview = useMemo(() => {
    if (attachment.type === 'image') {
      return (
        <img
          src={attachment.dataUrl}
          alt={attachment.file.name}
          className="attachment-preview-image"
        />
      )
    }

    return (
      <div className="attachment-preview-file">
        {getFileIcon(attachment.mediaType)}
        <span className="attachment-file-name">{attachment.file.name}</span>
        <span className="attachment-file-size">{formatFileSize(attachment.file.size)}</span>
      </div>
    )
  }, [attachment])

  return (
    <div className={`attachment-item attachment-item-${attachment.type}`}>
      {preview}
      {editable && onRemove && (
        <button
          type="button"
          className="attachment-remove"
          onClick={onRemove}
          title="Remove attachment"
          aria-label="Remove attachment"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

export const AttachmentPreview: FC<AttachmentPreviewProps> = ({
  attachments,
  onRemove,
  editable = true,
}) => {
  if (attachments.length === 0) return null

  return (
    <div className="attachment-preview-container">
      {attachments.map(attachment => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          onRemove={() => onRemove(attachment.id)}
          editable={editable}
        />
      ))}
    </div>
  )
}

// For displaying attachments in message history (non-editable)
export const MessageAttachments: FC<{ attachments: AttachmentFile[] }> = ({ attachments }) => {
  if (attachments.length === 0) return null

  return (
    <div className="message-attachments">
      {attachments.map(attachment => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          editable={false}
        />
      ))}
    </div>
  )
}
