import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('unit tab hero+monster, location lore', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/unit-${proj}-${name}.png` })
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Miri/ }).first().dblclick().catch(() => {})
  await page.waitForTimeout(2000)
  // Tap a MONSTER chip on the battlefield (Tough Slime — hp/max).
  await page.getByTitle(/Slime —/).first().click().catch(() => {})
  await page.waitForTimeout(600)
  await shot('01-unit-monster')
  // Pick a hero from the roster → Unit tab shows the hero again.
  await page.getByRole('button', { name: /Aldric/ }).first().click().catch(() => {})
  await page.getByRole('button', { name: 'Unit', exact: true }).click().catch(() => {})
  await page.waitForTimeout(400)
  await shot('02-unit-hero')
  // Location tab → Lore section at the bottom.
  await page.getByRole('button', { name: 'Location', exact: true }).click().catch(() => {})
  await page.waitForTimeout(400)
  await shot('03-location-lore')
})
