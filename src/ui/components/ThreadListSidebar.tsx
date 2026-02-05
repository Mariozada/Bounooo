import { useState, useCallback, type FC } from 'react'
import {
  PanelLeft,
  Settings,
  Trash2,
  HardDrive,
  ChevronLeft,
} from 'lucide-react'
import { ThreadList } from './ThreadList'
import type { Thread } from '@storage/types'

interface ThreadListSidebarProps {
  threads: Thread[]
  currentThreadId: string | null
  isLoading: boolean
  isOpen: boolean
  onToggle: () => void
  onNewThread: () => void
  onSelectThread: (id: string) => void
  onArchiveThread: (id: string) => void
  onDeleteThread: (id: string) => void
  onRenameThread: (id: string, title: string) => void
  onDeleteAll: () => void
  onOpenSettings: () => void
  storageStats?: {
    threadCount: number
    messageCount: number
    estimatedSizeBytes: number
  }
}

export const ThreadListSidebar: FC<ThreadListSidebarProps> = ({
  threads,
  currentThreadId,
  isLoading,
  isOpen,
  onToggle,
  onNewThread,
  onSelectThread,
  onArchiveThread,
  onDeleteThread,
  onRenameThread,
  onDeleteAll,
  onOpenSettings,
  storageStats,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteAllClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    onDeleteAll()
    setShowDeleteConfirm(false)
  }, [onDeleteAll])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      {/* Sidebar toggle button (visible when sidebar is closed) */}
      {!isOpen && (
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={onToggle}
          aria-label="Open sidebar"
        >
          <PanelLeft size={18} />
        </button>
      )}

      {/* Sidebar */}
      <aside className={`thread-sidebar ${isOpen ? 'open' : 'closed'}`}>
        {/* Header */}
        <div className="thread-sidebar-header">
          <div className="thread-sidebar-title">
            <span>Chats</span>
          </div>
          <button
            type="button"
            className="thread-sidebar-close"
            onClick={onToggle}
            aria-label="Close sidebar"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* Thread list */}
        <div className="thread-sidebar-content">
          <ThreadList
            threads={threads}
            currentThreadId={currentThreadId}
            isLoading={isLoading}
            onNewThread={onNewThread}
            onSelectThread={onSelectThread}
            onArchiveThread={onArchiveThread}
            onDeleteThread={onDeleteThread}
            onRenameThread={onRenameThread}
          />
        </div>

        {/* Footer */}
        <div className="thread-sidebar-footer">
          {storageStats && (
            <div className="thread-sidebar-stats">
              <HardDrive size={12} />
              <span>
                {storageStats.threadCount} chats &middot;{' '}
                {formatBytes(storageStats.estimatedSizeBytes)}
              </span>
            </div>
          )}
          <div className="thread-sidebar-actions">
            <button
              type="button"
              className="thread-sidebar-action"
              onClick={handleDeleteAllClick}
              title="Delete all chats"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className="thread-sidebar-action"
              onClick={onOpenSettings}
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={handleCancelDelete}>
          <div
            className="delete-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete all chats?</h3>
            <p>
              This will permanently delete all {threads.length} conversation
              {threads.length !== 1 ? 's' : ''} and their attachments. This
              action cannot be undone.
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-destructive"
                onClick={handleConfirmDelete}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
