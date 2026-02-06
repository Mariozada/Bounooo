/**
 * Vite config for Content Script
 *
 * Builds the content script as a self-contained IIFE bundle.
 * No ES module imports - everything is inlined.
 *
 * IMPORTANT: Content scripts injected via chrome.scripting.executeScript()
 * run as classic scripts, not ES modules. They cannot use import statements.
 */

import { defineConfig } from 'vite'
import { resolve } from 'path'
import { resolveConfig, __dirname } from './vite.config.shared'

export default defineConfig({
  resolve: resolveConfig,
  base: './',
  build: {
    outDir: './dist',
    emptyOutDir: false, // Don't clear - UI build already did
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      name: 'BounoContent',
      formats: ['iife'], // Immediately Invoked Function Expression - no imports
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        // Ensure everything is inlined
        inlineDynamicImports: true,
        // Extend the global window object for content scripts
        extend: true,
      },
    },
    // Fail loudly on errors
    reportCompressedSize: true,
    minify: true,
  },
  // Ensure we don't silently fail
  logLevel: 'info',
})
