/** Media Tools: gif_creator */

import { registerTool } from '../registry'
import type { GifRecordingState, GifFrame } from '@shared/types'
import { MAX_GIF_FRAMES } from '@shared/constants'

const recordingState = new Map<number, GifRecordingState>()

function getRecordingState(tabId: number): GifRecordingState {
  if (!recordingState.has(tabId)) {
    recordingState.set(tabId, {
      recording: false,
      frames: [],
      actions: []
    })
  }
  return recordingState.get(tabId)!
}

export function addFrame(tabId: number, dataUrl: string, action?: string): void {
  const state = getRecordingState(tabId)
  if (!state.recording) return

  state.frames.push({
    dataUrl,
    timestamp: Date.now(),
    action
  })

  if (action) {
    state.actions.push(action)
  }

  if (state.frames.length > MAX_GIF_FRAMES) {
    state.frames.shift()
  }
}

async function gifCreator(params: {
  action: string
  tabId: number
  coordinate?: [number, number]
  download?: boolean
  filename?: string
  options?: {
    showClickIndicators?: boolean
    showDragPaths?: boolean
    showActionLabels?: boolean
    showProgressBar?: boolean
    showWatermark?: boolean
    quality?: number
  }
}): Promise<unknown> {
  const { action, tabId, coordinate, download = false, filename, options = {} } = params

  if (!tabId) throw new Error('tabId is required')
  if (!action) throw new Error('action is required')

  const state = getRecordingState(tabId)

  switch (action) {
    case 'start_recording': {
      state.recording = true
      state.frames = []
      state.actions = []
      state.startTime = Date.now()

      return {
        status: 'recording_started',
        message: 'GIF recording started. Take a screenshot immediately after to capture the initial state.'
      }
    }

    case 'stop_recording': {
      state.recording = false

      return {
        status: 'recording_stopped',
        frameCount: state.frames.length,
        duration: state.frames.length > 0
          ? state.frames[state.frames.length - 1].timestamp - state.frames[0].timestamp
          : 0,
        message: 'Recording stopped. Use export action to generate GIF.'
      }
    }

    case 'export': {
      if (state.frames.length === 0) {
        throw new Error('No frames recorded. Start recording and take screenshots first.')
      }

      const {
        showClickIndicators = true,
        showDragPaths = true,
        showActionLabels = true,
        showProgressBar = true,
        showWatermark = true,
        quality = 10
      } = options

      const exportData = {
        frames: state.frames.map((f: GifFrame, i: number) => ({
          index: i,
          timestamp: f.timestamp,
          action: f.action,
          ...(i === 0 ? { previewDataUrl: f.dataUrl } : {})
        })),
        frameCount: state.frames.length,
        totalDuration: state.frames.length > 1
          ? state.frames[state.frames.length - 1].timestamp - state.frames[0].timestamp
          : 0,
        options: {
          showClickIndicators,
          showDragPaths,
          showActionLabels,
          showProgressBar,
          showWatermark,
          quality
        }
      }

      if (download) {
        return {
          status: 'exported',
          filename: filename || `recording-${Date.now()}.gif`,
          download: true,
          ...exportData,
          message: 'GIF export prepared.'
        }
      }

      if (coordinate) {
        return {
          status: 'exported',
          coordinate,
          ...exportData,
          message: 'GIF prepared for drag & drop upload.'
        }
      }

      throw new Error('Either download: true or coordinate must be provided for export')
    }

    case 'clear': {
      state.recording = false
      state.frames = []
      state.actions = []

      return {
        status: 'cleared',
        message: 'Recording frames cleared.'
      }
    }

    default:
      throw new Error(`Unknown gif_creator action: ${action}`)
  }
}

export function registerMediaTools(): void {
  registerTool('gif_creator', gifCreator as (params: Record<string, unknown>) => Promise<unknown>)
}
