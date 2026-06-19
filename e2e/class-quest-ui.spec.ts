import { test, expect } from '@playwright/test'

// Visual + behavioural check for the city / dungeon / lens-chrome tweaks:
//   - "Enter <Dungeon>" button is compact and no longer says "descend"
//   - a prominent Exit chip leaves the dungeon map back to the world
//   - the bottom-half lens tabs + content read a touch larger
//   - the top bar (esp. a prominent Guild) is legible
// Not part of `npm run ci` — run with the e2e harness.

const BASE = '/incremental-20260418/'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = (page: import('@playwright/test').Page, fn: string) => page.evaluate(fn)

test('city/dungeon/lens chrome tweaks', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/chrome-${proj}-${n}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // Top bar: the Guild button shows its label even on mobile (prominent).
  await expect(page.getByRole('button', { name: 'Guild', exact: true })).toBeVisible()
  await shot('01-topbar')

  // Focus Geffen City and open the Location lens.
  await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { setSelectedLocation: (id: string) => void } } }).__game.getState()
    g.setSelectedLocation('geffen-city')
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(400)

  // The dungeon-entry button is present, compact, and no longer says "descend".
  const enter = page.getByRole('button', { name: /Enter Geffen Dungeon/ })
  await expect(enter).toBeVisible()
  await expect(page.getByText('descend')).toHaveCount(0)
  await shot('02-geffen-city')

  // Enter the dungeon → a prominent Exit chip appears in the map breadcrumb.
  await enter.click()
  await page.waitForTimeout(600)
  const exit = page.getByRole('button', { name: /Leave Geffen Dungeon/ })
  await expect(exit).toBeVisible()
  await expect(exit).toContainText('Exit')
  await shot('03-in-dungeon')

  // Exit → back on the world map.
  await exit.click()
  await page.waitForTimeout(600)
  const pageId = await page.evaluate(() => (window as unknown as { __game: { getState: () => { mapPageId: string } } }).__game.getState().mapPageId)
  expect(pageId).toBe('world')
  await shot('04-back-on-world')

  // Class-change board renders for a city with a level-2 Novice selected.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { getState: () => { setSelectedLocation: (id: string) => void }; setState: (s: object) => void } }).__game
    store.getState().setSelectedLocation('prontera-city')
    store.setState({ selectedUnitIds: ['u7'] })
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByRole('button', { name: /Path of the Fighter/ })).toBeVisible()
  await shot('05-class-change')

  // Expand the quest (inline section). Its gear reward is inspectable.
  await page.getByRole('button', { name: /Path of the Fighter/ }).click()       // expand
  await page.getByTitle('Inspect Sword').click()
  await expect(page.getByText('Item Detail')).toBeVisible()
  await shot('05b-reward-inspect')
  await page.getByRole('button', { name: '×', exact: true }).first().click()    // close codex

  // Begin the path → it becomes an in-progress cull objective (0/3), no Complete yet.
  await page.getByRole('button', { name: /Begin — Pell takes/ }).click()
  await page.waitForTimeout(300)
  await expect(page.getByText('0/3').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Complete the class change/ })).toHaveCount(0)
  await shot('06-quest-in-progress')

  // Credit Pell three killing blows on the objective monster (Tough Slime) → ready.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (fn: (s: { unitStats: Record<string, { killsByMonster?: Record<string, number> }> }) => object) => void } }).__game
    store.setState((s) => ({ unitStats: { ...s.unitStats, u7: { ...(s.unitStats.u7 ?? {}), monstersDefeated: 3, killsByMonster: { 'tough-slime': 3 } } } }))
  })
  await page.waitForTimeout(300)
  const complete = page.getByRole('button', { name: /Complete the class change/ })
  await expect(complete).toBeVisible()
  await shot('07-quest-ready')

  // Complete → Pell becomes a Fighter on the real unit.
  await complete.click()
  await page.waitForTimeout(300)
  const cls = await page.evaluate(() => (window as unknown as { __game: { getState: () => { units: { id: string; class: string | null }[] } } }).__game.getState().units.find((u) => u.id === 'u7')?.class)
  expect(cls).toBe('Fighter')

  // ── Collect objective (Path of the Rogue, Payon) ────────────────────────────
  // Promote two more Novices to level 2 and take them to Payon.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { getState: () => { setSelectedLocation: (id: string) => void }; setState: (s: object) => void } }).__game
    store.setState((s: { units: { id: string; level: number }[] }) => ({ units: s.units.map((u) => (u.id === 'u8' || u.id === 'u9' ? { ...u, level: 2 } : u)) }))
    store.getState().setSelectedLocation('payon-city')
    store.setState({ selectedUnitIds: ['u8'] })
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Path of the Rogue/ }).click()          // expand
  await page.getByRole('button', { name: /Begin — .* takes/ }).click()
  await page.waitForTimeout(300)
  // The collect path tracks an ephemeral quest item (Bone Splinter) at 0/3.
  await expect(page.getByText('Bone Splinter').first()).toBeVisible()
  await expect(page.getByText('0/3').first()).toBeVisible()
  await shot('08-collect-in-progress')

  // Simulate the monster drops filling the quest-item ledger → ready.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (fn: (s: { questItems: Record<string, number> }) => object) => void } }).__game
    store.setState((s) => ({ questItems: { ...s.questItems, 'qi-bone-splinter': 3 } }))
  })
  await page.waitForTimeout(300)
  // Completing a collect/hand-in goes through a "will be consumed" confirm.
  await page.getByRole('button', { name: /Hand in & become a Rogue/ }).click()
  await page.getByRole('button', { name: 'Hand in', exact: true }).click()
  await page.waitForTimeout(300)
  const cls8 = await page.evaluate(() => (window as unknown as { __game: { getState: () => { units: { id: string; class: string | null }[] } } }).__game.getState().units.find((u) => u.id === 'u8')?.class)
  expect(cls8).toBe('Rogue')

  // ── Hand-in objective (Path of the Ranger, Payon) — non-ephemeral inventory ──
  // Stock the guild with Boar Hides and take a Novice to hand them in.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (s: object) => void } }).__game
    store.setState({ selectedUnitIds: ['u9'], miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 5 }] })
  })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Path of the Ranger/ }).click()         // expand
  await page.getByRole('button', { name: /Begin — .* takes/ }).click()
  await page.waitForTimeout(300)
  // 5 hides in the stash already satisfies "hand in 3" → ready immediately.
  await expect(page.getByText('Boar Hide').first()).toBeVisible()
  await shot('09-handin-ready')
  await page.getByRole('button', { name: /Hand in & become a Ranger/ }).click()
  await page.getByRole('button', { name: 'Hand in', exact: true }).click()
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => {
    const s = (window as unknown as { __game: { getState: () => { units: { id: string; class: string | null }[]; miscItems: { id: string; quantity: number }[] } } }).__game.getState()
    return { cls: s.units.find((u) => u.id === 'u9')?.class, hides: s.miscItems.find((m) => m.id === 'drop-boar-hide')?.quantity ?? 0 }
  })
  expect(after.cls).toBe('Ranger')
  expect(after.hides).toBe(2)   // 5 − 3 consumed

  // ── Location bounty chain (Boar Meadow) — hero-less, hidden follow-up ────────
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { getState: () => { setSelectedLocation: (id: string) => void }; setState: (s: object) => void } }).__game
    store.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 25 }] })
    store.getState().setSelectedLocation('boar-meadow')
  })
  await page.getByRole('button', { name: 'Location', exact: true }).click()
  await page.waitForTimeout(400)
  // The first bounty is on the board; the 100-hide follow-up is hidden until it's done.
  await expect(page.getByRole('button', { name: /Trapper's Order/ })).toBeVisible()
  await expect(page.getByText("Tannery's Bulk Order")).toHaveCount(0)
  await shot('10-bounty-chain')

  // Hand in 20 of the 25 hides → completes, pays gold, and reveals the next bounty.
  await page.getByRole('button', { name: /Trapper's Order/ }).click()         // expand
  await page.getByRole('button', { name: /Hand in 20 Boar Hides/ }).click()
  await page.getByRole('button', { name: 'Hand in', exact: true }).click()
  await page.waitForTimeout(300)
  await expect(page.getByRole('button', { name: /Tannery's Bulk Order/ })).toBeVisible()
  const bounty = await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { miscItems: { id: string; quantity: number }[] } } }).__game.getState()
    const p = (window as unknown as { __proto?: unknown })
    return { hides: g.miscItems.find((m) => m.id === 'drop-boar-hide')?.quantity ?? 0, gold: g.miscItems.find((m) => m.id === 'm-gold')?.quantity ?? 0, p: !!p }
  })
  expect(bounty.hides).toBe(5)    // 25 − 20 consumed
  expect(bounty.gold).toBe(200)   // reward paid

  // Repeatable kill bounty: cull 100 boars → claim 1 gold, and it stays on the board.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (s: object) => void } }).__game
    store.setState({ monsterDefeated: { 'wild-boar': 100 } })
  })
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Boar Culling Contract/ }).click()    // expand
  await page.getByRole('button', { name: /Claim 1 gold \(repeatable\)/ }).click()
  await page.waitForTimeout(300)
  await expect(page.getByRole('button', { name: /Boar Culling Contract/ })).toBeVisible()  // still posted
  const repeat = await page.evaluate(() => (window as unknown as { __game: { getState: () => { miscItems: { id: string; quantity: number }[] } } }).__game.getState().miscItems.find((m) => m.id === 'm-gold')?.quantity ?? 0)
  expect(repeat).toBe(201)   // 200 + 1

  // All four lens tabs are reachable.
  for (const tab of ['Hero', 'Party', 'Items', 'Location']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await page.waitForTimeout(200)
  }
})

