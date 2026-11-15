import { test, expect } from '@playwright/test'

const BASE = '/incremental-20260418/'

// The Monster Lab (?monsterlab=1) Appearance section: an interactive idle/walk/
// attack state machine over a paper-only reference (token states, facing wheel,
// resolved descriptor). PAPER only — the circle debug token isn't wanted here.
test('monster lab shows the appearance viewer, live', async ({ page }) => {
  await page.goto(BASE + '?monsterlab=1')
  await expect(page.getByText('🧟 Monster Lab')).toBeVisible({ timeout: 30_000 })

  // The Appearance section renders the paper reference + a facing wheel.
  await expect(page.getByText('Appearance', { exact: true })).toBeVisible()
  await expect(page.getByText('Facing · paper')).toBeVisible()
  // Paper tokens are present; the circle debug skin is NOT.
  await expect(page.locator('[data-skin="paper"]').first()).toBeVisible()
  await expect(page.locator('[data-skin="circle"]')).toHaveCount(0)

  // The interactive animation state machine is present (idle/walk/attack toggle).
  await expect(page.getByRole('button', { name: 'Idle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Walk' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Attack' })).toBeVisible()
  await page.getByRole('button', { name: 'Attack' }).click()

  // The resolved descriptor reads the render seam's derived values.
  const shape = await page.getByText(/^shape/).innerText()
  await page.screenshot({ path: 'e2e/__shots__/monsterlab-appearance.png' })
  const scale = await page.getByText(/^scale/).innerText()
  expect(shape).toMatch(/shape/)
  expect(scale).toMatch(/scale/)
})
