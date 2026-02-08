import type { ProviderType } from '@shared/settings'

export interface ModelConfig {
  id: string
  name: string
  vision: boolean
  recommended?: boolean
  contextLength?: number
  reasoning?: 'none' | 'hybrid' | 'always'
  codexOnly?: boolean  // Only available with Codex OAuth
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
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', vision: true, recommended: true, reasoning: 'hybrid' },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', vision: true, reasoning: 'hybrid' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', vision: true, reasoning: 'hybrid' },
    ],
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT models - Login with ChatGPT or use API key',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      // API key models
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', vision: true, recommended: true },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano', vision: true },
      // Codex models (ChatGPT Pro/Plus subscription required)
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', vision: true, codexOnly: true },
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', vision: true, codexOnly: true },
      { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', vision: true, codexOnly: true },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', vision: true, codexOnly: true },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', vision: true, codexOnly: true },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', vision: true, codexOnly: true, recommended: true },
    ],
  },
  google: {
    name: 'Google Gemini',
    description: 'Gemini models - free tier available',
    apiKeyPlaceholder: 'AIza...',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', vision: true, recommended: true, reasoning: 'always' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', vision: true, reasoning: 'always' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', vision: true, reasoning: 'always' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', vision: true, reasoning: 'always' },
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
  xai: {
    name: 'xAI',
    description: 'Grok models',
    apiKeyPlaceholder: 'xai-...',
    apiKeyUrl: 'https://console.x.ai',
    models: [
      { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning', vision: true, recommended: true, reasoning: 'always' },
      { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast', vision: true },
      { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', vision: false, reasoning: 'always' },
      { id: 'grok-4-fast-reasoning', name: 'Grok 4 Fast Reasoning', vision: true, reasoning: 'always' },
      { id: 'grok-4-fast-non-reasoning', name: 'Grok 4 Fast', vision: true },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Access many models with one API key',
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyUrl: 'https://openrouter.ai/settings/keys',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', vision: true, recommended: true, reasoning: 'hybrid' },
      { id: 'anthropic/claude-haiku-4', name: 'Claude Haiku 4', vision: true, reasoning: 'hybrid' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', vision: true },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', vision: true },
      { id: 'openai/o1', name: 'o1', vision: true, reasoning: 'hybrid' },
      { id: 'openai/o1-mini', name: 'o1 Mini', vision: false, reasoning: 'hybrid' },
      { id: 'openai/o3-mini', name: 'o3 Mini', vision: false, reasoning: 'hybrid' },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', vision: true, reasoning: 'always' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', vision: false, reasoning: 'always' },
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

export function getModelsForProvider(provider: ProviderType, hasCodexAuth?: boolean): ModelConfig[] {
  const models = PROVIDER_CONFIGS[provider]?.models || []

  // Filter Codex-only models if not authenticated with Codex
  if (provider === 'openai' && !hasCodexAuth) {
    return models.filter((m) => !m.codexOnly)
  }

  return models
}

export function getDefaultModelForProvider(provider: ProviderType): string {
  const models = getModelsForProvider(provider)
  const recommended = models.find((m) => m.recommended)
  return recommended?.id || models[0]?.id || ''
}

export function getModelConfig(provider: ProviderType, modelId: string): ModelConfig | undefined {
  const models = getModelsForProvider(provider)
  return models.find((m) => m.id === modelId)
}
