import { test } from '@playwright/test'

// "Many entities" perf harness (NOT a pass/fail gate — the logged numbers are the
// signal). Sweeps party size × monster cap and, for each scene, separates the two
// costs so we know which to attack:
//   • ENGINE  — pause the store loop, call tick() N times, time each. The tick that
//               runs advanceRound is the main-thread long-task that starves the
//               frame; we report mean + max single-tick ms and entity count.
//   • RENDER  — let the real rAF loop run and sample sustained fps + long-task time
//               + arena DOM node count.
// Run: npm run e2e -- many-entities.spec.ts --project=mobile-chrome   (4x CPU)

const SCENARIOS = [
  { heroes: 6, cap: 12 },
  { heroes: 12, cap: 25 },
  { heroes: 15, cap: 35 },
  { heroes: 15, cap: 50 },
]

const SETTLE_MS = 2500
const SAMPLE_MS = 4000

async function sampleRender(page: import('@playwright/test').Page, ms: number) {
  return page.evaluate(
    (durationMs) =>
      new Promise<{ fps: number; longTaskMs: number; longTaskCount: number; arenaNodes: number; tokens: number }>((resolve) => {
        let frames = 0, longTaskMs = 0, longTaskCount = 0
        let po: PerformanceObserver | undefined
        try {
          po = new PerformanceObserver((list) => { for (const e of list.getEntries()) { longTaskMs += e.duration; longTaskCount++ } })
          po.observe({ entryTypes: ['longtask'] })
        } catch { /* longtask unsupported */ }
        const start = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - start < durationMs) { requestAnimationFrame(tick); return }
          const seconds = (performance.now() - start) / 1000
          po?.disconnect()
          const arena = document.querySelector('.aspect-square')
          resolve({
            fps: frames / seconds, longTaskMs, longTaskCount,
            arenaNodes: arena ? arena.querySelectorAll('*').length : 0,
            tokens: document.querySelectorAll('[data-cid]').length,
          })
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
}

// Pause the live loop, then time raw tick() calls to isolate engine cost.
async function sampleEngine(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const g = (window as unknown as { __game: { getState: () => any; setState: (s: any) => void } }).__game
    g.setState({ paused: true })
    await new Promise((r) => setTimeout(r, 200))
    const durs: number[] = []
    const N = 40
    for (let i = 0; i < N; i++) {
      const t0 = performance.now()
      g.getState().tick()
      durs.push(performance.now() - t0)
    }
    g.setState({ paused: false })
    const st = g.getState()
    const battle = Object.values(st.battles)[0] as { combatants: unknown[]; round: number } | undefined
    durs.sort((a, b) => a - b)
    const mean = durs.reduce((s, v) => s + v, 0) / durs.length
    return {
      ents: battle ? battle.combatants.length : 0,
      meanTickMs: mean,
      maxTickMs: durs[durs.length - 1],
      p50TickMs: durs[Math.floor(durs.length / 2)],
    }
  })
}

test('many-entities: engine vs render cost sweep', async ({ page, browserName }, testInfo) => {
  test.setTimeout(300_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  console.log(`\n[many] sweep on ${testInfo.project.name}${throttle ? ' (4x CPU)' : ''}\n`)
  for (const s of SCENARIOS) {
    await page.goto(`/?perf=1&heroes=${s.heroes}&cap=${s.cap}`)
    if (throttle) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 5, { timeout: 30_000 })
    await page.waitForTimeout(SETTLE_MS)

    const render = await sampleRender(page, SAMPLE_MS)
    const engine = await sampleEngine(page)
    console.log(
      `[many] heroes=${s.heroes} cap=${s.cap} → ents=${engine.ents}  ` +
        `ENGINE mean=${engine.meanTickMs.toFixed(1)}ms p50=${engine.p50TickMs.toFixed(1)} max=${engine.maxTickMs.toFixed(1)}  ` +
        `RENDER fps=${render.fps.toFixed(0)} longtask=${render.longTaskCount}(${render.longTaskMs.toFixed(0)}ms) ` +
        `domNodes=${render.arenaNodes} tokens=${render.tokens}`,
    )
  }
})
