import type { FC } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

interface MarkdownMessageProps {
  content: string
}

export const MarkdownMessage: FC<MarkdownMessageProps> = ({ content }) => (
  <ReactMarkdown
    className="message-markdown"
    remarkPlugins={[remarkGfm, remarkBreaks]}
    skipHtml
    components={{
      a: ({ node: _node, ...props }) => (
        <a {...props} target="_blank" rel="noreferrer" />
      ),
      code: ({ node: _node, inline, className, children, ...props }) => {
        if (inline) {
          return (
            <code className={`inline-code ${className || ''}`} {...props}>
              {children}
            </code>
          )
        }
        const text = String(children).replace(/\n$/, '')
        const languageMatch = /language-(\w+)/.exec(className || '')
        const language = languageMatch ? languageMatch[1] : 'text'
        return (
          <div className="code-block">
            <div className="code-block-header">
              <span className="code-block-language">{language}</span>
              <button
                type="button"
                className="code-block-copy"
                onClick={() => navigator.clipboard.writeText(text)}
                aria-label="Copy code"
              >
                Copy
              </button>
            </div>
            <pre>
              <code className={className} {...props}>
                {text}
              </code>
            </pre>
          </div>
        )
      },
    }}
  >
    {content}
  </ReactMarkdown>
)
