/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/incremental-20260418/',
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
