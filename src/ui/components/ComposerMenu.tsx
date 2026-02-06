import { useState, useRef, useEffect, useCallback, type FC } from 'react'
import { Plus, Paperclip, X } from 'lucide-react'
import { type AttachmentFile, fileToDataUrl, getFileType, generateId, MAX_FILE_SIZE } from './FileAttachment'

interface ComposerMenuProps {
  onFilesSelected: (files: AttachmentFile[]) => void
  disabled?: boolean
}

export const ComposerMenu: FC<ComposerMenuProps> = ({
  onFilesSelected,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
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
        className={`composer-menu-trigger ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        title="Add attachment"
        aria-label="Add attachment"
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={18} /> : <Plus size={18} />}
      </button>

      {isOpen && (
        <div className="composer-menu-dropdown">
          <button
            type="button"
            className="composer-menu-item"
            onClick={handleFileClick}
          >
            <Paperclip size={16} />
            <span>Attach file</span>
          </button>
          {/* Future options can be added here */}
        </div>
      )}
    </div>
  )
}
