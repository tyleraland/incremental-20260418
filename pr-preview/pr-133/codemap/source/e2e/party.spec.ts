import { test } from '@playwright/test'

const BASE = '/incremental-20260418/'

test('party grouped by location + lock badge', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/pgroup-${proj}-${name}.png` })
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    const ids = g.units.map((u) => u.id)
    g.assignUnits(ids.slice(0, 3), 'prontera-field-1')
    g.assignUnits(ids.slice(3, 5), 'geffen-field-1')
    g.assignUnits([ids[5]], 'prontera-city')
    // leave the rest idle at the guild
  })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('01-grouped-lock')
})
