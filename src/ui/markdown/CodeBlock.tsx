import type { ComponentType, FC } from 'react'
import type {
  CodeComponent,
  CodeHeaderProps,
  PreComponent,
  SyntaxHighlighterProps,
  NodeLike,
} from './types'
import { DefaultCodeBlockContent } from './defaultComponents'

export type CodeBlockProps = {
  node: NodeLike
  language: string
  code: string
  components: {
    Pre: PreComponent
    Code: CodeComponent
    CodeHeader: ComponentType<CodeHeaderProps>
    SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>
  }
}

export const DefaultCodeBlock: FC<CodeBlockProps> = ({
  node,
  components: { Pre, Code, SyntaxHighlighter, CodeHeader },
  language,
  code,
}) => {
  const SH = language ? SyntaxHighlighter : DefaultCodeBlockContent
  return (
    <div className="aui-code-block">
      <CodeHeader node={node} language={language} code={code} />
      <SH
        node={node}
        components={{ Pre, Code }}
        language={language || 'unknown'}
        code={code}
      />
    </div>
  )
}
