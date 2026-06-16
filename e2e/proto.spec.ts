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

  // Pick a deployed hero — flies the world to their locale and drills into Hero.
  await page.getByRole('button', { name: /Mira/ }).first().click()
  await page.waitForTimeout(800)
  await shot('01-locale-hero')

  // Location lens: the locale's meters, attunement upgrades, story path.
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(300)
  // Buy a cheap upgrade if affordable (best-effort).
  await page.getByText('Rich Veins').click().catch(() => {})
  await page.waitForTimeout(200)
  await shot('02-locale-location')

  // Zoom into the battlefield — the lens follows to the Army matrix.
  await page.getByTitle('Battle', { exact: true }).click()
  await page.waitForTimeout(1200)
  await shot('03-battle-army')

  // Optimize proposes class-fit doctrine (ghosted).
  await page.getByRole('button', { name: /Optimize/ }).click()
  await page.waitForTimeout(300)
  await shot('04-army-optimize')

  // Assign commits the proposals (only if Optimize produced any).
  const assign = page.getByRole('button', { name: /Assign/ })
  if (await assign.isEnabled()) await assign.click()
  await page.waitForTimeout(300)
  await shot('05-army-assigned')

  // Tap a matrix cell → the assign picker.
  await page.locator('[data-cell]').first().click()
  await page.waitForTimeout(300)
  await shot('06-cell-picker')
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(200)

  // Zoom back to the world — lens follows to World / Deploy.
  await page.getByTitle('World', { exact: true }).click()
  await page.waitForTimeout(800)
  await shot('07-world-deploy')
})