test('quest journal: filter + go to location', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/journal-${proj}-${n}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // Open the Quest Journal from the top bar (next to Guild).
  await page.getByRole('button', { name: 'Quests', exact: true }).click()
  const journal = page.getByTestId('quest-journal')   // scope queries to the overlay
  await expect(journal).toBeVisible()
  // It rolls up class paths (hero) and bounties (guild) from across the world.
  await expect(journal.getByText('Path of the Fighter').first()).toBeVisible()
  await expect(journal.getByText("Trapper's Order").first()).toBeVisible()
  await shot('01-all')

  // Filter to guild-wide quests → the hero class paths drop out.
  await journal.getByRole('button', { name: '⌂ Guild', exact: true }).click()
  await page.waitForTimeout(200)
  await expect(journal.getByText('Path of the Fighter')).toHaveCount(0)
  await expect(journal.getByText("Trapper's Order").first()).toBeVisible()
  await shot('02-guild-only')

  // Filter back to hero quests. The journal rows are the real interactive quest
  // rows: expand one inline, see its objective/reward, then jump to its city.
  await journal.getByRole('button', { name: '◈ Hero', exact: true }).click()
  await page.waitForTimeout(200)
  await journal.getByRole('button', { name: /Path of the Fighter/ }).first().click()   // expand inline
  await page.waitForTimeout(200)
  await expect(journal.getByText('become a Fighter').first()).toBeVisible()
  await shot('03-inline-expand')
  // "Go to location" (inside the expanded row) closes the journal and focuses Prontera.
  await journal.getByRole('button', { name: 'Go to Path of the Fighter' }).click()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('quest-journal')).toHaveCount(0)
  const loc = await page.evaluate(() => (window as unknown as { __game: { getState: () => { selectedLocationId: string | null } } }).__game.getState().selectedLocationId)
  expect(loc).toBe('prontera-city')
})

