import { useRef, useCallback, type FC, type ChangeEvent } from 'react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface AttachmentFile {
  id: string
  file: File
  dataUrl: string
  type: 'image' | 'file'
  mediaType: string
}

interface FileAttachmentProps {
  onFilesSelected: (files: AttachmentFile[]) => void
  disabled?: boolean
  accept?: string
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getFileType(file: File): 'image' | 'file' {
  if (file.type.startsWith('image/')) return 'image'
  return 'file'
}

function generateId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export const FileAttachment: FC<FileAttachmentProps> = ({
  onFilesSelected,
  disabled = false,
  accept = 'image/*,application/pdf,.pdf',
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
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
        console.warn('[FileAttachment] Errors:', errors)
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
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />
      <button
        type="button"
        className="attachment-button"
        onClick={handleClick}
        disabled={disabled}
        title="Attach files"
        aria-label="Attach files"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    </>
  )
}

export { fileToDataUrl, getFileType, generateId, MAX_FILE_SIZE }
