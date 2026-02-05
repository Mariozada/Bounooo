import type { ComponentProps, ComponentType, ElementType } from 'react'
import { memo } from 'react'
import type { CodeHeaderProps, SyntaxHighlighterProps, NodeLike } from './types'

type Components = {
  [Key in Extract<ElementType, string>]?: ComponentType<ComponentProps<Key>>
} & {
  SyntaxHighlighter?: ComponentType<Omit<SyntaxHighlighterProps, 'node'>> | undefined
  CodeHeader?: ComponentType<Omit<CodeHeaderProps, 'node'>> | undefined
}

const areChildrenEqual = (prev: unknown, next: unknown) => {
  if (typeof prev === 'string') return prev === next
  return JSON.stringify(prev) === JSON.stringify(next)
}

const stripNodeMetadata = (props: Record<string, unknown> | undefined) => {
  if (!props) return {}
  const { position, data, ...rest } = props as Record<string, unknown>
  return rest
}

export const areNodesEqual = (prev: NodeLike, next: NodeLike) => {
  if (!prev || !next) return false
  return (
    JSON.stringify(stripNodeMetadata(prev.properties)) ===
      JSON.stringify(stripNodeMetadata(next.properties)) &&
    areChildrenEqual(prev.children, next.children)
  )
}

export const memoCompareNodes = (
  prev: { node?: NodeLike },
  next: { node?: NodeLike }
) => {
  return areNodesEqual(prev.node, next.node)
}

export const memoizeMarkdownComponents = (components: Components = {}) => {
  return Object.fromEntries(
    Object.entries(components ?? {}).map(([key, value]) => {
      if (!value) return [key, value]

      const Component = value as ComponentType
      const WithoutNode = ({ node, ...props }: { node?: NodeLike }) => {
        return <Component {...props} />
      }
      return [key, memo(WithoutNode, memoCompareNodes)]
    })
  )
}
