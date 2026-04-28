/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()

export default defineConfig({
  base: '/incremental-20260418/',
  define: { __GIT_HASH__: JSON.stringify(gitHash) },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    alias: {
      '@/': '/src/',
    },
  },
})
