import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { ProviderSettings } from '@shared/settings'
import { wrapWithDebugMiddleware } from './debugMiddleware'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Agent:Provider]', ...args)
const logError = (...args: unknown[]) => console.error('[Agent:Provider]', ...args)

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
      logError(`[${providerName}] Fetch error:`, error)
      logError(`[${providerName}] Error details:`, {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      })
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

export function createProvider(settings: ProviderSettings): LanguageModel {
  log('createProvider called with:', {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: !!settings.apiKeys[settings.provider],
    openaiCompatible: settings.openaiCompatible,
  })

  const apiKey = settings.apiKeys[settings.provider]

  if (!apiKey && settings.provider !== 'openai-compatible') {
    logError('No API key for provider:', settings.provider)
    throw new ProviderError(`No API key configured for ${settings.provider}`)
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
  if (settings.provider !== 'openai-compatible') {
    if (!settings.apiKeys[settings.provider]) {
      return `Please enter your ${settings.provider} API key`
    }
  } else {
    if (!settings.openaiCompatible?.baseURL) {
      return 'Please enter the base URL for your OpenAI-compatible provider'
    }
  }

  if (!settings.model) {
    return 'Please select a model'
  }

  return null
}
