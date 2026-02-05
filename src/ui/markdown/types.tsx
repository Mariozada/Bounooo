import type { ComponentPropsWithoutRef, ComponentType } from 'react'

export type NodeLike = {
  properties?: Record<string, unknown>
  children?: unknown
} | undefined

export type PreComponent = ComponentType<
  ComponentPropsWithoutRef<'pre'> & { node?: NodeLike }
>
export type CodeComponent = ComponentType<
  ComponentPropsWithoutRef<'code'> & { node?: NodeLike }
>

export type CodeHeaderProps = {
  node?: NodeLike
  language: string | undefined
  code: string
}

export type SyntaxHighlighterProps = {
  node?: NodeLike
  components: {
    Pre: PreComponent
    Code: CodeComponent
  }
  language: string
  code: string
}
