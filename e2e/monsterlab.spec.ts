import { test, expect } from '@playwright/test'

// Verify the Monster Lab live-tunes the registry and emits a change report.
test('monster lab tunes live + generates a change request', async ({ page }) => {
  await page.goto('/?monsterlab=1')
  await expect(page.getByText('Monster Lab', { exact: false }).first()).toBeVisible()

  // Pick the Slime from the list.
  await page.getByRole('button', { name: /^Slime/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Slime' })).toBeVisible()

  // Set Health directly, then read the live registry to confirm the tweak landed.
  const healthInput = page.locator('label', { hasText: 'Health' }).first().locator('input')
  await healthInput.fill('40')
  await healthInput.blur()

  // Persisted override (survives reload → applied to the live registry on boot).
  const stored = await page.evaluate(() => localStorage.getItem('monster-overrides'))
  expect(JSON.parse(stored!)['slime'].health).toBe(40)

  // Add a skill.
  await page.locator('select').filter({ hasText: 'Add skill' }).selectOption({ index: 1 })
  await page.getByRole('button', { name: '+ Add skill' }).click()

  // Generate the change request; the report should mention slime + health.
  await page.getByRole('button', { name: /Change request/ }).click()
  const report = await page.locator('textarea[readonly]').inputValue()
  expect(report).toContain('`slime`')
  expect(report).toContain('health')
  expect(report).toContain('| `health` | 25 | **40** |')
})
