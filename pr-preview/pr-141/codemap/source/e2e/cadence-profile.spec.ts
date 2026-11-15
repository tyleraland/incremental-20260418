import { test } from '@playwright/test'

// Cadence-tier profiling harness (NOT a pass/fail gate — the logged numbers are
// the signal). Answers "is the heavy-field cadence tier (openWorldTimeScale)
// still necessary, or can big/dense fields run full-granularity every tick?"
// by driving the deterministic ?perf scene shaped like the real worst cases and
// sweeping the dev cadence overrides (?hts/?hevery/?decide):
//   • beach  — cap 220 on a 200×200 field (Kanto Beach): the slow tier's home.
//              Spread out, few tokens visible — stresses the ENGINE (220-entity
//              advanceRound per tick) more than the renderer.
//   • dense  — cap 220 packed into 60×60: everything visible at once — the
//              render-bound worst case the tiers were originally tuned on.
// Run: npm run e2e -- cadence-profile.spec.ts --project=mobile-chrome   (4x CPU)

const SETTLE_MS = 2500
const WINDOW_MS = 1200
const WINDOWS = 5

const CONFIGS = [
  // Kanto-Beach shape. Shipped tier (2026-07 retune) = timeScale 3 / round
  // every 2 ticks / decide 5; the old coarse tier kept as an explicit override.
  { name: 'beach shipped (current tier)', q: 'cap=220&size=200' },
  { name: 'beach coarse  (ts1 every6)', q: 'cap=220&size=200&hts=1&hevery=6' },
  { name: 'beach RIP     (ts6 every1)', q: 'cap=220&size=200&hts=6&hevery=1' },
  { name: 'beach RIP+decide1         ', q: 'cap=220&size=200&hts=6&hevery=1&decide=1' },
  // Dense-visible worst case.
  { name: 'dense shipped (ts1 every6)', q: 'cap=220&size=60' },
  { name: 'dense RIP     (ts6 every1)', q: 'cap=220&size=60&hts=6&hevery=1' },
  // Tier-boundary probes: can the middle tiers rip? (shipped: 90→ts3, 140→ts2)
  { name: 'cap90 shipped (ts3 every2)', q: 'cap=90&size=200' },
  { name: 'cap90 RIP     (ts6 every1)', q: 'cap=90&size=200&hts=6&hevery=1' },
  { name: 'cap140 RIP    (ts6 every1)', q: 'cap=140&size=200&hts=6&hevery=1' },
  // Pathing-load sweep (steerAround visibility-graph cache, 2026-07): tick cost
  // as barrier COUNT grows past the old envelope (16) on the default busy field
  // (Harpy: cap 50 on 60×60), plus the engine-heavy beach shape. These runs are
  // what MAX_BENCHED_BARRIERS in map-perf-envelope.test.ts cites.
  { name: 'barriers16 (old envelope)  ', q: 'barriers=16' },
  { name: 'barriers40                 ', q: 'barriers=40' },
  { name: 'barriers72 (live envelope) ', q: 'barriers=72' },
  { name: 'beach barriers40           ', q: 'cap=220&size=200&barriers=40' },
  // P5 moderate-envelope re-bench (2026-07): fill in the synthetic COUNT sweep
  // between 40 and 72, and add REALISTIC geometry via ?genmap (a real
  // generateMap bake through specBarriers — river/lake band cover + gate plugs
  // + outcrops, kitless so every plug is closed; the dungeon's maximal-rect
  // wall cover at its 72 budget). The field recipe's per-pass allotments
  // plateau its spend under the cap (~21 rects at size 96, ~38 at 200 for any
  // cap ≥40 — probed 2026-07), so the realistic HIGH-count classes are heavy
  // dungeon seeds (genseed=31 spends 57); genmap=field benches the long-thin
  // band shapes live river maps actually ship. window.__perfGen carries the
  // baked rect count into the log.
  { name: 'barriers48                 ', q: 'barriers=48' },
  { name: 'barriers56                 ', q: 'barriers=56' },
  { name: 'barriers64                 ', q: 'barriers=64' },
  { name: 'river96  (live field shape)', q: 'genmap=field&size=96' },
  { name: 'river200 (big field shape) ', q: 'genmap=field&size=200' },
  { name: 'beach river (engine-heavy) ', q: 'cap=220&size=200&genmap=field' },
  { name: 'dungeon72 heavy (57 rects) ', q: 'genmap=dungeon&genseed=31' },
  { name: 'dungeon72 heavy crowd30    ', q: 'genmap=dungeon&genseed=31&cap=30' },
] as const

