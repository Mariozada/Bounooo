import { wrapLanguageModel, type LanguageModel } from 'ai'
import type { LanguageModelV2Middleware, LanguageModelV2StreamPart } from '@ai-sdk/provider'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[Agent:DebugMiddleware]', ...args)

/**
 * Captured SDK-level parameters from middleware.
 * This represents the ACTUAL params sent to the LLM provider.
 */
export interface CapturedSDKParams {
  // Request info
  requestId: string
  capturedAt: number

  // The actual prompt sent to the provider
  prompt: unknown  // LanguageModelV2Prompt - messages in SDK format

  // Model settings
  maxTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stopSequences?: string[]
  seed?: number

  // Provider options (thinking config, reasoning effort, etc.)
  providerMetadata?: Record<string, unknown>

  // Tools
  tools?: unknown[]
  toolChoice?: unknown

  // Response (filled after completion)
  response?: {
    text?: string
    finishReason?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
    }
  }
}

// Store for captured params, keyed by requestId
const capturedParamsStore = new Map<string, CapturedSDKParams>()

// Cleanup old entries after 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
const MAX_AGE_MS = 5 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [id, params] of capturedParamsStore.entries()) {
    if (now - params.capturedAt > MAX_AGE_MS) {
      capturedParamsStore.delete(id)
    }
  }
}, CLEANUP_INTERVAL_MS)

/**
 * Get captured params by request ID
 */
export function getCapturedParams(requestId: string): CapturedSDKParams | undefined {
  return capturedParamsStore.get(requestId)
}

/**
 * Clear captured params (call after tracing is done)
 */
export function clearCapturedParams(requestId: string): void {
  capturedParamsStore.delete(requestId)
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Debug middleware that captures the actual SDK-level params sent to the LLM.
 *
 * Usage:
 * 1. Generate a requestId: const requestId = generateRequestId()
 * 2. Pass to streamText: providerOptions: { debugMiddleware: { requestId } }
 * 3. After streaming: const params = getCapturedParams(requestId)
 */
export const debugMiddleware: LanguageModelV2Middleware = {
  wrapStream: async ({ doStream, params }) => {
    // Extract our requestId from provider metadata
    const metadata = params.providerMetadata?.debugMiddleware as { requestId?: string } | undefined
    const requestId = metadata?.requestId

    if (!requestId) {
      log('No requestId provided, skipping capture')
      return doStream()
    }

    log(`Capturing params for request: ${requestId}`)

    // Capture the SDK-level params
    const captured: CapturedSDKParams = {
      requestId,
      capturedAt: Date.now(),
      prompt: params.prompt,
      maxTokens: params.maxTokens,
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      frequencyPenalty: params.frequencyPenalty,
      presencePenalty: params.presencePenalty,
      stopSequences: params.stopSequences,
      seed: params.seed,
      providerMetadata: params.providerMetadata,
      tools: params.tools,
      toolChoice: params.toolChoice,
    }

    // Store immediately so it's available during streaming
    capturedParamsStore.set(requestId, captured)

    log(`Captured params:`, {
      requestId,
      promptLength: JSON.stringify(params.prompt).length,
      hasTools: !!params.tools?.length,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      providerMetadata: Object.keys(params.providerMetadata || {}),
    })

    // Call the actual LLM
    const { stream, ...rest } = await doStream()

    // Transform stream to capture response details
    let fullText = ''
    let finishReason: string | undefined
    let promptTokens: number | undefined
    let completionTokens: number | undefined

    const transformStream = new TransformStream<
      LanguageModelV2StreamPart,
      LanguageModelV2StreamPart
    >({
      transform(chunk, controller) {
        // Capture response data from chunks
        if (chunk.type === 'text-delta') {
          fullText += chunk.textDelta
        } else if (chunk.type === 'finish') {
          finishReason = chunk.finishReason
          promptTokens = chunk.usage?.promptTokens
          completionTokens = chunk.usage?.completionTokens
        }

        controller.enqueue(chunk)
      },

      flush() {
        // Update captured params with response
        const stored = capturedParamsStore.get(requestId)
        if (stored) {
          stored.response = {
            text: fullText,
            finishReason,
            usage: {
              promptTokens,
              completionTokens,
            },
          }
          log(`Updated response for request ${requestId}:`, {
            textLength: fullText.length,
            finishReason,
            promptTokens,
            completionTokens,
          })
        }
      },
    })

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    }
  },
}

/**
 * Wrap a language model with the debug middleware.
 */
export function wrapWithDebugMiddleware(model: LanguageModel): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: debugMiddleware,
  })
}

/**
 * Format captured params for display/tracing.
 * This creates a human-readable summary of what was sent to the LLM.
 */
export function formatCapturedParams(params: CapturedSDKParams): {
  sdkMessages: string
  sdkSettings: Record<string, unknown>
  sdkProviderOptions: Record<string, unknown>
} {
  // Format messages for readability
  const prompt = params.prompt as { messages?: unknown[]; system?: string } | undefined

  let sdkMessages = ''
  if (prompt?.system) {
    sdkMessages += `[SYSTEM]\n${prompt.system}\n\n`
  }
  if (prompt?.messages && Array.isArray(prompt.messages)) {
    for (const msg of prompt.messages) {
      const m = msg as { role?: string; content?: unknown }
      sdkMessages += `[${(m.role || 'unknown').toUpperCase()}]\n`
      if (typeof m.content === 'string') {
        sdkMessages += m.content
      } else {
        sdkMessages += JSON.stringify(m.content, null, 2)
      }
      sdkMessages += '\n\n'
    }
  }

  // Collect non-null settings
  const sdkSettings: Record<string, unknown> = {}
  if (params.maxTokens !== undefined) sdkSettings.maxTokens = params.maxTokens
  if (params.temperature !== undefined) sdkSettings.temperature = params.temperature
  if (params.topP !== undefined) sdkSettings.topP = params.topP
  if (params.topK !== undefined) sdkSettings.topK = params.topK
  if (params.frequencyPenalty !== undefined) sdkSettings.frequencyPenalty = params.frequencyPenalty
  if (params.presencePenalty !== undefined) sdkSettings.presencePenalty = params.presencePenalty
  if (params.stopSequences?.length) sdkSettings.stopSequences = params.stopSequences
  if (params.seed !== undefined) sdkSettings.seed = params.seed

  // Extract provider options (excluding our debug metadata)
  const sdkProviderOptions: Record<string, unknown> = {}
  if (params.providerMetadata) {
    for (const [key, value] of Object.entries(params.providerMetadata)) {
      if (key !== 'debugMiddleware') {
        sdkProviderOptions[key] = value
      }
    }
  }

  return {
    sdkMessages,
    sdkSettings,
    sdkProviderOptions,
  }
}
