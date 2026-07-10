// Ad-hoc live-UI verification harness — see AGENTS.md "Testing & verification".
//
// NOT the e2e suite (that's `e2e/`, run via `npm run e2e`). This is a library
// for one-off manual checks during a session (e.g. confirm a UI tweak actually
// renders/behaves before reporting it done) without hand-rolling Playwright's
// launch/viewport/console-listener boilerplate every time. Import it from a
// throwaway script written INTO THE REPO ROOT — module resolution needs
// `node_modules` ancestry, so a script under the scratchpad dir can't resolve
// `@playwright/test`. Delete the throwaway script when done and `git status
// --short` before committing so it never lands in a commit.
//
// Assumes `npm run dev` is already running at BASE_URL.
//
// Usage:
//   import { withPage } from './scripts/ui-probe.mjs'
//   await withPage(async (page, { errors }) => {
//     await page.getByRole('button', { name: /Deploy heroes/ }).click()
//     console.log('errors:', errors)
//   })
import { chromium } from '@playwright/test'

const BASE_URL = process.env.UI_PROBE_URL ?? 'http://localhost:5173/incremental-20260418/'
const CHROMIUM_PATH = '/opt/pw-browsers/chromium' // pre-installed; do not `playwright install`

export async function withPage(fn, { viewport = { width: 420, height: 900 }, path = '' } = {}) {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH })
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE_URL + path)
  await page.waitForTimeout(1000) // let the store/seed settle
  try {
    return await fn(page, { errors, browser })
  } finally {
    await browser.close()
  }
}
