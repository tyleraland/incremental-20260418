import { test } from '@playwright/test'

// Temp visual check: merchant-shop Market, Stash equipment sockets (in-town
// gating), Cards, and the hero consumable action slot. Not part of CI.
const BASE = '/incremental-20260418/'

test('merchant market + stash sockets + consumable slot', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/town-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)

  // Put a hero in a city (so a merchant is open) and the rest on a field.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    const ids = g.units.map((u) => u.id)
    g.assignUnits(ids.slice(1), 'prontera-field-1')
    g.assignUnits([ids[0]], 'prontera-city')
  })
  await page.waitForTimeout(500)

  // Town → Market: merchant grouped by location; open the Prontera shop.
  await page.getByRole('button', { name: 'Town', exact: true }).click()
  await page.waitForTimeout(400)
  await shot('01-market-merchants')
  await page.getByText('Prontera General Store').first().click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('01b-shop-open')

  // Stash → Equipment sockets (in-town gating).
  await page.getByRole('button', { name: 'Stash', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('02-stash-equipment')
  await page.locator('button', { hasText: /Knife|Sword|Bow|Armor/ }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('02b-stash-socket-editor')

  await page.getByRole('button', { name: /Close/ }).click()
  await page.waitForTimeout(200)

  // Hero → Skills: consumable in the action bar.
  await page.getByRole('button', { name: /Aldric/ }).first().dblclick().catch(() => {})
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Skills', exact: true }).click().catch(() => {})
  await page.waitForTimeout(300)
  // Tap an empty action slot, then assign a consumable.
  await page.getByRole('button', { name: '＋', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('03-action-slot-picker')
})
