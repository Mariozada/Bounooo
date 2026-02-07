import { useState, useCallback, type FC } from 'react'
import { X } from 'lucide-react'
import { PROVIDER_CONFIGS, getModelsForProvider } from '@agent/index'
import type { ShortcutSchedule, ScheduledShortcut } from '@storage/types'
import type { ProviderSettings } from '@shared/settings'
import { slugify } from '@storage/shortcutStorage'

interface ShortcutFormProps {
  settings: ProviderSettings
  shortcut?: ScheduledShortcut
  onSave: (data: {
    name: string
    prompt: string
    startUrl: string
    schedule: ShortcutSchedule
    provider?: string
    model?: string
  }) => Promise<void>
  onClose: () => void
}

const RECURRING_OPTIONS = [
  { label: 'Every 1 minute', minutes: 1 },
  { label: 'Every 5 minutes', minutes: 5 },
  { label: 'Every 15 minutes', minutes: 15 },
  { label: 'Every 30 minutes', minutes: 30 },
  { label: 'Every hour', minutes: 60 },
  { label: 'Every 6 hours', minutes: 360 },
  { label: 'Every 12 hours', minutes: 720 },
  { label: 'Daily', minutes: 1440 },
]

function formatDateForInput(timestamp?: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toISOString().slice(0, 16)
}

export const ShortcutForm: FC<ShortcutFormProps> = ({
  settings,
  shortcut,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(shortcut?.name ?? '')
  const [prompt, setPrompt] = useState(shortcut?.prompt ?? '')
  const [startUrl, setStartUrl] = useState(shortcut?.startUrl ?? 'https://')
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring'>(
    shortcut?.schedule.type ?? 'once'
  )
  const [scheduleDate, setScheduleDate] = useState(
    formatDateForInput(shortcut?.schedule.date)
  )
  const [intervalMinutes, setIntervalMinutes] = useState(
    shortcut?.schedule.intervalMinutes ?? 60
  )
  const [useCustomModel, setUseCustomModel] = useState(
    !!(shortcut?.provider || shortcut?.model)
  )
  const [provider, setProvider] = useState(shortcut?.provider ?? settings.provider)
  const [model, setModel] = useState(shortcut?.model ?? settings.model)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const models = getModelsForProvider(provider)

  const handleProviderChange = useCallback(
    (newProvider: string) => {
      setProvider(newProvider as ProviderSettings['provider'])
      const providerModels = getModelsForProvider(newProvider)
      if (providerModels.length > 0) {
        setModel(providerModels[0].id)
      }
    },
    []
  )

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!prompt.trim()) {
      setError('Prompt is required')
      return
    }
    if (!startUrl.trim() || startUrl === 'https://') {
      setError('Start URL is required')
      return
    }

    const schedule: ShortcutSchedule = { type: scheduleType }
    if (scheduleType === 'once') {
      if (!scheduleDate) {
        setError('Date and time are required for one-time schedule')
        return
      }
      schedule.date = new Date(scheduleDate).getTime()
    } else {
      schedule.intervalMinutes = intervalMinutes
      const option = RECURRING_OPTIONS.find((o) => o.minutes === intervalMinutes)
      schedule.label = option?.label ?? `Every ${intervalMinutes} minutes`
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSave({
        name: slugify(name),
        prompt: prompt.trim(),
        startUrl: startUrl.trim(),
        schedule,
        provider: useCustomModel ? provider : undefined,
        model: useCustomModel ? model : undefined,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [name, prompt, startUrl, scheduleType, scheduleDate, intervalMinutes, useCustomModel, provider, model, onSave, onClose])

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>{shortcut ? 'Edit Shortcut' : 'Create Shortcut'}</h3>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-content">
            <div className="setting-group">
              <label className="setting-label">Name</label>
              <input
                type="text"
                className="setting-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-automation-task"
              />
              {name && (
                <span className="setting-hint">/{slugify(name)}</span>
              )}
            </div>

            <div className="setting-group">
              <label className="setting-label">Prompt</label>
              <textarea
                className="setting-input setting-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what the agent should do..."
                rows={4}
              />
            </div>

            <div className="setting-group">
              <label className="setting-label">Start from URL</label>
              <input
                type="url"
                className="setting-input"
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="setting-group">
              <label className="setting-label">Schedule</label>
              <div className="shortcut-schedule-type">
                <button
                  type="button"
                  className={`shortcut-schedule-btn ${scheduleType === 'once' ? 'active' : ''}`}
                  onClick={() => setScheduleType('once')}
                >
                  Once
                </button>
                <button
                  type="button"
                  className={`shortcut-schedule-btn ${scheduleType === 'recurring' ? 'active' : ''}`}
                  onClick={() => setScheduleType('recurring')}
                >
                  Recurring
                </button>
              </div>

              {scheduleType === 'once' ? (
                <input
                  type="datetime-local"
                  className="setting-input"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              ) : (
                <select
                  className="setting-input"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                >
                  {RECURRING_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="setting-group">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={useCustomModel}
                  onChange={(e) => setUseCustomModel(e.target.checked)}
                />
                {' '}Override model
              </label>
              {useCustomModel && (
                <div className="shortcut-model-override">
                  <select
                    className="setting-input"
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                  >
                    {Object.entries(PROVIDER_CONFIGS).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="setting-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!useCustomModel && (
                <span className="setting-hint">
                  Using current: {PROVIDER_CONFIGS[settings.provider]?.name} / {settings.model}
                </span>
              )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="settings-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleSubmit}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : shortcut ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
