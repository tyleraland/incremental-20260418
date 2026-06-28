import { test } from '@playwright/test'

// Visual check for the city sprite skin: assign a few heroes into Prontera (a
// peaceful city field with NPC merchants), drop into the battle view, and shoot
// the sprite skin + the circle skin (toggle) for an A/B.
const BASE = '/incremental-20260418/'

test('city sprites vs circles', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/city-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => {
      units: { id: string }[]
      assignUnits: (ids: string[], loc: string) => void
      enterBattleView: (loc: string) => void
    } } }).__game.getState()
    const ids = g.units.map((u) => u.id)
    g.assignUnits(ids.slice(0, 4), 'prontera-city')   // a few heroes milling in town
    g.enterBattleView('prontera-city')
  })

  // Let the heroes wander a bit and the sprite atlas load.
  await page.waitForTimeout(2500)
  await shot('01-sprites')

  // Flip to the circle skin via the in-arena toggle for an A/B comparison.
  await page.getByRole('button', { name: /Sprites|Circles/ }).click().catch(() => {})
  await page.waitForTimeout(600)
  await shot('02-circles').catch(() => {})   // best-effort; sprite shot is the deliverable
})
