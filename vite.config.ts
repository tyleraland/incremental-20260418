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

export default defineConfig(({ command }) => ({
  // Served from a repo subpath on GitHub Pages. CI overrides this per build so
  // PR previews can live under /incremental-20260418/pr-preview/pr-<N>/.
  base: process.env.BASE_PATH ?? '/incremental-20260418/',
  define: {
    __GIT_HASH__: JSON.stringify(gitHash),
    __GIT_LOG__:  JSON.stringify(gitLog),
  },
  resolve: {
    // Array form so we can use a precise regex for the react-dom redirect below.
    alias: [
      { find: '@', replacement: '/src' },
      // THROWAWAY (perf-probe branch): React's <Profiler> onRender is INERT in a
      // production build, so the on-device probe measured 0 render commits on the
      // deployed preview. Redirect react-dom to its PROFILING build so onRender
      // fires (at a small, uniform overhead) and the PR preview reports real commit
      // times. `react-dom/client.js` (createRoot) internally `require('react-dom')`,
      // so an EXACT-match regex on the bare specifier reroutes the renderer too —
      // the `$`-suffix string key webpack uses is a no-op under rollup's alias.
      // Build only (dev already supports Profiler). MUST NOT merge to main
      // (see BACKLOG: on-device perf probe).
      ...(command === 'build'
        ? [{ find: /^react-dom$/, replacement: 'react-dom/profiling' }]
        : []),
    ],
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
}))
