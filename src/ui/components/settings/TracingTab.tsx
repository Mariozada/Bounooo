import { type FC, type ChangeEvent } from 'react'
import type { ProviderSettings } from '@shared/settings'
import { DEFAULT_TRACING_SETTINGS } from '@shared/settings'

interface TracingTabProps {
  settings: ProviderSettings
  onUpdate: (updates: Partial<ProviderSettings>) => void
}

export const TracingTab: FC<TracingTabProps> = ({ settings, onUpdate }) => {
  const handleTracingEnabledChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdate({
      tracing: {
        ...DEFAULT_TRACING_SETTINGS,
        ...settings.tracing,
        enabled: e.target.checked,
      },
    })
  }

  const handleTracingEndpointChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdate({
      tracing: {
        ...DEFAULT_TRACING_SETTINGS,
        ...settings.tracing,
        endpoint: e.target.value,
      },
    })
  }

  const handleTracingProjectChange = (e: ChangeEvent<HTMLInputElement>) => {
    onUpdate({
      tracing: {
        ...DEFAULT_TRACING_SETTINGS,
        ...settings.tracing,
        projectName: e.target.value,
      },
    })
  }

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h4>Phoenix Tracing</h4>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.tracing?.enabled ?? false}
              onChange={handleTracingEnabledChange}
            />
            Enable tracing
          </label>
          <span className="help-text">
            Send traces to Phoenix for observability and debugging
          </span>
        </div>

        {settings.tracing?.enabled && (
          <>
            <div className="form-group">
              <label htmlFor="tracing-endpoint">Endpoint</label>
              <input
                id="tracing-endpoint"
                type="text"
                value={settings.tracing?.endpoint ?? DEFAULT_TRACING_SETTINGS.endpoint}
                onChange={handleTracingEndpointChange}
                placeholder="http://0.0.0.0:6006"
              />
              <span className="help-text">
                Run: docker run -p 6006:6006 arizephoenix/phoenix
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="tracing-project">Project Name</label>
              <input
                id="tracing-project"
                type="text"
                value={settings.tracing?.projectName ?? DEFAULT_TRACING_SETTINGS.projectName}
                onChange={handleTracingProjectChange}
                placeholder="bouno"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
