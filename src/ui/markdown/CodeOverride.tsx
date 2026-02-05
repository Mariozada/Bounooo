import { type ComponentPropsWithoutRef, type ComponentType, memo, useContext } from 'react'
import type { CodeComponent, CodeHeaderProps, PreComponent, SyntaxHighlighterProps } from './types'
import { PreContext, useIsMarkdownCodeBlock } from './PreOverride'
import { DefaultCodeBlock } from './CodeBlock'
import { DefaultCodeBlockContent } from './defaultComponents'
import { withDefaultProps } from './withDefaults'
import { memoCompareNodes } from './memoization'

const CodeBlockOverride = ({
  node,
  components: {
    Pre,
    Code,
    SyntaxHighlighter: FallbackSyntaxHighlighter,
    CodeHeader: FallbackCodeHeader,
  },
  componentsByLanguage = {},
  children,
  ...codeProps
}: CodeOverrideProps) => {
  const preProps = useContext(PreContext) || {}
  const getPreProps = withDefaultProps<any>(preProps)
  const WrappedPre: PreComponent = (props) => <Pre {...getPreProps(props)} />

  const getCodeProps = withDefaultProps<any>(codeProps)
  const WrappedCode: CodeComponent = (props) => <Code {...getCodeProps(props)} />

  const language = /language-([\\w-]+)/.exec(codeProps.className || '')?.[1] ?? ''

  const normalized =
    typeof children === 'string'
      ? children
      : Array.isArray(children)
        ? children.join('')
        : typeof children === 'number'
          ? String(children)
          : null

  if (normalized === null) {
    return (
      <DefaultCodeBlockContent
        node={node}
        components={{ Pre: WrappedPre, Code: WrappedCode }}
        code={children}
      />
    )
  }

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps> =
    componentsByLanguage[language]?.SyntaxHighlighter ?? FallbackSyntaxHighlighter

  const CodeHeader: ComponentType<CodeHeaderProps> =
    componentsByLanguage[language]?.CodeHeader ?? FallbackCodeHeader

  return (
    <DefaultCodeBlock
      node={node}
      components={{
        Pre: WrappedPre,
        Code: WrappedCode,
        SyntaxHighlighter,
        CodeHeader,
      }}
      language={language || 'unknown'}
      code={normalized}
    />
  )
}

export type CodeOverrideProps = ComponentPropsWithoutRef<CodeComponent> & {
  components: {
    Pre: PreComponent
    Code: CodeComponent
    CodeHeader: ComponentType<CodeHeaderProps>
    SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>
  }
  componentsByLanguage?:
    | Record<
        string,
        {
          CodeHeader?: ComponentType<CodeHeaderProps>
          SyntaxHighlighter?: ComponentType<SyntaxHighlighterProps>
        }
      >
    | undefined
}

const CodeOverrideImpl = ({
  node,
  components,
  componentsByLanguage,
  ...props
}: CodeOverrideProps) => {
  const isCodeBlock = useIsMarkdownCodeBlock()
  if (!isCodeBlock) return <components.Code {...props} />
  return (
    <CodeBlockOverride
      node={node}
      components={components}
      componentsByLanguage={componentsByLanguage}
      {...props}
    />
  )
}

export const CodeOverride = memo(CodeOverrideImpl, (prev, next) => {
  const isEqual =
    prev.components === next.components &&
    prev.componentsByLanguage === next.componentsByLanguage &&
    memoCompareNodes(prev, next)
  return isEqual
})
