import { test } from '@playwright/test'

// Visual harness for the ?proto=1 "Tactician" UI-overhaul prototype. The first
// screen is a battlefield with the Location lens; tabs are Location / Party /
// Hero / Items / World. Captures screenshots for review. Not part of CI.

const BASE = '/incremental-20260418/?proto=1'

test('proto: battlefield-first walkthrough', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/proto-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByText('TACTICIAN').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2500) // ticks stand up battles + the stage flies in
  await shot('01-initial-battlefield')

  // Stack a real party onto one battlefield so the Party matrix has columns.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(600)

  // Pick a hero — flies to their battlefield, follows the camera, opens Hero
  // (with the live battlefield-status readout on top).
  await page.getByRole('button', { name: /Mira/ }).first().click()
  await page.waitForTimeout(1000)
  await shot('02-hero-battlestatus')

  // Party matrix (doctrine) + Optimize.
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.waitForTimeout(300)
  const opt = page.getByRole('button', { name: /Optimize/ })
  if (await opt.isEnabled()) await opt.click()
  await page.waitForTimeout(300)
  await shot('03-party-matrix')

  // Gear facet of the matrix.
  await page.getByRole('button', { name: /Gear/ }).click()
  await page.waitForTimeout(300)
  await shot('04-party-gear')

  // Items lens — guild stash with per-hero equip diffs.
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('05-items-stash')

  // Location lens — meters, upgrades, story, foes. Open a monster card.
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByText('card ›').first().click().catch(() => {})
  await page.waitForTimeout(400)
  await shot('06-location-monstercard')
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(200)

  // Zoom back out to the world via the slider.
  await page.getByTitle('World', { exact: true }).click()
  await page.waitForTimeout(800)
  await shot('07-world')
})
