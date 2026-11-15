import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('unit card combat-first, hero detail, guild board', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/u2-${proj}-${name}.png` })
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
  await shot('01-unit-card')
  // Open Hero Detail from the Unit tab.
  await page.getByRole('button', { name: /Hero Detail/ }).click().catch(() => {})
  await page.waitForTimeout(400)
  await shot('02-hero-detail')
  await page.getByRole('button', { name: /Close/ }).click().catch(() => {})
  await page.waitForTimeout(200)
  // Guild board (Party folded in) + recruit.
  await page.getByRole('button', { name: 'Guild', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('03-guild-board')
})
