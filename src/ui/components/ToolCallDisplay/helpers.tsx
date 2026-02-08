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
    return JSON.stringify(value) || 'null'
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

/** Consumer-friendly one-liner. Uses past tense for completed/error, present for running/pending. */
export function getSummaryLabel(name: string, input: Record<string, unknown>, status?: string): string {
  // Only use present tense if explicitly running or pending; otherwise past tense
  const done = status !== 'running' && status !== 'pending'
  switch (name) {
    case 'computer': {
      const action = input.action as string
      const text = input.text as string
      switch (action) {
        case 'screenshot': return done ? 'Took a screenshot' : 'Taking a screenshot'
        case 'zoom': return done ? 'Zoomed in' : 'Zooming in'
        case 'wait': return done ? `Waited ${input.duration || 1}s` : 'Waiting'
        case 'left_click': return done ? 'Clicked' : 'Clicking'
        case 'right_click': return done ? 'Right-clicked' : 'Right-clicking'
        case 'double_click': return done ? 'Double-clicked' : 'Double-clicking'
        case 'triple_click': return done ? 'Selected text' : 'Selecting text'
        case 'type': return done
          ? (text ? `Typed "${str(text, 24)}"` : 'Typed text')
          : (text ? `Typing "${str(text, 24)}"` : 'Typing text')
        case 'key': return done
          ? (text ? `Pressed ${text}` : 'Pressed a key')
          : (text ? `Pressing ${text}` : 'Pressing a key')
        case 'scroll': {
          const dir = input.scroll_direction as string
          const direction = dir === 'up' ? 'up' : dir === 'left' || dir === 'right' ? dir : 'down'
          return done ? `Scrolled ${direction}` : `Scrolling ${direction}`
        }
        case 'scroll_to': return done ? 'Scrolled to element' : 'Scrolling to element'
        case 'hover': return done ? 'Hovered' : 'Hovering'
        case 'left_click_drag': return done ? 'Dragged element' : 'Dragging element'
        default: return done ? 'Interacted with page' : 'Interacting with page'
      }
    }
    case 'navigate': {
      const url = input.url as string
      if (url === 'back') return done ? 'Went back' : 'Going back'
      if (url === 'forward') return done ? 'Went forward' : 'Going forward'
      return done ? 'Navigated to page' : 'Navigating to page'
    }
    case 'find': return done ? `Searched for "${str(input.query, 24)}"` : `Searching for "${str(input.query, 24)}"`
    case 'read_page': return done ? 'Read the page' : 'Reading the page'
    case 'get_page_text': return done ? 'Extracted page text' : 'Extracting page text'
    case 'form_input': return done ? 'Filled in a form field' : 'Filling in a form field'
    case 'list_tabs': return done ? 'Checked open tabs' : 'Checking open tabs'
    case 'close_tab': return done ? 'Closed a tab' : 'Closing a tab'
    case 'create_tab': return done ? 'Opened a new tab' : 'Opening a new tab'
    case 'fetch_url': return done ? 'Fetched a page' : 'Fetching a page'
    case 'read_console_messages': return done ? 'Read console output' : 'Reading console output'
    case 'read_network_requests': return done ? 'Checked network activity' : 'Checking network activity'
    case 'run_javascript': return done ? 'Ran a script' : 'Running a script'
    case 'resize_window': return done ? 'Resized the window' : 'Resizing the window'
    case 'record_gif': {
      const a = input.action as string
      if (a === 'start_recording') return done ? 'Started recording' : 'Recording screen'
      if (a === 'stop_recording') return done ? 'Stopped recording' : 'Stopping recording'
      if (a === 'export') return done ? 'Exported GIF' : 'Exporting GIF'
      return done ? 'Recorded' : 'Recording'
    }
    case 'update_plan': return done ? 'Updated the plan' : 'Updating the plan'
    case 'invoke_skill': return done ? `Used "${str(input.skill_name, 20)}" skill` : `Using "${str(input.skill_name, 20)}" skill`
    case 'upload_image': return done ? 'Uploaded an image' : 'Uploading an image'
    case 'read_result': return done ? 'Read a result' : 'Reading a result'
    case 'process_result': return done ? 'Processed a result' : 'Processing a result'
    default: return formatToolName(name)
  }
}

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
    case 'list_tabs': return 'Listing tabs'
    case 'close_tab': return `Closing tab ${input.tabId}`
    case 'create_tab': return input.url ? `Opening ${truncUrl(input.url as string, 30)}` : 'Opening new tab'
    case 'fetch_url': return `Fetching ${truncUrl(input.url as string || '', 40)}`
    case 'read_console_messages': return 'Reading console'
    case 'read_network_requests': return 'Reading network requests'
    case 'run_javascript': return 'Executing JavaScript'
    case 'resize_window': return `Resizing to ${input.width}x${input.height}`
    case 'record_gif': {
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
