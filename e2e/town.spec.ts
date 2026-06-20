import { test } from '@playwright/test'

// Temp visual check for the redesigned Town (Market bulk / Cards / Stash) + the
// per-hero Cards (sockets) board and pack. Not part of CI.
const BASE = '/incremental-20260418/'

test('town + hero cards/sockets', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/town-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(500)

  // Town: Market (bulk) → Cards → Stash
  await page.getByRole('button', { name: 'Town', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Select junk' }).click().catch(() => {})
  await page.waitForTimeout(200)
  await shot('01-market-bulk')

  await page.getByRole('button', { name: 'Cards', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('02-cards')
  await page.getByText('Wolf Card', { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('02b-card-codex')
  await page.keyboard.press('Escape').catch(() => {})
  await page.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {})

  await page.getByRole('button', { name: 'Stash', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('03-stash')
  await page.getByRole('button', { name: /Close/ }).click()
  await page.waitForTimeout(200)

  // Hero board: Cards (sockets) sub-tab
  await page.getByRole('button', { name: /Miri/ }).first().dblclick()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Cards', exact: true }).click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('04-hero-sockets')
  // Tap an empty slot to open the picker.
  await page.getByText(/empty slot/).first().click().catch(() => {})
  await page.waitForTimeout(250)
  await shot('04b-hero-socket-picker')

  // Hero Gear sub-tab shows pack strip + socket pips.
  await page.getByRole('button', { name: 'Gear', exact: true }).click().catch(() => {})
  await page.waitForTimeout(300)
  await shot('05-hero-gear-pack')
})
