import { test } from '@playwright/test'

// Visual harness for the ?proto=1 "Tactician" UI-overhaul prototype.
// Tabs: Location / Hero / Party / Items / Guild / Reports / Time. The stage is
// navigated by a zoom breadcrumb; tapping a combatant opens a bottom sheet.
// Not part of CI.

const BASE = '/incremental-20260418/?proto=1'

test('proto: breadcrumb + tabs + bottom-sheet walkthrough', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/proto-${proj}-${name}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await shot('01-initial')

  // Roster sort control: default is grouped-by-Area; switch to Class grouping.
  await page.getByRole('button', { name: 'Sort roster' }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: /Class/ }).first().click()
  await page.waitForTimeout(250)
  await shot('02-roster-sorted')

  // Stack a party onto one field for the matrix / battlefield.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    g.assignUnits(g.units.map((u) => u.id), 'prontera-field-1')
  })
  await page.waitForTimeout(600)

  // Double-tap a roster hero — focus: fly the camera to their battlefield + Hero.
  await page.getByRole('button', { name: /Mira/ }).first().dblclick()
  await page.waitForTimeout(1000)
  await shot('03-hero-battlestatus')

  // Tap the hero's chip on the battlefield → the combatant bottom sheet.
  // The battlefield chip's title is "<name> — <hp>/<max>" or "— casting …"
  // (the roster chip is "<name> — Lv N <class>"), so match the combat form.
  await page.getByTitle(/Ashdown — (\d|casting)/).first().click({ timeout: 4000, force: true }).catch(() => {})
  await page.waitForTimeout(400)
  await shot('04-combatant-bottomsheet')
  await page.getByRole('button', { name: 'Close unit detail' }).click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(200)

  // Hero → Skills: the action bar (bottom) + Skill tree overlay (top, in front
  // of the battlefield).
  await page.getByRole('button', { name: 'Skills', exact: true }).click()
  await page.waitForTimeout(250)
  await shot('04b-hero-skills')
  await page.getByRole('button', { name: /Skill tree/ }).click()
  await page.waitForTimeout(300)
  await shot('04c-skill-tree')
  await page.getByRole('button', { name: /Close/ }).click().catch(() => {})
  await page.waitForTimeout(200)

  // Party matrix — Auto is a two-tap commit (arm → ghosts → Apply).
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Auto/ }).click() // arm: show ghosts
  await page.waitForTimeout(250)
  await shot('05-party-auto-armed')
  await page.getByRole('button', { name: /Apply/ }).click() // commit
  await page.waitForTimeout(250)
  await shot('05b-party-applied')
  await page.getByRole('button', { name: 'Items', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('06-items')
  // Tri-state type filter: include Weapons only.
  await page.getByRole('button', { name: /Weapons/ }).click()
  await page.waitForTimeout(250)
  await shot('06b-items-filtered')
  // Scope to what this hero can use, then collapse a section.
  await page.getByRole('button', { name: /can use/ }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /1H Weapon/i }).click().catch(() => {})
  await page.waitForTimeout(200)
  await shot('06c-items-scope-collapse')

  // Global screens now live in the top bar as full-screen overlays.
  await page.getByRole('button', { name: 'Guild', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('07-guild')
  await page.getByRole('button', { name: /Close/ }).click()
  await page.getByRole('button', { name: 'Reports', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('08-reports')
  await page.getByRole('button', { name: /Close/ }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('09-settings')
  await page.getByRole('button', { name: /Close/ }).click()
  await page.waitForTimeout(200)

  // Spread a few heroes so several locations are occupied (for the stepper).
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { units: { id: string }[]; assignUnits: (ids: string[], loc: string) => void } } }).__game.getState()
    const ids = g.units.map((u) => u.id)
    g.assignUnits([ids[0]], 'geffen-field-1')
    g.assignUnits([ids[1]], 'prontera-city')
    g.assignUnits([ids[2]], 'beach-1')
  })
  await page.waitForTimeout(400)

  // Zoom breadcrumb back out to the world.
  await page.getByRole('button', { name: /World/ }).first().click()
  await page.waitForTimeout(800)
  await shot('10-world')

  // ‹ › stepper cycles between locations that have units assigned.
  await page.getByRole('button', { name: 'Next location with units' }).click()
  await page.waitForTimeout(800)
  await shot('11-step-next')
  await page.getByRole('button', { name: 'Next location with units' }).click()
  await page.waitForTimeout(800)
  await shot('12-step-next2')

  // Quiet single-tap a hero who is NOT on the viewed battlefield: camera stays,
  // chip turns amber, and the Hero lens shows the "elsewhere" focus cue.
  await page.getByRole('button', { name: /Aldric/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Hero', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('13-quiet-select-cue')
})
