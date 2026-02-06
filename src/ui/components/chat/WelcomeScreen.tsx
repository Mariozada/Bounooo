import { type FC } from 'react'
import * as m from 'motion/react-m'

interface Suggestion {
  title: string
  label: string
  action: string
}

interface WelcomeScreenProps {
  onSuggestionClick: (action: string) => void
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  {
    title: 'Summarize this page',
    label: 'with key actions available',
    action: 'Summarize this page and list key actions I can take.',
  },
  {
    title: 'Fill a form',
    label: 'with sample data',
    action: 'Fill the main form on this page with realistic sample data.',
  },
  {
    title: 'Find CTA buttons',
    label: 'and describe them',
    action: 'Find the primary call-to-action buttons and describe them.',
  },
  {
    title: 'Extract key info',
    label: 'from this page',
    action: 'Extract key information and highlight important details.',
  },
]

export const WelcomeScreen: FC<WelcomeScreenProps> = ({ onSuggestionClick }) => {
  return (
    <div className="aui-thread-welcome-root">
      <div className="aui-thread-welcome-message">
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="aui-thread-welcome-title"
        >
          Hello there!
        </m.div>
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="aui-thread-welcome-subtitle"
        >
          How can I help you today?
        </m.div>
      </div>
      <div className="aui-thread-welcome-suggestions">
        {DEFAULT_SUGGESTIONS.map((suggestion, index) => (
          <m.button
            key={suggestion.action}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
            type="button"
            className="aui-thread-welcome-suggestion"
            onClick={() => onSuggestionClick(suggestion.action)}
          >
            <span className="aui-thread-welcome-suggestion-title">
              {suggestion.title}
            </span>
            <span className="aui-thread-welcome-suggestion-label">
              {suggestion.label}
            </span>
          </m.button>
        ))}
      </div>
    </div>
  )
}
