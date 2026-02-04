import type { ComponentType, ReactNode } from 'react'
import type { PreComponent, CodeComponent, CodeHeaderProps, NodeLike } from './types'

export const DefaultPre: PreComponent = ({ node: _node, ...rest }) => (
  <pre {...rest} />
)

export const DefaultCode: CodeComponent = ({ node: _node, ...rest }) => (
  <code {...rest} />
)

export const DefaultCodeBlockContent: ComponentType<{
  node: NodeLike
  components: { Pre: PreComponent; Code: CodeComponent }
  code: string | ReactNode | undefined
}> = ({ node, components: { Pre, Code }, code }) => (
  <Pre>
    <Code node={node}>{code}</Code>
  </Pre>
)

export const DefaultCodeHeader: ComponentType<CodeHeaderProps> = () => null
