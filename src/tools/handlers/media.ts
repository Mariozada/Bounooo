import { registerTool } from '../registry'
import type { GifRecordingState, GifFrame, GifFrameMetadata } from '@shared/types'
import { MAX_GIF_FRAMES } from '@shared/constants'

const recordingState: GifRecordingState = {
  recording: false,
  frames: []
}

interface GifExportOptions {
  showClickIndicators?: boolean
  showDragPaths?: boolean
  showActionLabels?: boolean
  showProgressBar?: boolean
  showWatermark?: boolean
  quality?: number
}

interface AnnotatedFrame {
  frame: GifFrame
  annotatedDataUrl: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sanitizeCoordinate(value?: [number, number]): [number, number] | undefined {
  if (!value || value.length !== 2) return undefined
  const [x, y] = value
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  return [Math.round(x), Math.round(y)]
}

function drawDot(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 10
): void {
  ctx.save()
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.85
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.lineWidth = 2
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#ffffff'
  ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawRing(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
): void {
  ctx.save()
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.8
  ctx.arc(x, y, 18, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawArrow(
  ctx: OffscreenCanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
): void {
  const headLength = 12
  const angle = Math.atan2(toY - fromY, toX - fromX)

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 4
  ctx.globalAlpha = 0.9
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  )
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  )
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawLabel(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  const fontSize = 14
  const paddingX = 8
  const paddingY = 6

  ctx.save()
  ctx.font = `${fontSize}px sans-serif`

  let label = text
  while (label.length > 1 && ctx.measureText(label).width > maxWidth - 24) {
    label = `${label.slice(0, -2)}...`
  }

  const textWidth = ctx.measureText(label).width
  const boxWidth = Math.min(maxWidth, textWidth + paddingX * 2)
  const boxHeight = fontSize + paddingY * 2

  const safeX = clamp(x, 8, maxWidth - boxWidth - 8)
  const safeY = Math.max(8, y)

  ctx.fillStyle = 'rgba(17, 24, 39, 0.86)'
  ctx.fillRect(safeX, safeY, boxWidth, boxHeight)

  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, safeX + paddingX, safeY + boxHeight / 2)
  ctx.restore()
}

function drawNavigateOverlay(
  ctx: OffscreenCanvasRenderingContext2D,
  url: string,
  width: number
): void {
  ctx.save()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'
  ctx.fillRect(0, 0, width, 34)
  ctx.restore()
  drawLabel(ctx, `Navigate: ${url}`, 8, 4, width - 16)
}

function getAnchor(
  frame: GifFrame,
  width: number,
  height: number
): [number, number] {
  const candidate = frame.coordinate || frame.startCoordinate
  if (candidate) {
    return [
      clamp(candidate[0], 8, Math.max(8, width - 8)),
      clamp(candidate[1], 8, Math.max(8, height - 8))
    ]
  }
  return [Math.round(width * 0.5), Math.round(height * 0.5)]
}

function drawFrameAnnotation(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: GifFrame,
  width: number,
  height: number,
  options: Required<GifExportOptions>
): void {
  const actionType = frame.actionType || frame.action || frame.tool || 'tool'
  const [x, y] = getAnchor(frame, width, height)

  if (actionType === 'navigate') {
    drawNavigateOverlay(ctx, frame.url || 'about:blank', width)
  }

  if (options.showClickIndicators) {
    switch (actionType) {
      case 'left_click':
        drawDot(ctx, x, y, '#ef4444')
        break
      case 'right_click':
        drawDot(ctx, x, y, '#3b82f6')
        break
      case 'double_click':
        drawDot(ctx, x, y, '#f59e0b', 12)
        break
      case 'triple_click':
        drawDot(ctx, x, y, '#0ea5e9', 14)
        break
      case 'hover':
        drawRing(ctx, x, y, '#10b981')
        break
      default:
        break
    }
  }

  if (actionType === 'scroll') {
    const direction = frame.text || 'down'
    const delta = 60
    let fromX = width / 2
    let fromY = height / 2
    let toX = fromX
    let toY = fromY + delta

    if (direction === 'up') toY = fromY - delta
    if (direction === 'left') {
      toX = fromX - delta
      toY = fromY
    }
    if (direction === 'right') {
      toX = fromX + delta
      toY = fromY
    }

    drawArrow(ctx, fromX, fromY, toX, toY, '#22c55e')
  }

  if (actionType === 'left_click_drag' && options.showDragPaths) {
    const start = frame.startCoordinate
    const end = frame.coordinate
    if (start && end) {
      drawArrow(ctx, start[0], start[1], end[0], end[1], '#fb7185')
    }
  }

  if (options.showActionLabels) {
    const showTypeLabel = actionType === 'type' || actionType === 'key'
    const showFormLabel = actionType === 'form_input'
    const typeText = frame.text ? `Typed: ${frame.text}` : actionType
    const formText = frame.value !== undefined ? `Value: ${String(frame.value)}` : 'form_input'

    if (showTypeLabel) {
      drawLabel(ctx, typeText, x + 12, y + 12, width - 16)
    }
    if (showFormLabel) {
      drawLabel(ctx, formText, x + 12, y + 12, width - 16)
    }

    const baseLabel = frame.ref
      ? `${actionType} @ ${frame.ref}`
      : `${actionType}${frame.tool ? ` (${frame.tool})` : ''}`
    drawLabel(ctx, `Tab ${frame.tabId} • ${baseLabel}`, 8, height - 36, width - 16)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return `data:${blob.type};base64,${bytesToBase64(bytes)}`
}

async function annotateFrame(
  frame: GifFrame,
  options: Required<GifExportOptions>
): Promise<string> {
  try {
    const sourceBlob = await fetch(frame.dataUrl).then(res => res.blob())
    const bitmap = await createImageBitmap(sourceBlob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return frame.dataUrl
    }

    ctx.drawImage(bitmap, 0, 0)
    drawFrameAnnotation(ctx, frame, canvas.width, canvas.height, options)
    bitmap.close()

    const outputBlob = await canvas.convertToBlob({ type: 'image/png' })
    return blobToDataUrl(outputBlob)
  } catch (err) {
    console.warn('[Bouno:media] Failed to annotate frame, using original:', err)
    return frame.dataUrl
  }
}

async function buildAnnotatedFrames(
  frames: GifFrame[],
  options: Required<GifExportOptions>
): Promise<AnnotatedFrame[]> {
  const annotated: AnnotatedFrame[] = []
  for (const frame of frames) {
    const annotatedDataUrl = await annotateFrame(frame, options)
    annotated.push({ frame, annotatedDataUrl })
  }
  return annotated
}

export function isGifRecordingActive(): boolean {
  return recordingState.recording
}

export function addFrame(
  tabId: number,
  dataUrl: string,
  metadata?: GifFrameMetadata
): void {
  if (!recordingState.recording) return

  const frame: GifFrame = {
    dataUrl,
    timestamp: Date.now(),
    tabId,
    tool: metadata?.tool,
    actionType: metadata?.actionType,
    coordinate: sanitizeCoordinate(metadata?.coordinate),
    startCoordinate: sanitizeCoordinate(metadata?.startCoordinate),
    ref: metadata?.ref,
    text: metadata?.text,
    value: metadata?.value,
    url: metadata?.url,
    action: metadata?.actionType || metadata?.tool
  }

  recordingState.frames.push(frame)

  if (recordingState.frames.length > MAX_GIF_FRAMES) {
    recordingState.frames.shift()
  }
}

async function gifCreator(params: {
  action: string
  coordinate?: [number, number]
  download?: boolean
  filename?: string
  options?: GifExportOptions
}): Promise<unknown> {
  const { action, coordinate, download = false, filename, options = {} } = params

  if (!action) throw new Error('action is required')

  switch (action) {
    case 'start_recording': {
      recordingState.recording = true
      recordingState.frames = []
      recordingState.startTime = Date.now()

      return {
        status: 'recording_started',
        message: 'GIF recording started. Frames will be captured automatically after each successful tool call.'
      }
    }

    case 'stop_recording': {
      recordingState.recording = false

      const orderedFrames = [...recordingState.frames].sort((a, b) => a.timestamp - b.timestamp)
      const duration = orderedFrames.length > 1
        ? orderedFrames[orderedFrames.length - 1].timestamp - orderedFrames[0].timestamp
        : 0

      return {
        status: 'recording_stopped',
        frameCount: orderedFrames.length,
        duration,
        message: 'Recording stopped. Use export action to prepare annotated frames.'
      }
    }

    case 'export': {
      if (recordingState.frames.length === 0) {
        throw new Error('No frames recorded. Start recording and run actions first.')
      }

      const resolvedOptions: Required<GifExportOptions> = {
        showClickIndicators: options.showClickIndicators ?? true,
        showDragPaths: options.showDragPaths ?? true,
        showActionLabels: options.showActionLabels ?? true,
        showProgressBar: options.showProgressBar ?? true,
        showWatermark: options.showWatermark ?? true,
        quality: options.quality ?? 10
      }

      const orderedFrames = [...recordingState.frames].sort((a, b) => a.timestamp - b.timestamp)
      const annotatedFrames = await buildAnnotatedFrames(orderedFrames, resolvedOptions)

      const exportData = {
        frames: annotatedFrames.map(({ frame, annotatedDataUrl }, i) => ({
          index: i,
          timestamp: frame.timestamp,
          tabId: frame.tabId,
          tool: frame.tool,
          actionType: frame.actionType,
          coordinate: frame.coordinate,
          startCoordinate: frame.startCoordinate,
          ref: frame.ref,
          text: frame.text,
          value: frame.value,
          url: frame.url,
          ...(i === 0 ? { previewDataUrl: annotatedDataUrl } : {})
        })),
        frameCount: annotatedFrames.length,
        totalDuration: annotatedFrames.length > 1
          ? annotatedFrames[annotatedFrames.length - 1].frame.timestamp - annotatedFrames[0].frame.timestamp
          : 0,
        annotationsApplied: true,
        options: resolvedOptions
      }

      if (download) {
        return {
          status: 'exported',
          filename: filename || `recording-${Date.now()}.gif`,
          download: true,
          ...exportData,
          message: 'Annotated GIF export prepared.'
        }
      }

      if (coordinate) {
        return {
          status: 'exported',
          coordinate,
          ...exportData,
          message: 'Annotated GIF prepared for drag & drop upload.'
        }
      }

      throw new Error('Either download: true or coordinate must be provided for export')
    }

    case 'clear': {
      recordingState.recording = false
      recordingState.frames = []
      recordingState.startTime = undefined

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
