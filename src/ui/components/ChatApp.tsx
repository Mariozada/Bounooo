import { useState, useCallback, useEffect, useRef, type FC } from 'react'
import { ThreadListSidebar } from './ThreadListSidebar'
import { AgentChat } from './chat'
import { ShortcutForm } from './shortcuts/ShortcutForm'
import { useThreads } from '../hooks/threads'
import { useShortcuts } from '../hooks/useShortcuts'
import { useSettings } from '../hooks/useSettings'
import type { ScheduledShortcut } from '@storage/types'
import '../styles/sidebar.css'
import '../styles/shortcuts.css'

export const ChatApp: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [storageStats, setStorageStats] = useState<{
    threadCount: number
    messageCount: number
    estimatedSizeBytes: number
  } | undefined>(undefined)
  const [showShortcutForm, setShowShortcutForm] = useState(false)
  const [editingShortcut, setEditingShortcut] = useState<ScheduledShortcut | undefined>()

  // Stable view key - only changes on explicit user actions (new thread, select thread)
  // This prevents AgentChat from remounting when a thread is auto-created during sendMessage
  const [viewKey, setViewKey] = useState<string>('initial')
  const viewKeyCounterRef = useRef(0)

  const { settings } = useSettings()
  const {
    shortcuts,
    addShortcut,
    editShortcut,
    removeShortcut,
    toggleShortcut,
    runNow,
  } = useShortcuts()

  const {
    threads,
    isLoading,
    currentThreadId,
    createNewThread,
    selectThread,
    deleteCurrentThread,
    renameThread,
    messages,
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    clearCurrentThread,
    // Branch operations
    editUserMessage,
    navigateBranch,
    deleteAllData,
    getStats,
    refresh,
  } = useThreads()

  // Load storage stats
  useEffect(() => {
    getStats().then(setStorageStats)
  }, [getStats, threads])

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const handleNewThread = useCallback(async () => {
    // Change view key to force AgentChat reset
    viewKeyCounterRef.current += 1
    setViewKey(`new-${viewKeyCounterRef.current}`)
    await createNewThread()
  }, [createNewThread])

  const handleSelectThread = useCallback(async (id: string) => {
    // Change view key to force AgentChat reset when switching threads
    setViewKey(`thread-${id}`)
    await selectThread(id)
  }, [selectThread])

  const handleDeleteThread = useCallback(async (id: string) => {
    if (id === currentThreadId) {
      await deleteCurrentThread()
    } else {
      // For non-current threads, delete and refresh list
      const { deleteThread } = await import('@storage/chatStorage')
      await deleteThread(id)
      await refresh()
    }
    // Refresh stats
    getStats().then(setStorageStats)
  }, [currentThreadId, deleteCurrentThread, refresh, getStats])

  const handleRenameThread = useCallback(async (id: string, title: string) => {
    await renameThread(id, title)
  }, [renameThread])

  const handleDeleteAll = useCallback(async () => {
    await deleteAllData()
    setStorageStats(undefined)
  }, [deleteAllData])

  const handleCreateShortcut = useCallback(() => {
    setEditingShortcut(undefined)
    setShowShortcutForm(true)
  }, [])

  const handleEditShortcut = useCallback((shortcut: ScheduledShortcut) => {
    setEditingShortcut(shortcut)
    setShowShortcutForm(true)
  }, [])

  const handleSaveShortcut = useCallback(
    async (data: Parameters<typeof addShortcut>[0]) => {
      if (editingShortcut) {
        await editShortcut(editingShortcut.id, data)
      } else {
        await addShortcut(data)
      }
    },
    [editingShortcut, addShortcut, editShortcut]
  )

  const handleCloseShortcutForm = useCallback(() => {
    setShowShortcutForm(false)
    setEditingShortcut(undefined)
  }, [])

  return (
    <div className="app-with-sidebar">
      <ThreadListSidebar
        threads={threads}
        currentThreadId={currentThreadId}
        isLoading={isLoading}
        isOpen={sidebarOpen}
        onToggle={handleToggleSidebar}
        onNewThread={handleNewThread}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        onDeleteAll={handleDeleteAll}
        storageStats={storageStats}
        shortcuts={shortcuts}
        onEditShortcut={handleEditShortcut}
        onDeleteShortcut={removeShortcut}
        onToggleShortcut={toggleShortcut}
        onRunShortcutNow={runNow}
        onCreateShortcut={handleCreateShortcut}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <AgentChat
          key={viewKey}
          messages={messages}
          onAddUserMessage={addUserMessage}
          onAddAssistantMessage={addAssistantMessage}
          onUpdateAssistantMessage={updateAssistantMessage}
          onClearThread={clearCurrentThread}
          onEditUserMessage={editUserMessage}
          onNavigateBranch={navigateBranch}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          onCreateShortcut={handleCreateShortcut}
        />
      </main>
      {showShortcutForm && (
        <ShortcutForm
          settings={settings}
          shortcut={editingShortcut}
          onSave={handleSaveShortcut}
          onClose={handleCloseShortcutForm}
        />
      )}
    </div>
  )
}
