/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { defaultExclude } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()
// Last 5 commits as [{ hash, message }, …], newest first. Used by the
// Debug panel to show a short timeline of recent changes.
const gitLog = (() => {
  try {
    const raw = execSync('git log --no-merges -5 --pretty=%h%x1f%s').toString().trim()
    return raw.split('\n').map((line) => {
      const [hash, message] = line.split('\x1f')
      return { hash, message }
    })
  } catch { return [] as { hash: string; message: string }[] }
})()

export default defineConfig({
  // Served from a repo subpath on GitHub Pages. CI overrides this per build so
  // PR previews can live under /incremental-20260418/pr-preview/pr-<N>/.
  base: process.env.BASE_PATH ?? '/incremental-20260418/',
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
    // e2e/ holds Playwright specs (also *.spec.ts) — keep them out of vitest.
    exclude: [...defaultExclude, 'e2e/**'],
    alias: {
      '@/': '/src/',
    },
  },
})
