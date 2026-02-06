import { type FC } from 'react'
import { PanelLeft } from 'lucide-react'

interface ChatTopBarProps {
  providerName: string
  modelName: string
  tabId: number
  hasMessages: boolean
  sidebarOpen: boolean
  onToggleSidebar?: () => void
  onNewChat: () => void
  onOpenSettings: () => void
}

export const ChatTopBar: FC<ChatTopBarProps> = ({
  providerName,
  modelName,
  tabId,
  hasMessages,
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  onOpenSettings,
}) => {
  return (
    <div className="aui-topbar">
      <div className="aui-topbar-info">
        {!sidebarOpen && onToggleSidebar && (
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
          >
            <PanelLeft size={18} />
          </button>
        )}
        <span className="provider-badge">{providerName}</span>
        <span className="model-name">{modelName}</span>
        {tabId > 0 && <span className="tab-badge">Tab {tabId}</span>}
      </div>
      <div className="aui-topbar-actions">
        {hasMessages && (
          <button
            type="button"
            className="button-icon"
            onClick={onNewChat}
            aria-label="New chat"
          >
            New
          </button>
        )}
        <button
          type="button"
          className="button-icon"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          Settings
        </button>
      </div>
    </div>
  )
}
