import React, { type FC, type ChangeEvent, useState, useEffect } from 'react'
import { Zap, Image, Eye, EyeOff, LogIn, LogOut, Loader2, Key, User } from 'lucide-react'
import type { ProviderSettings, ProviderType } from '@shared/settings'
import { PROVIDER_CONFIGS, getModelsForProvider } from '@agent/index'
import { CustomSelect } from '../CustomSelect'
import { MessageTypes } from '@shared/messages'

type OpenAIAuthMode = 'api-key' | 'chatgpt-login'
type GoogleAuthMode = 'api-key' | 'google-login'

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
  onMaxStepsChange: (e: ChangeEvent<HTMLInputElement>) => void
  onGeminiThinkingLevelChange: (e: ChangeEvent<HTMLSelectElement>) => void
  onUserPreferenceChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  onGifEnabledChange: (e: ChangeEvent<HTMLInputElement>) => void
  onToggleShowApiKey: () => void
  onCodexAuthChange?: () => void  // Callback to refresh settings after auth change
  onGeminiAuthChange?: () => void  // Callback to refresh settings after Gemini auth change
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
  onMaxStepsChange,
  onGeminiThinkingLevelChange,
  onUserPreferenceChange,
  onGifEnabledChange,
  onToggleShowApiKey,
  onCodexAuthChange,
  onGeminiAuthChange,
}) => {
  const [codexLoading, setCodexLoading] = useState(false)
  const [codexError, setCodexError] = useState<string | null>(null)
  const [codexUserCode, setCodexUserCode] = useState<string | null>(null)

  // Gemini OAuth state
  const [geminiLoading, setGeminiLoading] = useState(false)
  const [geminiError, setGeminiError] = useState<string | null>(null)

  const hasCodexAuth = !!settings.codexAuth
  const hasGeminiAuth = !!settings.geminiAuth
  const hasApiKey = !!settings.apiKeys['openai']

  // Determine auth mode based on current state
  const [openaiAuthMode, setOpenaiAuthMode] = useState<OpenAIAuthMode>(
    hasCodexAuth ? 'chatgpt-login' : 'api-key'
  )
  const [googleAuthMode, setGoogleAuthMode] = useState<GoogleAuthMode>(
    hasGeminiAuth ? 'google-login' : 'api-key'
  )

  // Update mode when auth state changes
  useEffect(() => {
    if (hasCodexAuth) {
      setOpenaiAuthMode('chatgpt-login')
    }
  }, [hasCodexAuth])

  useEffect(() => {
    if (hasGeminiAuth) {
      setGoogleAuthMode('google-login')
    }
  }, [hasGeminiAuth])

  // For OpenAI, show Codex models only when in chatgpt-login mode with auth
  const showCodexModels = openaiAuthMode === 'chatgpt-login' && hasCodexAuth
  const models = getModelsForProvider(settings.provider, showCodexModels)
  const currentProviderConfig = PROVIDER_CONFIGS[settings.provider]
  const currentApiKey = settings.apiKeys[settings.provider] || ''
  const isOpenAICompatible = settings.provider === 'openai-compatible'
  const isOpenAI = settings.provider === 'openai'
  const isGoogle = settings.provider === 'google'
  const isGemini3 = isGoogle && settings.model.includes('gemini-3')

  // Listen for auth completion from background
  React.useEffect(() => {
    const handleMessage = (message: { type: string; success?: boolean; error?: string }) => {
      if (message.type === 'CODEX_AUTH_COMPLETE') {
        setCodexLoading(false)
        setCodexUserCode(null)
        if (message.success) {
          setCodexError(null)
          onCodexAuthChange?.()
        } else {
          setCodexError(message.error || 'Authentication failed')
        }
      }
      if (message.type === 'GEMINI_AUTH_COMPLETE') {
        setGeminiLoading(false)
        if (message.success) {
          setGeminiError(null)
          onGeminiAuthChange?.()
        } else {
          setGeminiError(message.error || 'Authentication failed')
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [onCodexAuthChange, onGeminiAuthChange])

  const handleCodexLogin = async () => {
    setCodexLoading(true)
    setCodexError(null)
    setCodexUserCode(null)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageTypes.CODEX_OAUTH_START })
      if (!response.success) {
        setCodexError(response.error || 'Login failed')
        setCodexLoading(false)
      } else if (response.userCode) {
        // Device flow: show the user code
        setCodexUserCode(response.userCode)
        // Keep loading state until auth completes via message
      }
    } catch (err) {
      setCodexError((err as Error).message)
      setCodexLoading(false)
    }
  }

  const handleCodexLogout = async () => {
    setCodexLoading(true)
    setCodexError(null)
    setCodexUserCode(null)
    try {
      await chrome.runtime.sendMessage({ type: MessageTypes.CODEX_OAUTH_LOGOUT })
      onCodexAuthChange?.()
    } catch (err) {
      setCodexError((err as Error).message)
    } finally {
      setCodexLoading(false)
    }
  }

  const handleGeminiLogin = async () => {
    setGeminiLoading(true)
    setGeminiError(null)
    try {
      const response = await chrome.runtime.sendMessage({ type: MessageTypes.GEMINI_OAUTH_START })
      if (!response.success) {
        setGeminiError(response.error || 'Login failed')
        setGeminiLoading(false)
      }
      // For Gemini, auth completes via GEMINI_AUTH_COMPLETE message
    } catch (err) {
      setGeminiError((err as Error).message)
      setGeminiLoading(false)
    }
  }

  const handleGeminiLogout = async () => {
    setGeminiLoading(true)
    setGeminiError(null)
    try {
      await chrome.runtime.sendMessage({ type: MessageTypes.GEMINI_OAUTH_LOGOUT })
      onGeminiAuthChange?.()
    } catch (err) {
      setGeminiError((err as Error).message)
    } finally {
      setGeminiLoading(false)
    }
  }

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

      {/* OpenAI Auth Mode Toggle */}
      {isOpenAI && (
        <div className="form-group">
          <label>Authentication Method</label>
          <div className="auth-mode-toggle">
            <button
              type="button"
              className={`auth-mode-btn ${openaiAuthMode === 'api-key' ? 'active' : ''}`}
              onClick={() => setOpenaiAuthMode('api-key')}
            >
              <Key size={14} />
              API Key
            </button>
            <button
              type="button"
              className={`auth-mode-btn ${openaiAuthMode === 'chatgpt-login' ? 'active' : ''}`}
              onClick={() => setOpenaiAuthMode('chatgpt-login')}
            >
              <User size={14} />
              ChatGPT Login
            </button>
          </div>
        </div>
      )}

      {/* ChatGPT Login section */}
      {isOpenAI && openaiAuthMode === 'chatgpt-login' && (
        <div className="form-group codex-auth-section">
          {hasCodexAuth ? (
            <div className="codex-logged-in">
              <span className="codex-status">Logged in with ChatGPT</span>
              <button
                type="button"
                className="button-secondary codex-logout-btn"
                onClick={handleCodexLogout}
                disabled={codexLoading}
              >
                {codexLoading ? (
                  <Loader2 size={14} className="spinning" />
                ) : (
                  <LogOut size={14} />
                )}
                Logout
              </button>
            </div>
          ) : codexUserCode ? (
            <div className="codex-device-flow">
              <div className="codex-user-code">
                <span className="codex-code-label">Enter this code on OpenAI:</span>
                <span className="codex-code">{codexUserCode}</span>
              </div>
              <div className="codex-waiting">
                <Loader2 size={14} className="spinning" />
                <span>Waiting for authorization...</span>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={async () => {
                  await chrome.runtime.sendMessage({ type: MessageTypes.CODEX_OAUTH_CANCEL })
                  setCodexLoading(false)
                  setCodexUserCode(null)
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button-primary codex-login-btn"
              onClick={handleCodexLogin}
              disabled={codexLoading}
            >
              {codexLoading ? (
                <Loader2 size={14} className="spinning" />
              ) : (
                <LogIn size={14} />
              )}
              Login with ChatGPT Pro/Plus
            </button>
          )}
          {codexError && <span className="error-text">{codexError}</span>}
          <span className="help-text">
            Use your ChatGPT subscription. Unlocks Codex models.
          </span>
        </div>
      )}

      {/* Google Auth Mode Toggle */}
      {isGoogle && (
        <div className="form-group">
          <label>Authentication Method</label>
          <div className="auth-mode-toggle">
            <button
              type="button"
              className={`auth-mode-btn ${googleAuthMode === 'api-key' ? 'active' : ''}`}
              onClick={() => setGoogleAuthMode('api-key')}
            >
              <Key size={14} />
              API Key
            </button>
            <button
              type="button"
              className={`auth-mode-btn ${googleAuthMode === 'google-login' ? 'active' : ''}`}
              onClick={() => setGoogleAuthMode('google-login')}
            >
              <User size={14} />
              Google Login
            </button>
          </div>
        </div>
      )}

      {/* Google Login section */}
      {isGoogle && googleAuthMode === 'google-login' && (
        <div className="form-group gemini-auth-section">
          {hasGeminiAuth ? (
            <div className="gemini-logged-in">
              <span className="gemini-status">Logged in with Google</span>
              <button
                type="button"
                className="button-secondary gemini-logout-btn"
                onClick={handleGeminiLogout}
                disabled={geminiLoading}
              >
                {geminiLoading ? (
                  <Loader2 size={14} className="spinning" />
                ) : (
                  <LogOut size={14} />
                )}
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button-primary gemini-login-btn"
              onClick={handleGeminiLogin}
              disabled={geminiLoading}
            >
              {geminiLoading ? (
                <Loader2 size={14} className="spinning" />
              ) : (
                <LogIn size={14} />
              )}
              Login with Google
            </button>
          )}
          {geminiError && <span className="error-text">{geminiError}</span>}
          <span className="help-text">
            Use your Google account to access Gemini models.
          </span>
        </div>
      )}

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

      {isGemini3 && (
        <div className="form-group">
          <label htmlFor="gemini-thinking-level">Thinking Level</label>
          <select
            id="gemini-thinking-level"
            value={settings.geminiThinkingLevel || 'medium'}
            onChange={onGeminiThinkingLevelChange}
          >
            <option value="minimal">Minimal</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <span className="help-text">Controls how much the model thinks before responding</span>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="max-steps">Max Steps</label>
        <input
          id="max-steps"
          type="number"
          min={1}
          max={50}
          value={settings.maxSteps ?? 15}
          onChange={onMaxStepsChange}
        />
        <span className="help-text">Maximum tool-use steps per response (1–50)</span>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.gifEnabled ?? false}
            onChange={onGifEnabledChange}
          />
          Enable GIF recording
        </label>
        <span className="help-text">Allow the agent to record and export GIF animations</span>
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

      {/* API Key - show for providers in api-key mode */}
      {(!isOpenAI || openaiAuthMode === 'api-key') && (!isGoogle || googleAuthMode === 'api-key') && (
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
      )}

      <div className="form-group">
        <label htmlFor="user-preference">User Preference</label>
        <textarea
          id="user-preference"
          value={settings.userPreference || ''}
          onChange={onUserPreferenceChange}
          placeholder="e.g., Always respond in Spanish, prefer keyboard shortcuts over clicking..."
          rows={3}
        />
        <span className="help-text">Custom instructions for the agent. Takes priority over default behavior.</span>
      </div>
    </>
  )
}
