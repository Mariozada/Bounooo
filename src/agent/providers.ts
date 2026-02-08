import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createXai } from '@ai-sdk/xai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { ProviderSettings } from '@shared/settings'
import { wrapWithDebugMiddleware } from './debugMiddleware'
import { createCodexFetch, isTokenExpired, refreshAccessToken, createCodexAuth, CODEX_API_ENDPOINT } from '@auth/codex'
import type { CodexAuth } from '@auth/types'
import { loadSettings, saveSettings } from '@shared/settings'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Agent:Provider]', ...args)
const logError = (...args: unknown[]) => console.error('[Agent:Provider]', ...args)

function extractErrorDetails(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}

const createFetchWithLogging = (providerName: string, extraHeaders?: Record<string, string>) => {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = url.toString()

    // Merge extra headers if provided
    const headers = {
      ...Object.fromEntries(new Headers(init?.headers).entries()),
      ...extraHeaders,
    }

    const modifiedInit: RequestInit = {
      ...init,
      headers,
    }

    log(`[${providerName}] Fetching:`, urlStr)
    log(`[${providerName}] Request options:`, {
      method: modifiedInit?.method,
      headers: modifiedInit?.headers,
      bodyLength: modifiedInit?.body ? String(modifiedInit.body).length : 0,
    })

    try {
      const response = await fetch(url, modifiedInit)
      log(`[${providerName}] Response status:`, response.status, response.statusText)

      if (!response.ok) {
        const text = await response.text()
        logError(`[${providerName}] Error response body:`, text)
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      return response
    } catch (error) {
      const details = extractErrorDetails(error)
      const isAbortError =
        details.name === 'AbortError' ||
        details.message.toLowerCase().includes('aborted')

      if (isAbortError) {
        log(`[${providerName}] Fetch aborted:`, details.message)
      } else {
        logError(`[${providerName}] Fetch error: ${details.name}: ${details.message}`)
        if (details.stack) {
          logError(`[${providerName}] Error stack:`, details.stack)
        }
      }
      throw error
    }
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

/**
 * Create a Codex-enabled OpenAI provider
 * Uses OAuth tokens instead of API key
 *
 * Codex uses OpenAI's Responses API, not Chat Completions
 */
function createCodexProvider(settings: ProviderSettings): LanguageModel {
  if (!settings.codexAuth) {
    throw new ProviderError('Codex authentication required')
  }

  log('Creating Codex provider with model:', settings.model)

  // Create custom fetch that handles OAuth and URL rewriting
  const codexFetch = createCodexFetch(
    // Get current auth
    async () => {
      const currentSettings = await loadSettings()
      return currentSettings.codexAuth
    },
    // Update auth after refresh
    async (newAuth: CodexAuth) => {
      const currentSettings = await loadSettings()
      currentSettings.codexAuth = newAuth
      await saveSettings(currentSettings)
      log('Codex auth updated after token refresh')
    }
  )

  // Create OpenAI provider with Codex fetch
  // Use standard OpenAI base URL - the fetch wrapper will rewrite to Codex endpoint
  const openai = createOpenAI({
    apiKey: 'codex-oauth', // Placeholder, actual auth is in fetch
    baseURL: 'https://api.openai.com/v1', // Standard URL, will be rewritten by codexFetch
    fetch: async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString()
      log('[Codex] Fetching:', urlStr)
      log('[Codex] Request body preview:', init?.body ? String(init.body).slice(0, 500) : 'none')
      try {
        const response = await codexFetch(url, init)
        log('[Codex] Response status:', response.status, response.statusText)

        // Clone response to read body for logging without consuming it
        if (!response.ok) {
          const cloned = response.clone()
          const errorText = await cloned.text()
          logError('[Codex] Error response:', errorText)
        }

        return response
      } catch (error) {
        logError('[Codex] Fetch error:', error)
        throw error
      }
    },
  })

  // Use the Responses API for Codex models (not Chat Completions)
  const model = openai.responses(settings.model)
  log('Codex model created:', model)
  return wrapWithDebugMiddleware(model)
}

export function createProvider(settings: ProviderSettings): LanguageModel {
  log('createProvider called with:', {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: !!settings.apiKeys[settings.provider],
    openaiCompatible: settings.openaiCompatible,
  })

  const apiKey = settings.apiKeys[settings.provider]

  // Allow OpenAI without API key if using Codex OAuth
  if (!apiKey && settings.provider !== 'openai-compatible') {
    if (settings.provider === 'openai' && settings.codexAuth) {
      // Codex OAuth is available, will be used instead
      log('Using Codex OAuth instead of API key')
    } else {
      logError('No API key for provider:', settings.provider)
      throw new ProviderError(`No API key configured for ${settings.provider}`)
    }
  }

  try {
    switch (settings.provider) {
      case 'anthropic': {
        log('Creating Anthropic provider...')
        const anthropic = createAnthropic({
          apiKey,
          fetch: createFetchWithLogging('Anthropic', {
            'anthropic-dangerous-direct-browser-access': 'true',
          }),
        })
        const model = anthropic(settings.model)
        log('Anthropic model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      case 'openai': {
        // Check if using Codex OAuth
        if (settings.codexAuth) {
          log('Creating OpenAI provider with Codex OAuth...')
          return createCodexProvider(settings)
        }

        log('Creating OpenAI provider...')
        const openai = createOpenAI({
          apiKey,
          fetch: createFetchWithLogging('OpenAI'),
        })
        const model = openai(settings.model)
        log('OpenAI model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      case 'google': {
        log('Creating Google provider...')
        const google = createGoogleGenerativeAI({
          apiKey,
          fetch: createFetchWithLogging('Google'),
        })
        const model = google(settings.model)
        log('Google model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      case 'groq': {
        log('Creating Groq provider...')
        const groq = createGroq({
          apiKey,
          fetch: createFetchWithLogging('Groq'),
        })
        const model = groq(settings.model)
        log('Groq model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      case 'xai': {
        log('Creating xAI provider...')
        const xai = createXai({
          apiKey,
          fetch: createFetchWithLogging('xAI'),
        })
        const model = xai(settings.model)
        log('xAI model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      case 'openrouter': {
        log('Creating OpenRouter provider...')
        const openrouter = createOpenRouter({
          apiKey,
          fetch: createFetchWithLogging('OpenRouter'),
        })
        const model = openrouter(settings.model)
        log('OpenRouter model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      case 'openai-compatible': {
        log('Creating OpenAI-compatible provider...')
        const config = settings.openaiCompatible
        if (!config?.baseURL) {
          logError('No baseURL for openai-compatible')
          throw new ProviderError('Base URL required for OpenAI-compatible provider')
        }

        log('OpenAI-compatible config:', config)
        const compatible = createOpenAICompatible({
          name: config.name || 'custom',
          baseURL: config.baseURL,
          apiKey: apiKey || 'not-needed',
          fetch: createFetchWithLogging('OpenAI-Compatible'),
        })
        const model = compatible(settings.model)
        log('OpenAI-compatible model created:', model)
        return wrapWithDebugMiddleware(model)
      }

      default:
        logError('Unknown provider:', settings.provider)
        throw new ProviderError(`Unknown provider: ${settings.provider}`)
    }
  } catch (error) {
    logError('Error creating provider:', error)
    throw error
  }
}

export function validateSettings(settings: ProviderSettings): string | null {
  if (settings.provider === 'openai-compatible') {
    if (!settings.openaiCompatible?.baseURL) {
      return 'Please enter the base URL for your OpenAI-compatible provider'
    }
  } else if (settings.provider === 'openai') {
    // OpenAI can use either API key or Codex OAuth
    if (!settings.apiKeys[settings.provider] && !settings.codexAuth) {
      return 'Please enter your OpenAI API key or login with ChatGPT'
    }
  } else {
    if (!settings.apiKeys[settings.provider]) {
      return `Please enter your ${settings.provider} API key`
    }
  }

  if (!settings.model) {
    return 'Please select a model'
  }

  return null
}
