import type { CodexAuth, GeminiAuth } from '@auth/types'

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'groq'
  | 'xai'
  | 'openrouter'
  | 'openai-compatible'

export interface OpenAICompatibleConfig {
  baseURL: string
  name: string
}

export interface TracingSettings {
  enabled: boolean
  endpoint: string
  projectName: string
}

export interface CustomModelSettings {
  vision: boolean
  reasoning: boolean
}

export interface ProviderSettings {
  provider: ProviderType
  model: string
  apiKeys: Partial<Record<ProviderType, string>>
  models?: Partial<Record<ProviderType, string>>  // Store last used model per provider
  openaiCompatible?: OpenAICompatibleConfig
  tracing?: TracingSettings
  customModelSettings?: CustomModelSettings
  customModelSettingsPerProvider?: Partial<Record<ProviderType, CustomModelSettings>>  // Per provider
  reasoningEnabled?: boolean
  postToolDelay?: number
  codexAuth?: CodexAuth
  geminiAuth?: GeminiAuth
}

export const DEFAULT_TRACING_SETTINGS: TracingSettings = {
  enabled: false,
  endpoint: 'http://0.0.0.0:6006',
  projectName: 'bouno',
}

export const DEFAULT_SETTINGS: ProviderSettings = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKeys: {},
  openaiCompatible: {
    baseURL: 'http://localhost:11434/v1',
    name: 'ollama',
  },
  tracing: DEFAULT_TRACING_SETTINGS,
}

export const STORAGE_KEY = 'bouno_agent_settings'

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
