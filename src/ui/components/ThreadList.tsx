import { useState, useCallback, type FC } from 'react'
import { Plus, Archive, Trash2, MoreHorizontal, Pencil, X, Check } from 'lucide-react'
import type { Thread } from '@storage/types'

interface ThreadListProps {
  threads: Thread[]
  currentThreadId: string | null
  isLoading: boolean
  onNewThread: () => void
  onSelectThread: (id: string) => void
  onArchiveThread: (id: string) => void
  onDeleteThread: (id: string) => void
  onRenameThread: (id: string, title: string) => void
}

export const ThreadList: FC<ThreadListProps> = ({
  threads,
  currentThreadId,
  isLoading,
  onNewThread,
  onSelectThread,
  onArchiveThread,
  onDeleteThread,
  onRenameThread,
}) => {
  return (
    <div className="thread-list-root">
      <ThreadListNew onClick={onNewThread} />
      {isLoading ? (
        <ThreadListSkeleton />
      ) : (
        <ThreadListItems
          threads={threads}
          currentThreadId={currentThreadId}
          onSelect={onSelectThread}
          onArchive={onArchiveThread}
          onDelete={onDeleteThread}
          onRename={onRenameThread}
        />
      )}
    </div>
  )
}

const ThreadListNew: FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <button
      type="button"
      className="thread-list-new"
      onClick={onClick}
    >
      <Plus size={16} />
      <span>New Thread</span>
    </button>
  )
}

const ThreadListSkeleton: FC = () => {
  return (
    <div className="thread-list-skeleton">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="thread-list-skeleton-item">
          <div className="thread-list-skeleton-bar" />
        </div>
      ))}
    </div>
  )
}

interface ThreadListItemsProps {
  threads: Thread[]
  currentThreadId: string | null
  onSelect: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

const ThreadListItems: FC<ThreadListItemsProps> = ({
  threads,
  currentThreadId,
  onSelect,
  onArchive,
  onDelete,
  onRename,
}) => {
  if (threads.length === 0) {
    return (
      <div className="thread-list-empty">
        <p>No conversations yet</p>
        <p className="thread-list-empty-hint">Start a new thread to begin</p>
      </div>
    )
  }

  return (
    <div className="thread-list-items">
      {threads.map((thread) => (
        <ThreadListItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === currentThreadId}
          onSelect={() => onSelect(thread.id)}
          onArchive={() => onArchive(thread.id)}
          onDelete={() => onDelete(thread.id)}
          onRename={(title) => onRename(thread.id, title)}
        />
      ))}
    </div>
  )
}

interface ThreadListItemProps {
  thread: Thread
  isActive: boolean
  onSelect: () => void
  onArchive: () => void
  onDelete: () => void
  onRename: (title: string) => void
}

const ThreadListItem: FC<ThreadListItemProps> = ({
  thread,
  isActive,
  onSelect,
  onArchive,
  onDelete,
  onRename,
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(thread.title)

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu((prev) => !prev)
  }, [])

  const handleArchive = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    onArchive()
  }, [onArchive])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    onDelete()
  }, [onDelete])

  const handleStartRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    setIsEditing(true)
    setEditTitle(thread.title)
  }, [thread.title])

  const handleSaveRename = useCallback(() => {
    if (editTitle.trim() && editTitle !== thread.title) {
      onRename(editTitle.trim())
    }
    setIsEditing(false)
  }, [editTitle, thread.title, onRename])

  const handleCancelRename = useCallback(() => {
    setIsEditing(false)
    setEditTitle(thread.title)
  }, [thread.title])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename()
    } else if (e.key === 'Escape') {
      handleCancelRename()
    }
  }, [handleSaveRename, handleCancelRename])

  // Close menu when clicking outside
  const handleBlur = useCallback(() => {
    // Delay to allow click events on menu items
    setTimeout(() => setShowMenu(false), 150)
  }, [])

  return (
    <div
      className={`thread-list-item ${isActive ? 'active' : ''}`}
      onClick={isEditing ? undefined : onSelect}
      onBlur={handleBlur}
    >
      {isEditing ? (
        <div className="thread-list-item-edit">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="thread-list-item-edit-input"
          />
          <button
            type="button"
            className="thread-list-item-edit-btn save"
            onClick={handleSaveRename}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            className="thread-list-item-edit-btn cancel"
            onClick={handleCancelRename}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <span className="thread-list-item-title">{thread.title}</span>
          <button
            type="button"
            className="thread-list-item-menu-btn"
            onClick={handleMenuClick}
          >
            <MoreHorizontal size={14} />
          </button>
          {showMenu && (
            <div className="thread-list-item-menu">
              <button
                type="button"
                className="thread-list-item-menu-option"
                onClick={handleStartRename}
              >
                <Pencil size={14} />
                <span>Rename</span>
              </button>
              <button
                type="button"
                className="thread-list-item-menu-option"
                onClick={handleArchive}
              >
                <Archive size={14} />
                <span>Archive</span>
              </button>
              <button
                type="button"
                className="thread-list-item-menu-option destructive"
                onClick={handleDelete}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
