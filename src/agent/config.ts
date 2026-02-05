import type { ProviderType } from '@shared/settings'

export interface ModelConfig {
  id: string
  name: string
  vision: boolean
  recommended?: boolean
  contextLength?: number
}

export interface ProviderConfig {
  name: string
  description: string
  models: ModelConfig[]
  apiKeyPlaceholder: string
  apiKeyUrl?: string
}

export const PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  anthropic: {
    name: 'Anthropic',
    description: 'Claude models - best for agents',
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', vision: true, recommended: true },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', vision: true },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', vision: true },
    ],
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT models - most popular',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', vision: true, recommended: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', vision: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', vision: true },
      { id: 'o1', name: 'o1', vision: true },
      { id: 'o1-mini', name: 'o1 Mini', vision: false },
    ],
  },
  google: {
    name: 'Google Gemini',
    description: 'Gemini models - free tier available',
    apiKeyPlaceholder: 'AIza...',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', vision: true, recommended: true },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', vision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', vision: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', vision: true },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', vision: true },
    ],
  },
  groq: {
    name: 'Groq',
    description: 'Very fast inference',
    apiKeyPlaceholder: 'gsk_...',
    apiKeyUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', vision: false, recommended: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', vision: false },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', vision: false },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Access many models with one API key',
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyUrl: 'https://openrouter.ai/settings/keys',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', vision: true, recommended: true },
      { id: 'anthropic/claude-haiku-4', name: 'Claude Haiku 4', vision: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o', vision: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', vision: true },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', vision: true },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', vision: false },
    ],
  },
  'openai-compatible': {
    name: 'OpenAI Compatible',
    description: 'Custom endpoints (Ollama, LM Studio, etc.)',
    apiKeyPlaceholder: 'optional',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2 (Ollama)', vision: false, recommended: true },
      { id: 'qwen2.5', name: 'Qwen 2.5 (Ollama)', vision: false },
      { id: 'mistral', name: 'Mistral (Ollama)', vision: false },
      { id: 'custom', name: 'Custom Model', vision: false },
    ],
  },
}

export function getModelsForProvider(provider: ProviderType): ModelConfig[] {
  return PROVIDER_CONFIGS[provider]?.models || []
}

export function getDefaultModelForProvider(provider: ProviderType): string {
  const models = getModelsForProvider(provider)
  const recommended = models.find((m) => m.recommended)
  return recommended?.id || models[0]?.id || ''
}
