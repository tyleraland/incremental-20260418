import { test } from '@playwright/test'

// Visual harness for the ?proto=1 "Tactician" UI-overhaul prototype. Drives the
// split-screen shell through its key states and captures screenshots for review.
// Not part of `npm run ci`.

const BASE = '/incremental-20260418/?proto=1'

test('proto: split-screen tactician walkthrough', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/proto-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByText('TACTICIAN').waitFor({ state: 'visible', timeout: 30_000 })
  // Let a few ticks run so deployed heroes stand up live battles.
  await page.waitForTimeout(2500)

  // Pick a deployed hero — flies the world to them + fills the lens.
  await page.getByRole('button', { name: /Mira/ }).click()
  await page.waitForTimeout(800)
  await shot('01-locale-summary')

  // Drop into the battlefield (zoom rail ⚔), keep the Summary lens.
  await page.getByTitle('Battle', { exact: true }).click()
  await page.waitForTimeout(1500)
  await shot('02-battle-summary')

  // Manage gear while the battle plays on the left.
  await page.getByRole('button', { name: 'Gear' }).click()
  await page.waitForTimeout(300)
  await page.getByText('Main Hand').click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('03-battle-gear')

  // Tactician lens.
  await page.getByRole('button', { name: 'Tactician' }).click()
  await page.waitForTimeout(300)
  await shot('04-battle-tactics')

  // Saga (narrative) lens.
  await page.getByRole('button', { name: 'Saga' }).click()
  await page.waitForTimeout(300)
  await shot('05-battle-saga')

  // Zoom back out to the world, open the Deploy lens.
  await page.getByTitle('World', { exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Deploy' }).click()
  await page.waitForTimeout(300)
  await shot('06-world-deploy')
})
