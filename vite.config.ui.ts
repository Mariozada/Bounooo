/**
 * Vite config for Side Panel UI
 *
 * Builds the React-based side panel with ES modules and code splitting enabled.
 * Does not clear dist so standalone UI builds don't remove content/background bundles.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve } from 'path'
import { copyFileSync, existsSync, rmSync } from 'fs'
import { resolveConfig, __dirname } from './vite.config.shared'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for Node.js modules used by Metaplex/Solana
      include: ['buffer', 'crypto', 'stream', 'assert', 'events', 'util', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    {
      name: 'fix-sidepanel-html',
      writeBundle() {
        const distDir = resolve(__dirname, '../dist')
        const srcDir = resolve(distDir, 'src')
        const srcPath = resolve(srcDir, 'sidepanel.html')
        const destPath = resolve(distDir, 'sidepanel.html')

        // Move sidepanel.html from dist/src to dist/
        if (existsSync(srcPath)) {
          copyFileSync(srcPath, destPath)
          console.log('  Moved sidepanel.html to dist/')
        }

        // Remove the src directory
        if (existsSync(srcDir)) {
          rmSync(srcDir, { recursive: true })
        }

        // Fix asset paths in sidepanel.html (remove ../ prefix)
        if (existsSync(destPath)) {
          const fs = require('fs')
          let content = fs.readFileSync(destPath, 'utf-8')
          content = content.replace(/\.\.\/assets\//g, 'assets/')
          fs.writeFileSync(destPath, content)
        }
      },
    },
  ],
  resolve: resolveConfig,
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    minify: false, // Disable minification for debugging
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel.html'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
