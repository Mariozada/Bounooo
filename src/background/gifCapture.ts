import { addFrame, isGifRecordingActive } from '@tools/index'
import type { GifFrameMetadata } from '@shared/types'

function asNumberPair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [x, y] = value
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined
  }
  return [Math.round(x), Math.round(y)]
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asPrimitive(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return undefined
}

function buildGifFrameMetadata(tool: string, params: Record<string, unknown>): GifFrameMetadata {
  if (tool === 'computer') {
    const actionType = asString(params.action)
    const scrollDirection = asString(params.scroll_direction)
    return {
      tool,
      actionType,
      coordinate: asNumberPair(params.coordinate),
      startCoordinate: asNumberPair(params.start_coordinate),
      ref: asString(params.ref),
      text: actionType === 'scroll' ? scrollDirection : asString(params.text),
    }
  }

  if (tool === 'form_input') {
    return {
      tool,
      actionType: 'form_input',
      ref: asString(params.ref),
      value: asPrimitive(params.value),
    }
  }

  if (tool === 'navigate') {
    return {
      tool,
      actionType: 'navigate',
      url: asString(params.url),
    }
  }

  if (tool === 'upload_image') {
    return {
      tool,
      actionType: 'upload_image',
      coordinate: asNumberPair(params.coordinate),
      ref: asString(params.ref),
      text: asString(params.filename),
    }
  }

  return {
    tool,
    actionType: tool,
  }
}

export async function autoCaptureGifFrame(
  tool: string,
  params: Record<string, unknown>,
  result?: { result?: unknown }
): Promise<void> {
  if (!isGifRecordingActive()) return

  let tabId = params.tabId as number | undefined
  if (!tabId && tool === 'tabs_create') {
    tabId = (result?.result as { id?: number } | undefined)?.id
  }
  if (!tabId) return

  try {
    const tab = await chrome.tabs.get(tabId)
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    addFrame(tabId, dataUrl, buildGifFrameMetadata(tool, params))
  } catch (err) {
    console.warn('[Bouno:background] Auto GIF frame capture failed:', err)
  }
}
