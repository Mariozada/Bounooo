import { useState, useCallback, type FC } from 'react'
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
} from 'lucide-react'
import type { ScheduledShortcut } from '@storage/types'

interface ShortcutListProps {
  shortcuts: ScheduledShortcut[]
  onEdit: (shortcut: ScheduledShortcut) => void
  onDelete: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  onRunNow: (id: string) => void
  onCreate: () => void
}

function formatSchedule(shortcut: ScheduledShortcut): string {
  if (shortcut.schedule.type === 'once') {
    if (!shortcut.schedule.date) return 'Once (no date set)'
    return `Once: ${new Date(shortcut.schedule.date).toLocaleString()}`
  }
  return shortcut.schedule.label ?? `Every ${shortcut.schedule.intervalMinutes} min`
}

function formatLastRun(shortcut: ScheduledShortcut): string {
  if (!shortcut.lastRunAt) return 'Never run'
  const ago = Date.now() - shortcut.lastRunAt
  if (ago < 60_000) return 'Just now'
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m ago`
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)}h ago`
  return new Date(shortcut.lastRunAt).toLocaleDateString()
}

export const ShortcutList: FC<ShortcutListProps> = ({
  shortcuts,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
  onCreate,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id)
      setDeleteConfirmId(null)
    },
    [onDelete]
  )

  return (
    <div className="shortcut-list">
      <div className="shortcut-list-header">
        <h3>Shortcuts</h3>
        <button
          type="button"
          className="shortcut-add-btn"
          onClick={onCreate}
          title="Create shortcut"
        >
          <Plus size={16} />
        </button>
      </div>

      {shortcuts.length === 0 ? (
        <div className="shortcut-list-empty">
          <Timer size={24} />
          <p>No shortcuts yet</p>
          <p className="shortcut-list-empty-hint">
            Create a shortcut to schedule automated browser tasks.
          </p>
        </div>
      ) : (
        <div className="shortcut-list-items">
          {shortcuts.map((s) => (
            <div key={s.id} className={`shortcut-item ${!s.enabled ? 'disabled' : ''}`}>
              <div className="shortcut-item-main">
                <div className="shortcut-item-header">
                  <span className="shortcut-item-name">/{s.name}</span>
                  <div className="shortcut-item-status">
                    {s.lastRunStatus === 'success' && (
                      <CheckCircle size={14} className="status-success" />
                    )}
                    {s.lastRunStatus === 'error' && (
                      <XCircle size={14} className="status-error" />
                    )}
                  </div>
                </div>

                <div className="shortcut-item-prompt">{s.prompt}</div>

                <div className="shortcut-item-meta">
                  <span className="shortcut-item-schedule">
                    <Clock size={12} />
                    {formatSchedule(s)}
                  </span>
                  <span className="shortcut-item-lastrun">{formatLastRun(s)}</span>
                </div>

                {s.lastRunStatus === 'error' && s.lastRunError && (
                  <div className="shortcut-item-error">{s.lastRunError}</div>
                )}
              </div>

              <div className="shortcut-item-actions">
                <label className="shortcut-toggle" title={s.enabled ? 'Disable' : 'Enable'}>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => onToggle(s.id, e.target.checked)}
                  />
                  <span className="shortcut-toggle-slider" />
                </label>

                <button
                  type="button"
                  className="shortcut-action-btn"
                  onClick={() => onRunNow(s.id)}
                  title="Run now"
                >
                  <Play size={14} />
                </button>

                <button
                  type="button"
                  className="shortcut-action-btn"
                  onClick={() => onEdit(s)}
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>

                {deleteConfirmId === s.id ? (
                  <div className="shortcut-delete-confirm">
                    <button
                      type="button"
                      className="shortcut-action-btn destructive"
                      onClick={() => handleDelete(s.id)}
                      title="Confirm delete"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="shortcut-action-btn"
                      onClick={() => setDeleteConfirmId(null)}
                      title="Cancel"
                    >
                      <XCircle size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="shortcut-action-btn"
                    onClick={() => setDeleteConfirmId(s.id)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
