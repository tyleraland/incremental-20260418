import { test } from '@playwright/test'

// Temp visual check for the Town overlay (Market / Craft / Storage) + the
// Items-lens quick-sell. Not part of CI.
const BASE = '/incremental-20260418/'

test('town: market / craft / storage + items sell', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/town-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)

  // Deploy everyone so packs seed in Storage.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: 'Town', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('01-market')

  await page.getByRole('button', { name: 'Craft', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('02-craft')
  // Expand a recipe to see the preview.
  await page.getByText('Iron Ingot', { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('02b-craft-open')
  // Filter to weapons.
  await page.getByRole('button', { name: /Weapons/ }).click().catch(() => {})
  await page.waitForTimeout(200)
  await page.getByText('Iron Sword', { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('02c-craft-weapon-preview')

  await page.getByRole('button', { name: 'Storage', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('03-storage')
  // Hunt to fill a pack.
  await page.getByRole('button', { name: /Hunt/ }).first().click().catch(() => {})
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: /Hunt/ }).first().click().catch(() => {})
  await page.waitForTimeout(200)
  await shot('03b-storage-hunted')
  // Deposit all.
  await page.getByRole('button', { name: /Deposit all/ }).click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('03c-storage-deposited')

  await page.getByRole('button', { name: /Close/ }).click()
  await page.waitForTimeout(200)

  // Items lens quick-sell.
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Sell/ }).first().click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('04-items-sell')
})
