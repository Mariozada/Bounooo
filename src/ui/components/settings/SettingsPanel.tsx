import { useState, useCallback, useEffect, type FC, type MouseEvent } from 'react'
import { X } from 'lucide-react'
import type { ProviderSettings } from '@shared/settings'
import { useSettingsForm } from './useSettingsForm'
import { ProviderTab } from './ProviderTab'
import { TracingTab } from './TracingTab'
import { DataTab } from './DataTab'
import { SkillsTab } from './SkillsTab'
import { McpTab } from './McpTab'

type SettingsTab = 'provider' | 'tracing' | 'skills' | 'mcp' | 'data'

interface SettingsPanelProps {
  settings: ProviderSettings
  onSave: (settings: Partial<ProviderSettings>) => Promise<void>
  onClose: () => void
  onRefreshThreads?: () => Promise<void>
  initialTab?: SettingsTab
}

export const SettingsPanel: FC<SettingsPanelProps> = ({
  settings,
  onSave,
  onClose,
  onRefreshThreads,
  initialTab = 'provider',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    localSettings,
    useCustomModel,
    showApiKey,
    setShowApiKey,
    handleProviderChange,
    handleModelChange,
    handleCustomModelChange,
    handleUseCustomModelToggle,
    handleApiKeyChange,
    handleBaseURLChange,
    handleCustomNameChange,
    handleCustomVisionChange,
    handleCustomReasoningChange,
    handleTracingUpdate,
    handleCodexAuthChange,
    getSettingsToSave,
  } = useSettingsForm(settings)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onSave(getSettingsToSave())
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [getSettingsToSave, onSave, onClose])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, isSaving])

  const handleOverlayClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !isSaving) {
        onClose()
      }
    },
    [onClose, isSaving]
  )

  const renderActions = () => (
    <div className="settings-actions">
      <button
        type="button"
        className="button-secondary"
        onClick={onClose}
        disabled={isSaving}
      >
        Cancel
      </button>
      <button
        type="button"
        className="button-primary"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-tabs">
            <button
              type="button"
              className={`settings-tab ${activeTab === 'provider' ? 'active' : ''}`}
              onClick={() => setActiveTab('provider')}
            >
              Provider
            </button>
            <button
              type="button"
              className={`settings-tab ${activeTab === 'tracing' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracing')}
            >
              Tracing
            </button>
            <button
              type="button"
              className={`settings-tab ${activeTab === 'skills' ? 'active' : ''}`}
              onClick={() => setActiveTab('skills')}
            >
              Skills
            </button>
            <button
              type="button"
              className={`settings-tab ${activeTab === 'mcp' ? 'active' : ''}`}
              onClick={() => setActiveTab('mcp')}
            >
              MCP
            </button>
            <button
              type="button"
              className={`settings-tab ${activeTab === 'data' ? 'active' : ''}`}
              onClick={() => setActiveTab('data')}
            >
              Data
            </button>
          </div>

          <div className="settings-content">
            {activeTab === 'provider' && (
              <>
                <ProviderTab
                  settings={localSettings}
                  useCustomModel={useCustomModel}
                  showApiKey={showApiKey}
                  onProviderChange={handleProviderChange}
                  onModelChange={handleModelChange}
                  onCustomModelChange={handleCustomModelChange}
                  onUseCustomModelToggle={handleUseCustomModelToggle}
                  onApiKeyChange={handleApiKeyChange}
                  onBaseURLChange={handleBaseURLChange}
                  onCustomNameChange={handleCustomNameChange}
                  onCustomVisionChange={handleCustomVisionChange}
                  onCustomReasoningChange={handleCustomReasoningChange}
                  onToggleShowApiKey={() => setShowApiKey(!showApiKey)}
                  onCodexAuthChange={handleCodexAuthChange}
                />
                {error && <div className="error-message">{error}</div>}
                {renderActions()}
              </>
            )}

            {activeTab === 'tracing' && (
              <>
                <TracingTab settings={localSettings} onUpdate={handleTracingUpdate} />
                {renderActions()}
              </>
            )}

            {activeTab === 'skills' && <SkillsTab />}

            {activeTab === 'mcp' && <McpTab />}

            {activeTab === 'data' && <DataTab onRefreshThreads={onRefreshThreads} />}
          </div>
        </div>
      </div>
    </div>
  )
}
