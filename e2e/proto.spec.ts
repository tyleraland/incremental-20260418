import { test } from '@playwright/test'

// Visual harness for the ?proto=1 "Tactician" UI-overhaul prototype. Drives the
// split-screen shell — whose right-half lens follows the stage's zoom altitude —
// through its key states and captures screenshots for review. Not part of CI.

const BASE = '/incremental-20260418/?proto=1'

test('proto: altitude-following lens walkthrough', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/proto-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByText('TACTICIAN').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2500) // let ticks stand up live battles + bank attunement

  // Stack a real party onto one battlefield so the Army matrix has columns.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(400)

  // Pick a deployed hero — flies to their locale and drills into Hero.
  await page.getByRole('button', { name: /Mira/ }).first().click()
  await page.waitForTimeout(800)
  await shot('01-locale-hero')

  // Location lens: meters, attunement upgrades, story path.
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('02-locale-location')

  // Zoom into the battlefield — the lens follows to the Army matrix (with the
  // what-if overlay on by default).
  await page.getByTitle('Battle', { exact: true }).click()
  await page.waitForTimeout(1200)
  await shot('03-army-tactics-whatif')

  // Optimize applies the what-if loadout instantly.
  const opt = page.getByRole('button', { name: /Optimize/ })
  if (await opt.isEnabled()) await opt.click()
  await page.waitForTimeout(300)
  await shot('04-army-optimized')

  // Toggle to the Gear matrix (what-if swaps shown as → ghosts).
  await page.getByRole('button', { name: /Gear/ }).click()
  await page.waitForTimeout(300)
  await shot('05-army-gear')

  // Tap a gear cell → the gear picker (with stat deltas).
  await page.locator('[data-cell]').first().click()
  await page.waitForTimeout(300)
  await shot('06-gear-picker')
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(200)

  // Zoom back to the world — lens follows to World / Deploy.
  await page.getByTitle('World', { exact: true }).click()
  await page.waitForTimeout(800)
  await shot('07-world-deploy')
})
