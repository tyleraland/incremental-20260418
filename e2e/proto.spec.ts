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
  await page.waitForTimeout(2500) // let a few ticks stand up live battles

  // Pick a deployed hero — flies the world to them + fills the lens.
  await page.getByRole('button', { name: /Mira/ }).first().click()
  await page.waitForTimeout(800)
  await shot('01-locale-summary')

  // Continuous zoom: scroll-wheel partway in over the stage to catch the
  // locale → battlefield crossfade (no hard cut).
  const box = await page.locator('div.relative.h-full.w-full').first().boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -260)
    await page.waitForTimeout(250)
    await shot('02-zoom-morph')
  }

  // Snap to the battlefield (zoom rail ⚔), keep the Summary lens.
  await page.getByTitle('Battle', { exact: true }).click()
  await page.waitForTimeout(1200)
  await shot('03-battle-summary')

  // Gear lens with live stat deltas — pick a slot to see the swap impact.
  await page.getByRole('button', { name: 'Gear' }).click()
  await page.waitForTimeout(300)
  await page.getByText('Main Hand').click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('04-battle-gear-deltas')

  // Single-hero Tactician lens.
  await page.getByRole('button', { name: 'Tactics' }).click()
  await page.waitForTimeout(300)
  await shot('05-battle-tactics')

  // Party doctrine matrix (channel × hero) — whole squad side by side.
  await page.getByRole('button', { name: 'Party' }).click()
  await page.waitForTimeout(300)
  await shot('06-party-matrix')

  // Saga (narrative) lens.
  await page.getByRole('button', { name: 'Saga' }).click()
  await page.waitForTimeout(300)
  await shot('07-battle-saga')

  // Zoom back out to the world, open the Deploy lens.
  await page.getByTitle('World', { exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Deploy' }).click()
  await page.waitForTimeout(300)
  await shot('08-world-deploy')
})
