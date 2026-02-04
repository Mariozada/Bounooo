/// <reference types="vite/client" />

// Precompiled Jinja templates export a render function
declare module '*.jinja' {
  export function render(context: Record<string, unknown>): string
  export default render
}
