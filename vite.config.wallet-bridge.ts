import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/wallet/contentBridge.ts'),
      name: 'WalletBridge',
      fileName: () => 'wallet-bridge.js',
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
