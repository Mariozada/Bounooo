import { useState, useRef, useEffect, useCallback, type FC } from 'react'
import { Plus, Paperclip, X, Camera } from 'lucide-react'
import { MessageTypes } from '@shared/messages'
import { type AttachmentFile, fileToDataUrl, getFileType, generateId, MAX_FILE_SIZE } from './FileAttachment'

interface ComposerMenuProps {
  onFilesSelected: (files: AttachmentFile[]) => void
  disabled?: boolean
  tabId?: number
}

export const ComposerMenu: FC<ComposerMenuProps> = ({
  onFilesSelected,
  disabled = false,
  tabId,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev)
    }
  }, [disabled])

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click()
    setIsOpen(false)
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      const attachments: AttachmentFile[] = []
      const errors: string[] = []

      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name} exceeds 10MB limit`)
          continue
        }

        try {
          const dataUrl = await fileToDataUrl(file)
          attachments.push({
            id: generateId(),
            file,
            dataUrl,
            type: getFileType(file),
            mediaType: file.type,
          })
        } catch (err) {
          errors.push(`Failed to read ${file.name}`)
        }
      }

      if (errors.length > 0) {
        console.warn('[ComposerMenu] Errors:', errors)
      }

      if (attachments.length > 0) {
        onFilesSelected(attachments)
      }

      // Reset input to allow selecting same file again
      e.target.value = ''
    },
    [onFilesSelected]
  )

  const handleScreenshotClick = useCallback(async () => {
    console.log('[ComposerMenu] Screenshot clicked, tabId:', tabId)

    if (!tabId || tabId === 0) {
      console.warn('[ComposerMenu] No valid tabId available for screenshot')
      setIsOpen(false)
      return
    }

    setIsCapturing(true)
    setIsOpen(false)

    try {
      console.log('[ComposerMenu] Sending TAKE_SCREENSHOT request...')
      const response = await chrome.runtime.sendMessage({
        type: MessageTypes.TAKE_SCREENSHOT,
        tabId
      }) as { success: boolean; dataUrl?: string; error?: string }

      console.log('[ComposerMenu] Screenshot response:', response?.success, response?.error)

      if (response?.success && response.dataUrl) {
        // Convert dataUrl to a File object
        const res = await fetch(response.dataUrl)
        const blob = await res.blob()
        const file = new File([blob], `screenshot_${Date.now()}.png`, { type: 'image/png' })

        const attachment: AttachmentFile = {
          id: generateId(),
          file,
          dataUrl: response.dataUrl,
          type: 'image',
          mediaType: 'image/png',
        }

        console.log('[ComposerMenu] Created attachment:', attachment.id)
        onFilesSelected([attachment])
      } else {
        console.error('[ComposerMenu] Screenshot failed:', response?.error || 'Unknown error')
      }
    } catch (err) {
      console.error('[ComposerMenu] Screenshot error:', err)
    } finally {
      setIsCapturing(false)
    }
  }, [tabId, onFilesSelected])

  return (
    <div className="composer-menu" ref={menuRef}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      <button
        type="button"
        className={`composer-menu-trigger ${isOpen ? 'active' : ''} ${isCapturing ? 'capturing' : ''}`}
        onClick={handleToggle}
        disabled={disabled || isCapturing}
        title={isCapturing ? 'Taking screenshot...' : 'Add attachment'}
        aria-label={isCapturing ? 'Taking screenshot...' : 'Add attachment'}
        aria-expanded={isOpen}
      >
        {isCapturing ? (
          <span className="spinner" />
        ) : isOpen ? (
          <X size={18} />
        ) : (
          <Plus size={18} />
        )}
      </button>

      {isOpen && (
        <div className="composer-menu-dropdown">
          {tabId !== undefined && tabId > 0 && (
            <button
              type="button"
              className="composer-menu-item"
              onClick={handleScreenshotClick}
            >
              <Camera size={16} />
              <span>Take screenshot</span>
            </button>
          )}
          <button
            type="button"
            className="composer-menu-item"
            onClick={handleFileClick}
          >
            <Paperclip size={16} />
            <span>Attach file</span>
          </button>
        </div>
      )}
    </div>
  )
}
