import { useState, useCallback, type FC } from 'react'

export interface NotificationError {
  id: string
  message: string
  details?: string
  timestamp: number
}

interface ErrorNotificationProps {
  errors: NotificationError[]
  onDismiss: (id: string) => void
  onDismissAll: () => void
}

export const ErrorNotification: FC<ErrorNotificationProps> = ({
  errors,
  onDismiss,
  onDismissAll,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  if (errors.length === 0) return null

  return (
    <div className="error-notification-container">
      <div className="error-notification-header">
        <span className="error-notification-count">
          {errors.length} error{errors.length > 1 ? 's' : ''}
        </span>
        {errors.length > 1 && (
          <button
            type="button"
            className="error-notification-dismiss-all"
            onClick={onDismissAll}
          >
            Dismiss all
          </button>
        )}
      </div>
      <div className="error-notification-list">
        {errors.map(error => {
          const isExpanded = expandedId === error.id
          const hasDetails = !!error.details

          return (
            <div key={error.id} className="error-notification-item">
              <div className="error-notification-main">
                <svg
                  className="error-notification-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="error-notification-message">{error.message}</span>
                <div className="error-notification-actions">
                  {hasDetails && (
                    <button
                      type="button"
                      className="error-notification-expand"
                      onClick={() => toggleExpand(error.id)}
                      aria-expanded={isExpanded}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      {isExpanded ? 'Less' : 'More'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="error-notification-dismiss"
                    onClick={() => onDismiss(error.id)}
                    aria-label="Dismiss error"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {isExpanded && hasDetails && (
                <div className="error-notification-details">
                  {error.details}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Helper to generate unique error IDs
export function createError(message: string, details?: string): NotificationError {
  return {
    id: `error_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    message,
    details,
    timestamp: Date.now(),
  }
}
