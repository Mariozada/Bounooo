import type { FC, ReactNode } from 'react'
import type { ToolCallInfo } from '@agent/index'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolCallDisplayProps {
  toolCall: ToolCallInfo
  defaultExpanded?: boolean
  showHeader?: boolean
  allowCollapse?: boolean
}

export interface ToolRendererProps {
  input: Record<string, unknown>
  result: unknown
  status: ToolCallInfo['status']
  error?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const STATUS_ICONS: Record<ToolCallInfo['status'], string> = {
  pending: '○',
  running: '◐',
  completed: '●',
  error: '✕',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatToolName(name: string): string {
  if (!name) return 'Unknown Tool'
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function str(value: unknown, maxLen = 100): string {
  try {
    if (value === null) return 'null'
    if (value === undefined) return ''
    if (typeof value === 'string') {
      return value.length > maxLen ? value.slice(0, maxLen) + '...' : value
    }
    const s = JSON.stringify(value)
    return s.length > maxLen ? s.slice(0, maxLen) + '...' : s
  } catch {
    return '[Unable to display]'
  }
}

export function obj(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function truncUrl(url: string, max = 60): string {
  if (url.length <= max) return url
  try {
    const u = new URL(url)
    const path = u.pathname + u.search
    if (path.length > 30) {
      return u.host + path.slice(0, 27) + '...'
    }
    return u.host + path
  } catch {
    return url.slice(0, max) + '...'
  }
}

export function formatJson(value: unknown): string {
  try {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2) || 'null'
  } catch {
    return '[Unable to display JSON]'
  }
}

// ─── Small UI Primitives ─────────────────────────────────────────────────────

export const Badge: FC<{ variant?: string; children: ReactNode }> = ({ variant, children }) => (
  <span className={`tool-badge${variant ? ` tool-badge--${variant}` : ''}`}>{children}</span>
)

export const KV: FC<{ label: string; value: ReactNode }> = ({ label, value }) => (
  <div className="tool-kv">
    <span className="tool-kv-label">{label}</span>
    <span className="tool-kv-value">{value}</span>
  </div>
)

export const Divider: FC = () => <div className="tool-divider" />

// ─── Running State Labels ────────────────────────────────────────────────────

export function getRunningLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'computer': {
      const action = input.action as string
      const ref = input.ref as string
      const text = input.text as string
      switch (action) {
        case 'screenshot': return 'Taking screenshot'
        case 'zoom': return 'Zooming into region'
        case 'wait': return `Waiting ${input.duration || 1}s`
        case 'left_click': return ref ? `Clicking ${ref}` : 'Clicking'
        case 'right_click': return ref ? `Right-clicking ${ref}` : 'Right-clicking'
        case 'double_click': return ref ? `Double-clicking ${ref}` : 'Double-clicking'
        case 'triple_click': return ref ? `Triple-clicking ${ref}` : 'Triple-clicking'
        case 'type': return text ? `Typing "${str(text, 20)}"` : 'Typing'
        case 'key': return text ? `Pressing ${text}` : 'Pressing key'
        case 'scroll': return `Scrolling ${input.scroll_direction || 'down'}`
        case 'scroll_to': return ref ? `Scrolling to ${ref}` : 'Scrolling to element'
        case 'hover': return ref ? `Hovering ${ref}` : 'Hovering'
        case 'left_click_drag': return 'Dragging'
        default: return `${action}`
      }
    }
    case 'navigate': {
      const url = input.url as string
      if (url === 'back') return 'Going back'
      if (url === 'forward') return 'Going forward'
      return `Navigating to ${truncUrl(url || '', 40)}`
    }
    case 'find': return `Searching for "${str(input.query, 30)}"`
    case 'read_page': return input.ref_id ? `Reading ${input.ref_id}` : `Reading page (${input.filter || 'all'})`
    case 'get_page_text': return 'Extracting page text'
    case 'form_input': return `Setting ${input.ref} to "${str(input.value, 20)}"`
    case 'tabs_context': return 'Listing tabs'
    case 'tabs_create': return input.url ? `Opening ${truncUrl(input.url as string, 30)}` : 'Opening new tab'
    case 'web_fetch': return `Fetching ${truncUrl(input.url as string || '', 40)}`
    case 'read_console_messages': return 'Reading console'
    case 'read_network_requests': return 'Reading network requests'
    case 'javascript_tool': return 'Executing JavaScript'
    case 'resize_window': return `Resizing to ${input.width}x${input.height}`
    case 'gif_creator': {
      const a = input.action as string
      if (a === 'start_recording') return 'Starting recording'
      if (a === 'stop_recording') return 'Stopping recording'
      if (a === 'export') return 'Exporting GIF'
      if (a === 'clear') return 'Clearing frames'
      return a
    }
    case 'update_plan': return 'Creating plan'
    case 'invoke_skill': return `Invoking skill "${str(input.skill_name, 20)}"`
    case 'upload_image': return 'Uploading image'
    case 'read_result': return `Reading ${input.result_id}`
    case 'process_result': return `Processing ${input.result_id}`
    default: {
      const entries = Object.entries(input).slice(0, 2)
      if (entries.length === 0) return 'No parameters'
      return entries.map(([k, v]) => `${k}: ${str(v, 30)}`).join(', ')
    }
  }
}
