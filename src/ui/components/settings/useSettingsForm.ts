import { useState, useCallback, type ChangeEvent } from 'react'
import type { ProviderSettings, ProviderType } from '@shared/settings'
import { loadSettings } from '@shared/settings'
import { getModelsForProvider, getDefaultModelForProvider } from '@agent/index'

export function useSettingsForm(initialSettings: ProviderSettings) {
  const [localSettings, setLocalSettings] = useState<ProviderSettings>(initialSettings)
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
    setLocalSettings((prev) => ({ ...prev, model: value }))
  }, [])

  const handleCustomModelChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prev) => ({ ...prev, model: e.target.value }))
  }, [])

  const handleUseCustomModelToggle = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked
      setUseCustomModel(checked)
      if (!checked) {
        const defaultModel = getDefaultModelForProvider(localSettings.provider)
        setLocalSettings((prev) => ({ ...prev, model: defaultModel }))
      }
    },
    [localSettings.provider]
  )

  const handleApiKeyChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setLocalSettings((prev) => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [prev.provider]: value },
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

  const handleTracingUpdate = useCallback((updates: Partial<ProviderSettings>) => {
    setLocalSettings((prev) => ({ ...prev, ...updates }))
  }, [])

  const handleCodexAuthChange = useCallback(async () => {
    // Reload settings to get updated Codex auth status
    const newSettings = await loadSettings()
    setLocalSettings((prev) => ({
      ...prev,
      codexAuth: newSettings.codexAuth,
    }))
  }, [])

  const handleGeminiAuthChange = useCallback(async () => {
    // Reload settings to get updated Gemini auth status
    const newSettings = await loadSettings()
    setLocalSettings((prev) => ({
      ...prev,
      geminiAuth: newSettings.geminiAuth,
    }))
  }, [])

  const getSettingsToSave = useCallback((): ProviderSettings => {
    return {
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
  }, [localSettings])

  return {
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
    handleGeminiAuthChange,
    getSettingsToSave,
  }
}