test('quest journal: redeem a bounty inline (one-stop shop)', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  const shot = (n: string) => page.screenshot({ path: `e2e/__shots__/journal-redeem-${proj}-${n}.png` })

  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // Stock 30 Boar Hides so Boar Meadow's "Trapper's Order" (hand in 20) is ready.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (s: object) => void } }).__game
    store.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 30 }] })
  })

  // Open the journal and redeem the bounty WITHOUT visiting the location.
  await page.getByRole('button', { name: 'Quests', exact: true }).click()
  const journal = page.getByTestId('quest-journal')
  await expect(journal).toBeVisible()
  await journal.getByRole('button', { name: /Trapper's Order/ }).click()        // expand inline
  await journal.getByRole('button', { name: /Hand in 20 Boar Hides/ }).click()
  await journal.getByRole('button', { name: 'Hand in', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('01-redeemed')

  // Reward paid, hides consumed — all from the journal; the follow-up now surfaces.
  const r = await page.evaluate(() => {
    const g = (window as unknown as { __game: { getState: () => { miscItems: { id: string; quantity: number }[] } } }).__game.getState()
    return { hides: g.miscItems.find((m) => m.id === 'drop-boar-hide')?.quantity ?? 0, gold: g.miscItems.find((m) => m.id === 'm-gold')?.quantity ?? 0 }
  })
  expect(r.hides).toBe(10)   // 30 − 20
  expect(r.gold).toBe(200)
  await expect(journal.getByText("Tannery's Bulk Order").first()).toBeVisible()
})

test('world map shows a (?) on locations with rewards ready', async ({ page }, testInfo) => {
  const proj = testInfo.project.name
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // No quests are ready at the start → no nudge on the map.
  await expect(page.getByTitle('Rewards ready to collect')).toHaveCount(0)

  // Stock 30 Boar Hides → Boar Meadow's "Trapper's Order" (hand in 20) is ready.
  await page.evaluate(() => {
    const store = (window as unknown as { __game: { setState: (s: object) => void } }).__game
    store.setState({ miscItems: [{ id: 'drop-boar-hide', name: 'Boar Hide', quantity: 30 }] })
  })
  // Zoom out to the world map.
  await page.getByRole('button', { name: /World/ }).first().click()
  await page.waitForTimeout(900)
  await expect(page.getByTitle('Rewards ready to collect').first()).toBeVisible()
  await page.screenshot({ path: `e2e/__shots__/mapnudge-${proj}-ready.png` })
})
