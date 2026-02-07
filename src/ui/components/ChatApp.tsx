import { useState, useCallback, useEffect, useRef, type FC } from 'react'
import { ThreadListSidebar } from './ThreadListSidebar'
import { AgentChat } from './AgentChat'
import { useThreads } from '../hooks/useThreads'
import '../styles/sidebar.css'

export const ChatApp: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [storageStats, setStorageStats] = useState<{
    threadCount: number
    messageCount: number
    estimatedSizeBytes: number
  } | undefined>(undefined)

  // Stable view key - only changes on explicit user actions (new thread, select thread)
  // This prevents AgentChat from remounting when a thread is auto-created during sendMessage
  const [viewKey, setViewKey] = useState<string>('initial')
  const viewKeyCounterRef = useRef(0)

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
        />
      </main>
    </div>
  )
}
