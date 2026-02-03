export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'groq'
  | 'openrouter'
  | 'openai-compatible'

export interface OpenAICompatibleConfig {
  baseURL: string
  name: string
}

export interface ProviderSettings {
  provider: ProviderType
  model: string
  apiKeys: Partial<Record<ProviderType, string>>
  openaiCompatible?: OpenAICompatibleConfig
}

export const DEFAULT_SETTINGS: ProviderSettings = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeys: {},
  openaiCompatible: {
    baseURL: 'http://localhost:11434/v1',
    name: 'ollama',
  },
}

export const STORAGE_KEY = 'browserun_agent_settings'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Settings]', ...args)
const logError = (...args: unknown[]) => console.error('[Settings]', ...args)

export async function loadSettings(): Promise<ProviderSettings> {
  log('loadSettings called')
  try {
    log('Checking if chrome.storage is available:', !!chrome?.storage?.local)
    const result = await chrome.storage.local.get(STORAGE_KEY)
    log('chrome.storage.local.get result:', result)
    if (result[STORAGE_KEY]) {
      const merged = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] }
      log('Returning merged settings:', merged)
      return merged
    }
  } catch (e) {
    logError('Failed to load settings:', e)
  }
  log('Returning default settings:', DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function saveSettings(settings: ProviderSettings): Promise<void> {
  log('saveSettings called with:', settings)
  try {
    log('Checking if chrome.storage is available:', !!chrome?.storage?.local)
    await chrome.storage.local.set({ [STORAGE_KEY]: settings })
    log('Settings saved successfully')
  } catch (e) {
    logError('Failed to save settings:', e)
    throw e
  }
}
