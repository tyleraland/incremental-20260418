import { test } from '@playwright/test'

// Skin-gallery contact sheet (NOT a gate — the screenshot is the deliverable).
// Renders every body×tone, weapon, state, facing, tile, barrier and FX swatch
// for both skins (src/dev/SkinGallery.tsx) and captures one full-page image:
//   npm run gallery-shot
// Review it in the PR — palette drift or a broken silhouette is visible at a
// glance without hunting scenes in a live battle.

test('skin gallery contact sheet', async ({ page }, testInfo) => {
  await page.goto('/?gallery=1')
  await page.locator('[data-gallery]').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(400)   // let the casting pulse settle a beat
  await page.screenshot({ path: `e2e/__shots__/gallery-${testInfo.project.name}.png`, fullPage: true })
})
