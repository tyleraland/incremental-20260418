import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('battle card unified into hero tab', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/unify-${proj}-${name}.png` })
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void; enterBattleView: (id: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(1500)
  // Double-tap a hero to fly to the battlefield, let combat run a moment.
  await page.getByRole('button', { name: /Miri/ }).first().dblclick().catch(() => {})
  await page.waitForTimeout(2500)
  // Tap a hero chip on the battlefield → should route to Hero › Battle (no sheet).
  await page.getByTitle(/— (\d|casting)/).first().click({ force: true }).catch(() => {})
  await page.waitForTimeout(600)
  await shot('01-hero-battle-stats')
  await page.getByRole('button', { name: 'Debug', exact: true }).click().catch(() => {})
  await page.waitForTimeout(400)
  await shot('02-hero-battle-debug')
})
