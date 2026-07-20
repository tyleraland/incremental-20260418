import { test } from '@playwright/test'

// Temp visual check: new lens tabs (Skills/Tactics top-level, Party in nav,
// Equipment lens), merchant buy-cart + sell tone toggle, Stash Cards sub-tab.
const BASE = '/incremental-20260418/'

test('lens tabs + market cart/tone + party nav', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/town-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    const ids = g.units.map((u) => u.id)
    g.assignUnits(ids.slice(1), 'prontera-field-1')
    g.assignUnits([ids[0]], 'prontera-city')
  })
  await page.waitForTimeout(500)

  // Lens top tabs now: Location / Hero / Equipment / Skills / Tactics
  await page.getByRole('button', { name: /Aldric/ }).first().dblclick().catch(() => {})
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('01-equipment-lens')
  // Open the full-cover swap menu.
  await page.getByText('Main Hand').first().click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('01b-swap-menu')
  await page.getByRole('button', { name: /Close/ }).click().catch(() => {})
  await page.waitForTimeout(200)

  // Party is now in the top nav.
  await page.getByRole('button', { name: 'Party', exact: true }).click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('02-party-nav')
  await page.getByRole('button', { name: /Close/ }).click().catch(() => {})
  await page.waitForTimeout(200)

  // Market: buy cart (+/-) and sell tone toggle. Reached via the ☰ menu → Market.
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Market/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByText('Prontera General Store').first().click().catch(() => {})
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '＋', exact: true }).first().click().catch(() => {})
  await page.getByRole('button', { name: '＋', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(200)
  await shot('03-shop-cart')
  // Cycle the sell tone toggle to Market.
  await page.getByRole('button', { name: /Wanted/ }).first().click().catch(() => {})
  await page.waitForTimeout(200)
  await shot('03b-shop-tone-market')

  // Stash is its own standalone screen (☰ menu → Stash), hosting the Cards sub-tab.
  await page.getByRole('button', { name: /Close/ }).click().catch(() => {})
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /Stash/ }).first().click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Cards', exact: true }).click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('04-stash-cards')
})
