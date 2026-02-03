import { useState, useEffect, useCallback } from 'react'
import {
  ProviderSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from '@shared/settings'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[useSettings]', ...args)
const logError = (...args: unknown[]) => console.error('[useSettings]', ...args)

export function useSettings() {
  const [settings, setSettings] = useState<ProviderSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    log('Loading settings from chrome.storage...')
    loadSettings()
      .then((loaded) => {
        log('Settings loaded:', loaded)
        setSettings(loaded)
        setIsLoading(false)
      })
      .catch((e) => {
        logError('Failed to load settings:', e)
        setError(e.message)
        setIsLoading(false)
      })
  }, [])

  const updateSettings = useCallback(
    async (newSettings: Partial<ProviderSettings>) => {
      log('updateSettings called:', newSettings)
      const updated = { ...settings, ...newSettings }
      log('Updated settings:', updated)
      setSettings(updated)
      try {
        await saveSettings(updated)
        log('Settings saved successfully')
        setError(null)
      } catch (e) {
        logError('Failed to save settings:', e)
        setError((e as Error).message)
        throw e
      }
    },
    [settings]
  )

  const updateApiKey = useCallback(
    async (provider: ProviderSettings['provider'], apiKey: string) => {
      log('updateApiKey called for provider:', provider)
      const updated = {
        ...settings,
        apiKeys: { ...settings.apiKeys, [provider]: apiKey },
      }
      setSettings(updated)
      try {
        await saveSettings(updated)
        log('API key saved successfully')
        setError(null)
      } catch (e) {
        logError('Failed to save API key:', e)
        setError((e as Error).message)
        throw e
      }
    },
    [settings]
  )

  const currentApiKey = settings.apiKeys[settings.provider] || ''

  return {
    settings,
    updateSettings,
    updateApiKey,
    currentApiKey,
    isLoading,
    error,
  }
}
