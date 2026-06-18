import { test, expect } from '@playwright/test'

// Visual + behavioural check for the city / dungeon / lens-chrome tweaks:
//   - "Enter <Dungeon>" button is compact and no longer says "descend"
//   - a prominent Exit chip leaves the dungeon map back to the world
//   - the bottom-half lens tabs + content read a touch larger
//   - the top bar (esp. a prominent Guild) is legible
// Not part of `npm run ci` — run with the e2e harness.

const BASE = '/incremental-20260418/'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = (page: import('@playwright/test').Page, fn: string) => page.evaluate(fn)

test('city/dungeon/lens chrome tweaks', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/chrome-${proj}-${n}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // Top bar: the Guild button shows its label even on mobile (prominent).
  await expect(page.getByRole('button', { name: 'Guild', exact: true })).toBeVisible()
  await shot('01-topbar')

  // Focus Geffen City and open the Location lens.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { setSelectedLocation: (id: string) => void } } }).__game.getState()
    g.setSelectedLocation('geffen-city')
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(400)

  // The dungeon-entry button is present, compact, and no longer says "descend".
  const enter = page.getByRole('button', { name: /Enter Geffen Dungeon/ })
  await expect(enter).toBeVisible()
  await expect(page.getByText('descend')).toHaveCount(0)
  await shot('02-geffen-city')

  // Enter the dungeon → a prominent Exit chip appears in the map breadcrumb.
  await enter.click()
  await page.waitForTimeout(600)
  const exit = page.getByRole('button', { name: /Leave Geffen Dungeon/ })
  await expect(exit).toBeVisible()
  await expect(exit).toContainText('Exit')
  await shot('03-in-dungeon')

  // Exit → back on the world map.
  await exit.click()
  await page.waitForTimeout(600)
  const pageId = await page.evaluate(() => (window as unknown as { __game: { getState: () => { mapPageId: string } } }).__game.getState().mapPageId)
  expect(pageId).toBe('world')
  await shot('04-back-on-world')

  // Class-change board renders for a city with a level-2 Novice selected.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { getState: () => { setSelectedLocation: (id: string) => void }; setState: (s: object) => void } }).__game
    store.getState().setSelectedLocation('prontera-city')
    store.setState({ selectedUnitIds: ['u7'] })
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: /Path of the Fighter/ })).toBeVisible()
  await shot('05-class-change')

  // Begin the path → it becomes an in-progress kill objective (0/1), no Complete yet.
  await page.getByRole('button', { name: /Path of the Fighter/ }).click()       // expand
  await page.getByRole('button', { name: /Begin — Pell takes/ }).click()
  await page.waitForTimeout(300)
  await expect(page.getByText('0/1').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Complete the class change/ })).toHaveCount(0)
  await shot('06-quest-in-progress')

  // Credit Pell a killing blow (what landing one in combat would do) → ready.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (fn: (s: { unitStats: Record<string, unknown> }) => object) => void } }).__game
    store.setState((s) => ({ unitStats: { ...s.unitStats, u7: { ...(s.unitStats.u7 ?? {}), monstersDefeated: 1 } } }))
  })
  await page.waitForTimeout(300)
  const complete = page.getByRole('button', { name: /Complete the class change/ })
  await expect(complete).toBeVisible()
  await shot('07-quest-ready')

  // Complete → Pell becomes a Fighter on the real unit.
  await complete.click()
  await page.waitForTimeout(300)
  const cls = await page.evaluate(() => (window as unknown as { __game: { getState: () => { units: { id: string; class: string | null }[] } } }).__game.getState().units.find((u) => u.id === 'u7')?.class)
  expect(cls).toBe('Fighter')

  // All four lens tabs are reachable.
  for (const tab of ['Hero', 'Party', 'Items', 'Location']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await page.waitForTimeout(200)
  }
})
