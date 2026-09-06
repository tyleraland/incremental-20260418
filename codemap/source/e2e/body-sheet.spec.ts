import { test } from '@playwright/test'

// Per-body animation contact sheet (NOT a gate — the screenshot is the
// deliverable). Renders ONE creature's full state machine as deterministic
// stills — the real index.css keyframes frozen at authored phases: the three
// idle breathe/sway poses, the attack wind/strike/recover, the hit recoil, the
// walk gait, plus facing wheel / scale ladder / far-LOD / KO
// (src/dev/BodySheet.tsx). The monster-authoring review loop:
//   SHAPE=thiefBug npm run body-shot     (default: every creature body)
// Review the image in the PR — the "3 idle images that breathe" and the attack
// /hit reads are visible without hunting a live battle.

test('body contact sheet', async ({ page }, testInfo) => {
  const shape = process.env.SHAPE ?? 'all'
  await page.goto(`/?bodyshot=${shape}`)
  await page.locator('[data-bodysheet]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(300)   // fonts + the frozen animation styles settle
  await page.screenshot({ path: `e2e/__shots__/body-${shape}-${testInfo.project.name}.png`, fullPage: true })
})
