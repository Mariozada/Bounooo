import { useState, useCallback, useEffect, type FC } from 'react'
import { ThreadListSidebar } from './ThreadListSidebar'
import { AgentChat } from './AgentChat'
import { useThreads } from '../hooks/useThreads'
import '../styles/sidebar.css'

export const ChatApp: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [storageStats, setStorageStats] = useState<{
    threadCount: number
    messageCount: number
    estimatedSizeBytes: number
  } | undefined>(undefined)

  const {
    threads,
    isLoading,
    currentThreadId,
    createNewThread,
    selectThread,
    deleteCurrentThread,
    archiveCurrentThread,
    renameThread,
    messages,
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    clearCurrentThread,
    // Branch operations
    editUserMessage,
    navigateBranch,
    regenerateAssistant,
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
    await createNewThread()
  }, [createNewThread])

  const handleSelectThread = useCallback(async (id: string) => {
    await selectThread(id)
  }, [selectThread])

  const handleArchiveThread = useCallback(async (id: string) => {
    // If archiving current thread, it will be deselected by the hook
    if (id === currentThreadId) {
      await archiveCurrentThread()
    } else {
      // For non-current threads, archive and refresh list
      const { archiveThread } = await import('@storage/chatStorage')
      await archiveThread(id)
      await refresh()
    }
    // Refresh stats
    getStats().then(setStorageStats)
  }, [currentThreadId, archiveCurrentThread, refresh, getStats])

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

  // Settings will be handled by AgentChat for now
  const handleOpenSettings = useCallback(() => {
    // AgentChat has its own settings button, but we can trigger it via a ref or event
    // For now, just close sidebar on mobile when going to settings
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
        onArchiveThread={handleArchiveThread}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        onDeleteAll={handleDeleteAll}
        onOpenSettings={handleOpenSettings}
        storageStats={storageStats}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <AgentChat
          key={currentThreadId || 'new'}
          threadId={currentThreadId}
          initialMessages={messages}
          onAddUserMessage={addUserMessage}
          onAddAssistantMessage={addAssistantMessage}
          onUpdateAssistantMessage={updateAssistantMessage}
          onClearThread={clearCurrentThread}
          onNewThread={handleNewThread}
          onEditUserMessage={editUserMessage}
          onNavigateBranch={navigateBranch}
          onRegenerateAssistant={regenerateAssistant}
          sidebarOpen={sidebarOpen}
        />
      </main>
    </div>
  )
}
