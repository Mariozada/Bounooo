/**
 * Shared Vite configuration for BrowseRun extension
 * Contains common settings used by all build configs
 */

import { resolve } from 'path'

export const __dirname = import.meta.dirname

/**
 * Shared path aliases
 */
export const aliases = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@tools': resolve(__dirname, 'src/tools'),
  '@background': resolve(__dirname, 'src/background'),
  '@content': resolve(__dirname, 'src/content'),
  '@ui': resolve(__dirname, 'src/ui'),
  '@agent': resolve(__dirname, 'src/agent'),
  '@prompts': resolve(__dirname, 'src/prompts'),
  '@storage': resolve(__dirname, 'src/storage'),
}

/**
 * Shared resolve configuration
 */
export const resolveConfig = {
  alias: aliases,
}
