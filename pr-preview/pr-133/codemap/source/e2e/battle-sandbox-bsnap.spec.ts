import { test, expect } from '@playwright/test'

const BASE = '/incremental-20260418/'
const SANDBOX_LOC = 'perf-sandbox'

// The Battle Sandbox (?sandbox=1) folds in BSNAP replay: paste a snapshot token,
// load it as the watched battle, and watch it advance LIVE (play/pause). This
// serializes the sandbox's own composed scene, reloads it via the BSNAP source,
// and asserts it plays back.
test('battle sandbox replays a BSNAP live', async ({ page }) => {
  await page.goto(BASE + '?sandbox=1')
  await expect(page.getByText('Battle Sandbox')).toBeVisible({ timeout: 30_000 })

  // Wait for the composed scene to stand up, then serialize it to a token.
  await page.waitForFunction((loc) => !!(window as any).__game?.getState().battles[loc], SANDBOX_LOC, { timeout: 15_000 })
  const token = await page.evaluate(async (loc) => {
    const eng = await import('/incremental-20260418/src/engine/index.ts')
    const b = (window as any).__game.getState().battles[loc]
    return (eng as any).serializeBattle(b)
  }, SANDBOX_LOC)
  expect(token.startsWith('BSNAP.')).toBeTruthy()

  // Switch to the BSNAP source and load the token.
  await page.getByRole('button', { name: 'BSNAP replay' }).click()
  await page.getByPlaceholder(/Paste a BSNAP/).fill(token)
  await page.getByRole('button', { name: 'Load snapshot' }).click()
  await expect(page.getByText(/^Loaded — round/)).toBeVisible()

  // Play and confirm the round counter advances (live replay).
  const round = async () =>
    Number(await page.evaluate((loc) => (window as any).__game.getState().battles[loc]?.round ?? 0, SANDBOX_LOC))
  const before = await round()
  await page.getByRole('button', { name: /▶ Play/ }).click()
  await expect.poll(round, { timeout: 5_000 }).toBeGreaterThan(before)
  await page.getByRole('button', { name: /⏸ Pause/ }).click()
  await page.screenshot({ path: 'e2e/__shots__/battle-sandbox-bsnap.png' })
})
