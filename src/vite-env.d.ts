/// <reference types="vite/client" />

// Allow importing .jinja files as raw strings
declare module '*.jinja?raw' {
  const content: string
  export default content
}

declare module '*.jinja' {
  const content: string
  export default content
}
