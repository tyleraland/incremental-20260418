import { test, expect } from '@playwright/test'

// Regression: switching the watched battle must render the new battle's tokens IN PLACE.
// Two fields share monster ids (slime#0 …); if the battle view doesn't remount per
// location, React REUSES those chip DOM nodes across battles and CSS-transitions
// them across the screen (the "slide" bug). Deterministic check: tag slime#0's node
// in battle A, switch to B, and verify B's slime#0 is a DIFFERENT node (remounted),
// not the reused (sliding) one.
test('switching location remounts tokens (no cross-battle reuse)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__game && !!(window as any).__proto, { timeout: 30_000 })
  await page.evaluate(async () => {
    const G = (window as any).__game
    const mk = (id: string) => ({ id, region: 'world', name: id, description: '', traits: [], monsterIds: ['slime'],
      familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 3, openWorldSize: 15 })
    const u = (id: string, loc: string) => ({ ...G.getState().units[0], id, locationId: loc, travelPath: null })
    G.setState({ locations: [mk('A'), mk('B')], units: [u('u1', 'A'), u('u2', 'B')], battles: {}, deployMode: 'instant', mapMode: 'world' })
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    for (let i = 0; i < 60; i++) { G.getState().tick(); await frame() }
    G.getState().setSelectedLocation('A')
    ;(window as any).__proto.getState().requestZoom(2)
  })
  await page.waitForTimeout(1200)
  const result = await page.evaluate(async () => {
    const G = (window as any).__game
    const chips = () => Array.from(document.querySelectorAll('[data-cid]')) as any[]
    const a = chips()
    if (a.length === 0) return { ok: false, reason: 'no tokens in A' }
    a.forEach((el) => { el.__battleTag = 'A' })   // tag every node shown for battle A
    G.getState().setSelectedLocation('B')         // breadcrumb-style switch to battle B
    // Wait until B has actually rendered — its unique hero u2 appears (u1 was A's).
    let ready = false
    for (let i = 0; i < 90 && !ready; i++) { await new Promise((r) => requestAnimationFrame(r)); ready = !!document.querySelector('[data-cid="u2"]') }
    if (!ready) return { ok: false, reason: 'battle B never rendered' }
    // Units already present when B mounts must NOT replay the chip-spawn pop
    // (grow/bounce/shrink) — that animation marks a unit ARRIVING mid-battle. On a
    // switch the whole roster is "already there", so no chip should carry the class.
    const popped = chips().filter((el) => el.classList.contains('animate-chip-spawn')).length
    // Any chip still carrying the A tag is a node React KEPT across the switch — it
    // would CSS-transition (slide) from A's spot to B's. Remounting leaves none.
    return { ok: true, reused: chips().filter((el) => el.__battleTag === 'A').length, total: chips().length, popped }
  })
  console.log('[switch]', JSON.stringify(result))
  expect(result.ok, result.reason ?? '').toBe(true)
  expect(result.reused, 'tokens must remount (not reuse old battle nodes → no slide)').toBe(0)
  expect(result.popped, 'roster present at mount must not replay the spawn pop on a switch').toBe(0)
})
