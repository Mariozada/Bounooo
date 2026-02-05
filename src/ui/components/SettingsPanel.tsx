import { useState, useCallback, type FC, type ChangeEvent } from 'react'
import type { ProviderSettings, ProviderType } from '@shared/settings'
import { DEFAULT_TRACING_SETTINGS } from '@shared/settings'
import { PROVIDER_CONFIGS, getModelsForProvider, getDefaultModelForProvider } from '@agent/index'

interface SettingsPanelProps {
  settings: ProviderSettings
  onSave: (settings: Partial<ProviderSettings>) => Promise<void>
  onClose: () => void
}

export const SettingsPanel: FC<SettingsPanelProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [localSettings, setLocalSettings] = useState<ProviderSettings>(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const models = getModelsForProvider(localSettings.provider)
  const isModelInList = models.some((m) => m.id === localSettings.model)
  const [useCustomModel, setUseCustomModel] = useState(
    localSettings.provider === 'openai-compatible' || !isModelInList
  )

  const handleProviderChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as ProviderType
    const defaultModel = getDefaultModelForProvider(provider)
    const isCustomProvider = provider === 'openai-compatible'
    setUseCustomModel(isCustomProvider)
    setLocalSettings((prev) => ({
      ...prev,
      provider,
      model: isCustomProvider ? prev.model : defaultModel,
    }))
  }, [])

  const handleModelChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      model: e.target.value,
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

  const handleTracingEnabledChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      tracing: {
        ...DEFAULT_TRACING_SETTINGS,
        ...prev.tracing,
        enabled: e.target.checked,
      },
    }))
  }, [])

  const handleTracingEndpointChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      tracing: {
        ...DEFAULT_TRACING_SETTINGS,
        ...prev.tracing,
        endpoint: e.target.value,
      },
    }))
  }, [])

  const handleTracingProjectChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({
      ...prev,
      tracing: {
        ...DEFAULT_TRACING_SETTINGS,
        ...prev.tracing,
        projectName: e.target.value,
      },
    }))
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      await onSave(localSettings)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [localSettings, onSave, onClose])

  const currentProviderConfig = PROVIDER_CONFIGS[localSettings.provider]
  const currentApiKey = localSettings.apiKeys[localSettings.provider] || ''
  const isOpenAICompatible = localSettings.provider === 'openai-compatible'

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3>Agent Settings</h3>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <div className="settings-content">
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
            <select
              id="model-select"
              value={localSettings.model}
              onChange={handleModelChange}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                  {model.vision && ' 👁'}
                  {model.recommended && ' ⭐'}
                </option>
              ))}
            </select>
          )}

          {useCustomModel && !isOpenAICompatible && (
            <span className="help-text">
              Enter any model ID supported by {currentProviderConfig.name}
            </span>
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
          <input
            id="api-key"
            type="password"
            value={currentApiKey}
            onChange={handleApiKeyChange}
            placeholder={currentProviderConfig.apiKeyPlaceholder}
          />
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

        <div className="settings-section">
          <h4>Tracing (Phoenix)</h4>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={localSettings.tracing?.enabled ?? false}
                onChange={handleTracingEnabledChange}
              />
              Enable tracing
            </label>
            <span className="help-text">
              Send traces to Phoenix for observability
            </span>
          </div>

          {localSettings.tracing?.enabled && (
            <>
              <div className="form-group">
                <label htmlFor="tracing-endpoint">Phoenix Endpoint</label>
                <input
                  id="tracing-endpoint"
                  type="text"
                  value={localSettings.tracing?.endpoint ?? DEFAULT_TRACING_SETTINGS.endpoint}
                  onChange={handleTracingEndpointChange}
                  placeholder="http://0.0.0.0:6006"
                />
                <span className="help-text">
                  Run: docker run -p 6006:6006 arizephoenix/phoenix
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="tracing-project">Project Name</label>
                <input
                  id="tracing-project"
                  type="text"
                  value={localSettings.tracing?.projectName ?? DEFAULT_TRACING_SETTINGS.projectName}
                  onChange={handleTracingProjectChange}
                  placeholder="browserun"
                />
              </div>
            </>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="settings-footer">
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
    </div>
  )
}