async function sampleRender(page: import('@playwright/test').Page) {
  return page.evaluate(
    ({ windowMs, windows }) =>
      new Promise<{ fpsMedian: number; fpsMin: number; fpsWindows: number[]; longTaskMs: number; tokens: number }>((resolve) => {
        let longTaskMs = 0
        let po: PerformanceObserver | undefined
        try {
          po = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTaskMs += e.duration })
          po.observe({ entryTypes: ['longtask'] })
        } catch { /* longtask unsupported */ }
        const fpsWindows: number[] = []
        let frames = 0
        let winStart = performance.now()
        const tick = () => {
          frames++
          const now = performance.now()
          if (now - winStart >= windowMs) {
            fpsWindows.push(frames / ((now - winStart) / 1000))
            frames = 0
            winStart = now
            if (fpsWindows.length >= windows) {
              po?.disconnect()
              const sorted = [...fpsWindows].sort((a, b) => a - b)
              resolve({
                fpsMedian: sorted[Math.floor(sorted.length / 2)],
                fpsMin: sorted[0],
                fpsWindows,
                longTaskMs,
                tokens: document.querySelectorAll('[data-cid]').length,
              })
              return
            }
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { windowMs: WINDOW_MS, windows: WINDOWS },
  )
}

// Pause the live loop and time raw tick() calls — engine+store cost isolated
// from render. On coarse tiers most ticks skip the round (everyTicks pairing),
// so mean spreads the round cost; max ≈ the tick that actually ran a round.
async function sampleEngine(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const g = (window as unknown as { __game: { getState: () => any; setState: (s: any) => void } }).__game
    g.setState({ paused: true })
    await new Promise((r) => setTimeout(r, 250))
    const durs: number[] = []
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now()
      g.getState().tick()
      durs.push(performance.now() - t0)
    }
    g.setState({ paused: false })
    durs.sort((a, b) => a - b)
    return {
      meanTickMs: durs.reduce((s, v) => s + v, 0) / durs.length,
      p50TickMs: durs[Math.floor(durs.length / 2)],
      maxTickMs: durs[durs.length - 1],
    }
  })
}

for (const cfg of CONFIGS) {
  test(`cadence: ${cfg.name.trim()}`, async ({ page, browserName }, testInfo) => {
    test.setTimeout(120_000)
    await page.goto(`/?perf=1&skin=paper&${cfg.q}`)
    if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 5, undefined, { timeout: 30_000 })
    await page.waitForTimeout(SETTLE_MS)

    const r = await sampleRender(page)
    const e = await sampleEngine(page)
    // ?genmap runs bake real geometry — log what the bake actually spent (the
    // rect COUNT is the variable under test; the cap is just its ceiling).
    const gen = await page.evaluate(() => (window as unknown as { __perfGen?: { rects: number; size: number; ok: boolean } }).__perfGen ?? null)
    console.log(
      `[${cfg.name}] fps median ${r.fpsMedian.toFixed(1)} (min ${r.fpsMin.toFixed(1)}; ${r.fpsWindows.map((f) => f.toFixed(0)).join('/')})` +
      ` · longtask ${r.longTaskMs.toFixed(0)}ms · visible tokens ${r.tokens}` +
      ` · tick ms mean ${e.meanTickMs.toFixed(1)} / p50 ${e.p50TickMs.toFixed(1)} / max ${e.maxTickMs.toFixed(1)}` +
      (gen ? ` · gen ${gen.rects} rects on ${gen.size}² (valid ${gen.ok})` : ''),
    )
    await testInfo.attach(`cadence-${cfg.name.trim()}.json`, { body: JSON.stringify({ ...r, ...e, gen }, null, 2), contentType: 'application/json' })
  })
}
