import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('party transposed + bigger overlays', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/party-${proj}-${name}.png` })
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void; setSelectedLocation: (id: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
    g.setSelectedLocation('prontera-field-1')
  })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('01-party-tactics')
  await page.getByRole('button', { name: /Gear/ }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('02-party-gear')
  await page.getByRole('button', { name: /Close/ }).click().catch(() => {})
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Quests', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('03-quests-bigger')
})
