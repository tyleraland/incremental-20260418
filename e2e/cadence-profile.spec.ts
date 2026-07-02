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
  // Kanto-Beach shape. Shipped = timeScale 1 / round every 6 ticks / decide 5.
  { name: 'beach shipped (ts1 every6)', q: 'cap=220&size=200' },
  { name: 'beach mid     (ts3 every2)', q: 'cap=220&size=200&hts=3&hevery=2' },
  { name: 'beach RIP     (ts6 every1)', q: 'cap=220&size=200&hts=6&hevery=1' },
  { name: 'beach RIP+decide1         ', q: 'cap=220&size=200&hts=6&hevery=1&decide=1' },
  // Dense-visible worst case.
  { name: 'dense shipped (ts1 every6)', q: 'cap=220&size=60' },
  { name: 'dense RIP     (ts6 every1)', q: 'cap=220&size=60&hts=6&hevery=1' },
  // Tier-boundary probes: can the middle tiers rip? (shipped: 90→ts3, 140→ts2)
  { name: 'cap90 shipped (ts3 every2)', q: 'cap=90&size=200' },
  { name: 'cap90 RIP     (ts6 every1)', q: 'cap=90&size=200&hts=6&hevery=1' },
  { name: 'cap140 RIP    (ts6 every1)', q: 'cap=140&size=200&hts=6&hevery=1' },
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
    console.log(
      `[${cfg.name}] fps median ${r.fpsMedian.toFixed(1)} (min ${r.fpsMin.toFixed(1)}; ${r.fpsWindows.map((f) => f.toFixed(0)).join('/')})` +
      ` · longtask ${r.longTaskMs.toFixed(0)}ms · visible tokens ${r.tokens}` +
      ` · tick ms mean ${e.meanTickMs.toFixed(1)} / p50 ${e.p50TickMs.toFixed(1)} / max ${e.maxTickMs.toFixed(1)}`,
    )
    await testInfo.attach(`cadence-${cfg.name.trim()}.json`, { body: JSON.stringify({ ...r, ...e }, null, 2), contentType: 'application/json' })
  })
}
