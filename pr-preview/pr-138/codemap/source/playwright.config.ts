import { defineConfig, devices } from '@playwright/test'

// Perf/visual harness for the battle view. Runs against the vite dev server and
// drives the `?perf` seed (src/dev/perfSeed.ts) into a heavy open-world battle.
// Not part of `npm run ci` — install Chromium first (npm run e2e:install).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // The mobile profile is the one that matters for the "lag on mobile" concern.
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
