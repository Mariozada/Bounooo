/**
 * Vite config for Side Panel UI
 *
 * Builds the React-based side panel with ES modules and code splitting enabled.
 * This runs first and clears the dist directory.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, existsSync, rmSync } from 'fs'
import { resolveConfig, __dirname } from './vite.config.shared'
import { nunjucksPrecompile } from './vite-plugin-nunjucks-precompile'

export default defineConfig({
  plugins: [
    react(),
    nunjucksPrecompile(),
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
    emptyOutDir: true, // Only UI build clears the directory
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
