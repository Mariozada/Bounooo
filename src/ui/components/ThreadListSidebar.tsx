import { useState, useCallback, type FC } from 'react'
import {
  Trash2,
  HardDrive,
  ChevronLeft,
  Timer,
} from 'lucide-react'
import { ThreadList } from './ThreadList'
import { ShortcutList } from './shortcuts/ShortcutList'
import type { Thread, ScheduledShortcut } from '@storage/types'

type SidebarTab = 'chats' | 'shortcuts'

interface ThreadListSidebarProps {
  threads: Thread[]
  currentThreadId: string | null
  isLoading: boolean
  isOpen: boolean
  onToggle: () => void
  onNewThread: () => void
  onSelectThread: (id: string) => void
  onDeleteThread: (id: string) => void
  onRenameThread: (id: string, title: string) => void
  onDeleteAll: () => void
  storageStats?: {
    threadCount: number
    messageCount: number
    estimatedSizeBytes: number
  }
  shortcuts?: ScheduledShortcut[]
  onEditShortcut?: (shortcut: ScheduledShortcut) => void
  onDeleteShortcut?: (id: string) => void
  onToggleShortcut?: (id: string, enabled: boolean) => void
  onRunShortcutNow?: (id: string) => void
  onCreateShortcut?: () => void
}

export const ThreadListSidebar: FC<ThreadListSidebarProps> = ({
  threads,
  currentThreadId,
  isLoading,
  isOpen,
  onToggle,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  onDeleteAll,
  storageStats,
  shortcuts = [],
  onEditShortcut,
  onDeleteShortcut,
  onToggleShortcut,
  onRunShortcutNow,
  onCreateShortcut,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats')

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
      {/* Sidebar */}
      <aside className={`thread-sidebar ${isOpen ? 'open' : 'closed'}`}>
        {/* Header */}
        <div className="thread-sidebar-header">
          <div className="thread-sidebar-tabs">
            <button
              type="button"
              className={`thread-sidebar-tab ${activeTab === 'chats' ? 'active' : ''}`}
              onClick={() => setActiveTab('chats')}
            >
              Chats
            </button>
            <button
              type="button"
              className={`thread-sidebar-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              <Timer size={14} />
              Shortcuts
            </button>
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

        {/* Content */}
        <div className="thread-sidebar-content">
          {activeTab === 'chats' ? (
            <ThreadList
              threads={threads}
              currentThreadId={currentThreadId}
              isLoading={isLoading}
              onNewThread={onNewThread}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
            />
          ) : (
            <ShortcutList
              shortcuts={shortcuts}
              onEdit={onEditShortcut ?? (() => {})}
              onDelete={onDeleteShortcut ?? (() => {})}
              onToggle={onToggleShortcut ?? (() => {})}
              onRunNow={onRunShortcutNow ?? (() => {})}
              onCreate={onCreateShortcut ?? (() => {})}
            />
          )}
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
