/**
 * Vite config for Background Script (Service Worker)
 *
 * Builds the background script as a self-contained IIFE bundle.
 * No ES module imports - everything is inlined.
 *
 * IMPORTANT: While service workers can technically use ES modules in MV3,
 * building as IIFE ensures consistency and avoids potential issues with
 * module resolution in the extension context.
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
      entry: resolve(__dirname, 'src/background/index.ts'),
      name: 'BounoBackground',
      formats: ['iife'], // Immediately Invoked Function Expression - no imports
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        // Ensure everything is inlined
        inlineDynamicImports: true,
        // Extend the global object
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
