import { defineConfig } from 'vite'
import { resolve } from 'path'
import { aliases } from './vite.config.shared'

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/wallet/popup.ts'),
      name: 'WalletPopup',
      fileName: () => 'wallet-popup.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: false,
    sourcemap: false,
  },
  base: './',
})
