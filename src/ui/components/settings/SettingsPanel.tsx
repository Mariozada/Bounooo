import { useState, useCallback, useEffect, type FC, type ChangeEvent, type MouseEvent } from 'react'
import { X, Zap, Image, Eye, EyeOff } from 'lucide-react'
import type { ProviderSettings, ProviderType } from '@shared/settings'
import { PROVIDER_CONFIGS, getModelsForProvider, getDefaultModelForProvider } from '@agent/index'
import { CustomSelect } from '../CustomSelect'
import { DataTab } from './DataTab'
import { TracingTab } from './TracingTab'

type SettingsTab = 'provider' | 'tracing' | 'data'

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
  const [localSettings, setLocalSettings] = useState<ProviderSettings>(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  const models = getModelsForProvider(localSettings.provider)
  const isModelInList = models.some((m) => m.id === localSettings.model)
  const [useCustomModel, setUseCustomModel] = useState(
    localSettings.provider === 'openai-compatible' || !isModelInList
  )

  const handleProviderChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as ProviderType
    const isCustomProvider = newProvider === 'openai-compatible'

    setLocalSettings((prev) => {
      const updatedModels = {
        ...prev.models,
        [prev.provider]: prev.model,
      }
      const updatedCustomSettings = prev.customModelSettings
        ? {
            ...prev.customModelSettingsPerProvider,
            [prev.provider]: prev.customModelSettings,
          }
        : prev.customModelSettingsPerProvider

      const savedModel = updatedModels[newProvider]
      const defaultModel = getDefaultModelForProvider(newProvider)
      const newModel = savedModel || defaultModel

      const savedCustomSettings = updatedCustomSettings?.[newProvider]

      const modelsForNewProvider = getModelsForProvider(newProvider)
      const isModelInList = modelsForNewProvider.some((m) => m.id === newModel)
      setUseCustomModel(isCustomProvider || (!!savedModel && !isModelInList))

      return {
        ...prev,
        provider: newProvider,
        model: newModel,
        models: updatedModels,
        customModelSettings: savedCustomSettings,
        customModelSettingsPerProvider: updatedCustomSettings,
      }
    })
  }, [])

  const handleModelChange = useCallback((value: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      model: value,
    }))
  }, [])

  const handleCustomModelChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      model: e.target.value,
    }))
  }, [])

  const handleUseCustomModelToggle = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked
    setUseCustomModel(checked)
    if (!checked) {
      const defaultModel = getDefaultModelForProvider(localSettings.provider)
      setLocalSettings((prev) => ({
        ...prev,
        model: defaultModel,
      }))
    }
  }, [localSettings.provider])

  const handleApiKeyChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setLocalSettings((prev) => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [prev.provider]: value,
      },
    }))
  }, [])

  const handleBaseURLChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      openaiCompatible: {
        ...prev.openaiCompatible,
        baseURL: e.target.value,
        name: prev.openaiCompatible?.name || 'custom',
      },
    }))
  }, [])

  const handleCustomNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      openaiCompatible: {
        ...prev.openaiCompatible,
        name: e.target.value,
        baseURL: prev.openaiCompatible?.baseURL || '',
      },
    }))
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      const settingsToSave: ProviderSettings = {
        ...localSettings,
        models: {
          ...localSettings.models,
          [localSettings.provider]: localSettings.model,
        },
        customModelSettingsPerProvider: localSettings.customModelSettings
          ? {
              ...localSettings.customModelSettingsPerProvider,
              [localSettings.provider]: localSettings.customModelSettings,
            }
          : localSettings.customModelSettingsPerProvider,
      }
      await onSave(settingsToSave)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [localSettings, onSave, onClose])

  const handleCustomVisionChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      customModelSettings: {
        ...prev.customModelSettings,
        vision: e.target.checked,
        reasoning: prev.customModelSettings?.reasoning ?? false,
      },
    }))
  }, [])

  const handleCustomReasoningChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      customModelSettings: {
        ...prev.customModelSettings,
        vision: prev.customModelSettings?.vision ?? false,
        reasoning: e.target.checked,
      },
    }))
  }, [])

  const currentProviderConfig = PROVIDER_CONFIGS[localSettings.provider]
  const currentApiKey = localSettings.apiKeys[localSettings.provider] || ''
  const isOpenAICompatible = localSettings.provider === 'openai-compatible'

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, isSaving])

  const handleOverlayClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSaving) {
      onClose()
    }
  }, [onClose, isSaving])

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

        {/* Body: Tabs + Content side by side */}
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
              className={`settings-tab ${activeTab === 'data' ? 'active' : ''}`}
              onClick={() => setActiveTab('data')}
            >
              Data
            </button>
          </div>

          <div className="settings-content">
          {activeTab === 'provider' && (
            <>
              <div className="form-group">
                <label htmlFor="provider-select">Provider</label>
                <select
                  id="provider-select"
                  value={localSettings.provider}
                  onChange={handleProviderChange}
                >
                  {Object.entries(PROVIDER_CONFIGS).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.name}
                    </option>
                  ))}
                </select>
                <span className="help-text">{currentProviderConfig.description}</span>
              </div>

              <div className="form-group">
                <div className="label-row">
                  <label htmlFor="model-select">Model</label>
                  {!isOpenAICompatible && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={useCustomModel}
                        onChange={handleUseCustomModelToggle}
                      />
                      Custom
                    </label>
                  )}
                </div>

                {useCustomModel ? (
                  <input
                    id="model-select"
                    type="text"
                    value={localSettings.model}
                    onChange={handleCustomModelChange}
                    placeholder={
                      isOpenAICompatible
                        ? 'e.g., llama3.2, mistral, qwen2.5'
                        : 'e.g., claude-sonnet-4-20250514'
                    }
                  />
                ) : (
                  <CustomSelect
                    id="model-select"
                    value={localSettings.model}
                    onChange={handleModelChange}
                    options={models.map((model) => ({
                      value: model.id,
                      label: model.name,
                      icon: model.recommended ? <Zap size={14} /> : undefined,
                      suffix: model.vision ? <Image size={14} /> : undefined,
                    }))}
                  />
                )}

                {useCustomModel && !isOpenAICompatible && (
                  <span className="help-text">
                    Enter any model ID supported by {currentProviderConfig.name}
                  </span>
                )}

                {useCustomModel && (
                  <div className="custom-model-options">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={localSettings.customModelSettings?.vision ?? false}
                        onChange={handleCustomVisionChange}
                      />
                      Supports vision
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={localSettings.customModelSettings?.reasoning ?? false}
                        onChange={handleCustomReasoningChange}
                      />
                      Supports reasoning
                    </label>
                  </div>
                )}
              </div>

              {isOpenAICompatible && (
                <>
                  <div className="form-group">
                    <label htmlFor="base-url">Base URL</label>
                    <input
                      id="base-url"
                      type="text"
                      value={localSettings.openaiCompatible?.baseURL || ''}
                      onChange={handleBaseURLChange}
                      placeholder="http://localhost:11434/v1"
                    />
                    <span className="help-text">
                      Ollama: http://localhost:11434/v1 | LM Studio: http://localhost:1234/v1
                    </span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="custom-name">Provider Name</label>
                    <input
                      id="custom-name"
                      type="text"
                      value={localSettings.openaiCompatible?.name || ''}
                      onChange={handleCustomNameChange}
                      placeholder="ollama"
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label htmlFor="api-key">
                  API Key
                  {isOpenAICompatible && ' (optional)'}
                </label>
                <div className="input-with-button">
                  <input
                    id="api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={currentApiKey}
                    onChange={handleApiKeyChange}
                    placeholder={currentProviderConfig.apiKeyPlaceholder}
                  />
                  <button
                    type="button"
                    className="input-icon-button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {currentProviderConfig.apiKeyUrl && (
                  <a
                    href={currentProviderConfig.apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="help-link"
                  >
                    Get API key →
                  </a>
                )}
              </div>

              {error && <div className="error-message">{error}</div>}

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
            </>
          )}

          {activeTab === 'tracing' && (
            <>
              <TracingTab
                settings={localSettings}
                onUpdate={(updates) => setLocalSettings((prev) => ({ ...prev, ...updates }))}
              />

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
            </>
          )}

          {activeTab === 'data' && (
            <DataTab onRefreshThreads={onRefreshThreads} />
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
