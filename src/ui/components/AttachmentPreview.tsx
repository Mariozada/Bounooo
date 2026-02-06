import { type FC, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react'
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
  onImageClick?: (attachment: AttachmentFile) => void
}

// Image Lightbox Component
interface ImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5]

const ImageLightbox: FC<ImageLightboxProps> = ({ src, alt, onClose }) => {
  const [zoomIndex, setZoomIndex] = useState(3) // Start at 100% (index 3)
  const imageRef = useRef<HTMLImageElement>(null)

  const zoom = ZOOM_LEVELS[zoomIndex]

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') {
        setZoomIndex(i => Math.min(i + 1, ZOOM_LEVELS.length - 1))
      }
      if (e.key === '-') {
        setZoomIndex(i => Math.max(i - 1, 0))
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setZoomIndex(i => Math.min(i + 1, ZOOM_LEVELS.length - 1))
  }, [])

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setZoomIndex(i => Math.max(i - 1, 0))
  }, [])

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.href = src
    link.download = alt || 'image.png'
    link.click()
  }, [src, alt])

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }, [onClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div className="image-lightbox-overlay" onClick={handleBackdropClick}>
      <div className="image-lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out (-)"
          disabled={zoomIndex === 0}
        >
          <ZoomOut size={20} />
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in (+)"
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
        >
          <ZoomIn size={20} />
        </button>
        <button type="button" onClick={handleDownload} title="Download">
          <Download size={20} />
        </button>
        <button type="button" onClick={handleClose} title="Close (Esc)" className="close-btn">
          <X size={20} />
        </button>
      </div>
      <div className="image-lightbox-content" onClick={handleBackdropClick}>
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className="image-lightbox-image"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
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

const AttachmentItem: FC<AttachmentItemProps> = ({ attachment, onRemove, editable = true, onImageClick }) => {
  const handleClick = useCallback(() => {
    if (attachment.type === 'image' && onImageClick) {
      onImageClick(attachment)
    }
  }, [attachment, onImageClick])

  const preview = useMemo(() => {
    if (attachment.type === 'image') {
      return (
        <img
          src={attachment.dataUrl}
          alt={attachment.file.name}
          className={`attachment-preview-image ${onImageClick ? 'clickable' : ''}`}
          onClick={handleClick}
          title="Click to view full size"
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
  }, [attachment, handleClick, onImageClick])

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
  const [lightboxImage, setLightboxImage] = useState<AttachmentFile | null>(null)

  const handleImageClick = useCallback((attachment: AttachmentFile) => {
    setLightboxImage(attachment)
  }, [])

  const handleCloseLightbox = useCallback(() => {
    setLightboxImage(null)
  }, [])

  if (attachments.length === 0) return null

  return (
    <>
      <div className="attachment-preview-container">
        {attachments.map(attachment => (
          <AttachmentItem
            key={attachment.id}
            attachment={attachment}
            onRemove={() => onRemove(attachment.id)}
            editable={editable}
            onImageClick={handleImageClick}
          />
        ))}
      </div>
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.dataUrl}
          alt={lightboxImage.file.name}
          onClose={handleCloseLightbox}
        />
      )}
    </>
  )
}

// For displaying attachments in message history (non-editable)
export const MessageAttachments: FC<{ attachments: AttachmentFile[] }> = ({ attachments }) => {
  const [lightboxImage, setLightboxImage] = useState<AttachmentFile | null>(null)

  const handleImageClick = useCallback((attachment: AttachmentFile) => {
    setLightboxImage(attachment)
  }, [])

  const handleCloseLightbox = useCallback(() => {
    setLightboxImage(null)
  }, [])

  if (attachments.length === 0) return null

  return (
    <>
      <div className="message-attachments">
        {attachments.map(attachment => (
          <AttachmentItem
            key={attachment.id}
            attachment={attachment}
            editable={false}
            onImageClick={handleImageClick}
          />
        ))}
      </div>
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.dataUrl}
          alt={lightboxImage.file.name}
          onClose={handleCloseLightbox}
        />
      )}
    </>
  )
}
