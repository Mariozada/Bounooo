import { type FC, useMemo, useState, type ComponentPropsWithoutRef, type ComponentType } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { memoizeMarkdownComponents } from '../markdown/memoization'
import { PreOverride, useIsMarkdownCodeBlock } from '../markdown/PreOverride'
import { CodeOverride } from '../markdown/CodeOverride'
import {
  DefaultCodeBlockContent,
  DefaultCodeHeader,
  DefaultCode,
  DefaultPre
} from '../markdown/defaultComponents'
import type { CodeHeaderProps, SyntaxHighlighterProps } from '../markdown/types'

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
}

const mergeClassNames = (...parts: Array<string | undefined>) =>
  parts.filter(Boolean).join(' ')

const normalizeMarkdown = (value: string) => {
  const backtickMatches = value.match(/```/g)?.length ?? 0
  const tildeMatches = value.match(/~~~/g)?.length ?? 0
  const suffixes: string[] = []
  if (backtickMatches % 2 === 1) {
    suffixes.push('```')
  }
  if (tildeMatches % 2 === 1) {
    suffixes.push('~~~')
  }
  return suffixes.length ? `${value}\n${suffixes.join('\n')}` : value
}

const useCopyToClipboard = (copiedDuration = 2000) => {
  const [isCopied, setIsCopied] = useState(false)

  const copyToClipboard = (value: string) => {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), copiedDuration)
    })
  }

  return { isCopied, copyToClipboard }
}

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard()

  return (
    <div className="aui-code-header-root">
      <span className="aui-code-header-language">{language}</span>
      <button
        type="button"
        className="aui-code-header-copy"
        onClick={() => copyToClipboard(code)}
        aria-label="Copy code"
      >
        {isCopied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1 className={mergeClassNames('aui-md-h1', className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={mergeClassNames('aui-md-h2', className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={mergeClassNames('aui-md-h3', className)} {...props} />
  ),
  h4: ({ className, ...props }) => (
    <h4 className={mergeClassNames('aui-md-h4', className)} {...props} />
  ),
  h5: ({ className, ...props }) => (
    <h5 className={mergeClassNames('aui-md-h5', className)} {...props} />
  ),
  h6: ({ className, ...props }) => (
    <h6 className={mergeClassNames('aui-md-h6', className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={mergeClassNames('aui-md-p', className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={mergeClassNames('aui-md-a', className)}
      {...props}
      target="_blank"
      rel="noreferrer"
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote className={mergeClassNames('aui-md-blockquote', className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={mergeClassNames('aui-md-ul', className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={mergeClassNames('aui-md-ol', className)} {...props} />
  ),
  hr: ({ className, ...props }) => (
    <hr className={mergeClassNames('aui-md-hr', className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <table className={mergeClassNames('aui-md-table', className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th className={mergeClassNames('aui-md-th', className)} {...props} />
  ),
  td: ({ className, ...props }) => (
    <td className={mergeClassNames('aui-md-td', className)} {...props} />
  ),
  tr: ({ className, ...props }) => (
    <tr className={mergeClassNames('aui-md-tr', className)} {...props} />
  ),
  sup: ({ className, ...props }) => (
    <sup className={mergeClassNames('aui-md-sup', className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre className={mergeClassNames('aui-md-pre', className)} {...props} />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock()
    return (
      <code
        className={mergeClassNames(!isCodeBlock ? 'aui-md-inline-code' : undefined, className)}
        {...props}
      />
    )
  },
  SyntaxHighlighter: DefaultCodeBlockContent as ComponentType<
    Omit<SyntaxHighlighterProps, 'node'>
  >,
  CodeHeader: CodeHeader as ComponentType<Omit<CodeHeaderProps, 'node'>>,
})

export const MarkdownMessage: FC<MarkdownMessageProps> = ({ content, isStreaming }) => {
  const processed = useMemo(() => normalizeMarkdown(content), [content])

  const components = useMemo(() => {
    const {
      pre = DefaultPre,
      code = DefaultCode,
      SyntaxHighlighter = DefaultCodeBlockContent,
      CodeHeader: CodeHeaderComponent = DefaultCodeHeader,
      ...componentsRest
    } = defaultComponents

    const useCodeOverrideComponents = {
      Pre: pre,
      Code: code,
      SyntaxHighlighter,
      CodeHeader: CodeHeaderComponent,
    }

    const CodeComponent = (props: ComponentPropsWithoutRef<'code'>) => (
      <CodeOverride components={useCodeOverrideComponents} {...props} />
    )

    return {
      ...componentsRest,
      pre: PreOverride,
      code: CodeComponent,
    }
  }, [])

  return (
    <ReactMarkdown
      className="message-markdown aui-md"
      remarkPlugins={[remarkGfm]}
      skipHtml
      data-status={isStreaming ? 'running' : undefined}
      components={components}
    >
      {processed}
    </ReactMarkdown>
  )
}
