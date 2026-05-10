/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()
// Last 5 commits as [{ hash, message }, …], newest first. Used by the
// Debug panel to show a short timeline of recent changes.
const gitLog = (() => {
  try {
    const raw = execSync('git log -5 --pretty=%h%x1f%s').toString().trim()
    return raw.split('\n').map((line) => {
      const [hash, message] = line.split('\x1f')
      return { hash, message }
    })
  } catch { return [] as { hash: string; message: string }[] }
})()

export default defineConfig({
  base: '/incremental-20260418/',
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
    __GIT_LOG__:  JSON.stringify(gitLog),
  },
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
