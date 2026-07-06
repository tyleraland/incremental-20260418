import { test, expect } from '@playwright/test'

const BASE = '/incremental-20260418/'

// Verifies the Time→Debug "BSNAP Replay" tool: paste a real snapshot token and
// see it render in the battle view, without touching the save.
test('bsnap replay renders a pasted snapshot', async ({ page }) => {
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Menu', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // Stand up a real battle, then serialize it to a BSNAP token in-page.
  await page.evaluate(() => {
    const g = (window as any).__game.getState()
    g.assignUnits(g.units.map((u: any) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(2500)
  const token = await page.evaluate(async () => {
    const eng = await import('/incremental-20260418/src/engine/index.ts')
    const g = (window as any).__game.getState()
    const ids = Object.keys(g.battles)
    if (!ids.length) return null
    return (eng as any).serializeBattle(g.battles[ids[0]])
  })
  expect(token, 'expected a battle to serialize').toBeTruthy()
  expect(token!.startsWith('BSNAP.')).toBeTruthy()

  // Snapshot the save's battle count so we can prove the replay never persists.
  const savedBefore = await page.evaluate(() => localStorage.getItem('save:sandbox') ?? localStorage.getItem('save') ?? '')

  // Open the nav drawer → Time panel, then the replay tool.
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: /Time/ }).click()
  await page.getByRole('button', { name: 'BSNAP Replay' }).click()
  await page.getByPlaceholder(/Paste a BSNAP/).fill(token!)
  await page.getByRole('button', { name: 'Load snapshot' }).click()

  // Overlay is up with transport controls.
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Step' })).toBeVisible()
  await expect(page.getByText(/combatants ·/)).toBeVisible()
  await page.screenshot({ path: 'e2e/__shots__/bsnap-replay.png' })

  // Step advances the round counter.
  const roundText = () => page.getByText(/^round \d+ ·/).first().innerText()
  const before = await roundText()
  await page.getByRole('button', { name: 'Step' }).click()
  await page.waitForTimeout(200)
  const after = await roundText()
  expect(after).not.toEqual(before)

  // Close returns to the Debug menu.
  await page.getByRole('button', { name: /^Close ✕$/ }).click()
  await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0)

  // The save on disk is unchanged by the replay (no persistSave was called).
  const savedAfter = await page.evaluate(() => localStorage.getItem('save:sandbox') ?? localStorage.getItem('save') ?? '')
  expect(savedAfter).toEqual(savedBefore)
})
