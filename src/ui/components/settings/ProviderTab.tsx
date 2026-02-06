import { type FC, type ChangeEvent } from 'react'
import { Zap, Image, Eye, EyeOff } from 'lucide-react'
import type { ProviderSettings, ProviderType } from '@shared/settings'
import { PROVIDER_CONFIGS, getModelsForProvider } from '@agent/index'
import { CustomSelect } from '../CustomSelect'

interface ProviderTabProps {
  settings: ProviderSettings
  useCustomModel: boolean
  showApiKey: boolean
  onProviderChange: (e: ChangeEvent<HTMLSelectElement>) => void
  onModelChange: (value: string) => void
  onCustomModelChange: (e: ChangeEvent<HTMLInputElement>) => void
  onUseCustomModelToggle: (e: ChangeEvent<HTMLInputElement>) => void
  onApiKeyChange: (e: ChangeEvent<HTMLInputElement>) => void
  onBaseURLChange: (e: ChangeEvent<HTMLInputElement>) => void
  onCustomNameChange: (e: ChangeEvent<HTMLInputElement>) => void
  onCustomVisionChange: (e: ChangeEvent<HTMLInputElement>) => void
  onCustomReasoningChange: (e: ChangeEvent<HTMLInputElement>) => void
  onToggleShowApiKey: () => void
}

export const ProviderTab: FC<ProviderTabProps> = ({
  settings,
  useCustomModel,
  showApiKey,
  onProviderChange,
  onModelChange,
  onCustomModelChange,
  onUseCustomModelToggle,
  onApiKeyChange,
  onBaseURLChange,
  onCustomNameChange,
  onCustomVisionChange,
  onCustomReasoningChange,
  onToggleShowApiKey,
}) => {
  const models = getModelsForProvider(settings.provider)
  const currentProviderConfig = PROVIDER_CONFIGS[settings.provider]
  const currentApiKey = settings.apiKeys[settings.provider] || ''
  const isOpenAICompatible = settings.provider === 'openai-compatible'

  return (
    <>
      <div className="form-group">
        <label htmlFor="provider-select">Provider</label>
        <select
          id="provider-select"
          value={settings.provider}
          onChange={onProviderChange}
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
                onChange={onUseCustomModelToggle}
              />
              Custom
            </label>
          )}
        </div>

        {useCustomModel ? (
          <input
            id="model-select"
            type="text"
            value={settings.model}
            onChange={onCustomModelChange}
            placeholder={
              isOpenAICompatible
                ? 'e.g., llama3.2, mistral, qwen2.5'
                : 'e.g., claude-sonnet-4-20250514'
            }
          />
        ) : (
          <CustomSelect
            id="model-select"
            value={settings.model}
            onChange={onModelChange}
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
                checked={settings.customModelSettings?.vision ?? false}
                onChange={onCustomVisionChange}
              />
              Supports vision
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.customModelSettings?.reasoning ?? false}
                onChange={onCustomReasoningChange}
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
              value={settings.openaiCompatible?.baseURL || ''}
              onChange={onBaseURLChange}
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
              value={settings.openaiCompatible?.name || ''}
              onChange={onCustomNameChange}
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
            onChange={onApiKeyChange}
            placeholder={currentProviderConfig.apiKeyPlaceholder}
          />
          <button
            type="button"
            className="input-icon-button"
            onClick={onToggleShowApiKey}
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
    </>
  )
}
