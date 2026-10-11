import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('breadcrumb collapsed top-left + expand', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/nav-${proj}-${name}.png` })
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /Miri/ }).first().dblclick().catch(() => {})
  await page.waitForTimeout(2000)
  await shot('01-collapsed')
  // Expand the breadcrumb.
  await page.getByRole('button', { name: 'Navigate' }).click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('02-expanded')
})
