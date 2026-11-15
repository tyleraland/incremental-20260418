import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('compact cooldowns + element buff chip', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/elem-${proj}-${name}.png` })
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void; equipItem: (u: string, slot: string, id: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
    const aldric = g.units.find((u) => /Aldric/.test((u as { name?: string }).name ?? '')) ?? g.units[0]
    g.equipItem(aldric.id, 'mainHand', 'eq-knife-fire') // Ember Knife → fire imbue
  })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Aldric/ }).first().dblclick().catch(() => {})
  await page.waitForTimeout(2000)
  await shot('01-hero-element')
})
