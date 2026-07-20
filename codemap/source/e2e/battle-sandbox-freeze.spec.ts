import { test, expect } from '@playwright/test'

const BASE = '/incremental-20260418/'
const SANDBOX_LOC = 'perf-sandbox'

// The Battle Sandbox "Pause normal play" perf-test lever: with it on, the battle
// under test keeps advancing (tokens move — the render load) while the full store
// tick (world clock + spawns/trickle + per-unit systems) is frozen.
test('pause normal play advances the battle but freezes the store tick', async ({ page }) => {
  await page.goto(BASE + '?sandbox=1')
  await expect(page.getByText('Battle Sandbox')).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction((loc) => !!(window as any).__game?.getState().battles[loc], SANDBOX_LOC, { timeout: 15_000 })

  const snap = async () => page.evaluate((loc) => {
    const s = (window as any).__game.getState()
    return { ticks: s.ticks, round: s.battles[loc]?.round ?? 0 }
  }, SANDBOX_LOC)

  // Turn on the freeze, then play.
  await page.getByRole('checkbox').check()
  const before = await snap()
  await page.getByRole('button', { name: /▶ Play/ }).click()
  await expect.poll(async () => (await snap()).round, { timeout: 5_000 }).toBeGreaterThan(before.round)
  const after = await snap()
  await page.getByRole('button', { name: /⏸ Pause/ }).click()

  // Battle advanced; the store's normal-play tick did NOT.
  expect(after.round).toBeGreaterThan(before.round)
  expect(after.ticks).toBe(before.ticks)

  await page.screenshot({ path: 'e2e/__shots__/battle-sandbox-freeze.png' })

  // Sanity: with the freeze OFF, the store tick DOES advance.
  await page.getByRole('checkbox').uncheck()
  const t0 = (await snap()).ticks
  await page.getByRole('button', { name: /▶ Play/ }).click()
  await expect.poll(async () => (await snap()).ticks, { timeout: 5_000 }).toBeGreaterThan(t0)
  await page.getByRole('button', { name: /⏸ Pause/ }).click()
})
