import { test } from '@playwright/test'

// Perf ATTRIBUTION probe (NOT a gate — the console rows are the deliverable).
//   npm run perf-probe
// Drives a DENSE mob (?cap high, small field so the party-fit camera frames the
// crowd) and, via CDP Performance counters, splits main-thread time into Script
// (React/JS + engine), RecalcStyle, and Layout over a fixed window — so a
// bottleneck in the paper style / animations is NAMED, not guessed. Matrix:
// {circle,paper} × LOD {normal, off} where off (?lod=off) forces full detail
// (labels + facing nubs + attack/hit animations) at any density — the worst
// case. Read the circle→paper delta to isolate the skin, normal→off for
// labels+animations.
//
// Reference (4x-throttled mobile, ~90 on-screen, after the body-LOD pass):
//   circle normal ~3.7fps  paper normal ~3.5fps   (body LOD closes the gap)
//   circle off    ~2.5fps  paper off    ~2.1fps   (full detail, all animating)
// Script (~2500ms) dominates and is skin-independent (engine tick + reconcile);
// the paper cost is RecalcStyle, scaling with per-token node count.
const CAP = 100, SIZE = 26, WINDOW_MS = 5000

type Row = { skin: string; lod: string; fps: number; tokens: number; nodes: number; scriptMs: number; styleMs: number; layoutMs: number; layoutCount: number; styleCount: number; taskMs: number }

for (const skin of ['circle', 'paper'] as const) {
  for (const lod of ['normal', 'off'] as const) {
    test(`dense ${skin} lod=${lod}`, async ({ page, browserName }, testInfo) => {
      const lodQ = lod === 'off' ? '&lod=off' : ''
      await page.goto(`/?perf=1&skin=${skin}&cap=${CAP}&size=${SIZE}${lodQ}`)
      const cdp = await page.context().newCDPSession(page)
      if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      }
      await cdp.send('Performance.enable')
      await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.waitForFunction(() => {
        const a = document.querySelector('.aspect-square')
        return !!a && a.querySelectorAll('[data-skin]').length > 20
      }, null, { timeout: 30_000 })
      await page.waitForTimeout(800)

      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
      const m0 = await metrics()
      const fps = await page.evaluate((ms) => new Promise<number>((resolve) => {
        let frames = 0; const t0 = performance.now()
        const tick = () => { frames++; if (performance.now() - t0 >= ms) resolve(frames / ((performance.now() - t0) / 1000)); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }), WINDOW_MS)
      const m1 = await metrics()
      const counts = await page.evaluate(() => {
        const a = document.querySelector('.aspect-square')!
        return { tokens: a.querySelectorAll('[data-skin]').length, nodes: a.querySelectorAll('*').length }
      })
      const d = (k: string) => (m1[k] ?? 0) - (m0[k] ?? 0)
      const row: Row = {
        skin, lod, fps: +fps.toFixed(1), tokens: counts.tokens, nodes: counts.nodes,
        scriptMs: +(d('ScriptDuration') * 1000).toFixed(0), styleMs: +(d('RecalcStyleDuration') * 1000).toFixed(0),
        layoutMs: +(d('LayoutDuration') * 1000).toFixed(0), layoutCount: d('LayoutCount'), styleCount: d('RecalcStyleCount'),
        taskMs: +(d('TaskDuration') * 1000).toFixed(0),
      }
      console.log(`[PROBE] ${JSON.stringify(row)}`)
      await testInfo.attach('probe.json', { body: JSON.stringify(row), contentType: 'application/json' })
    })
  }
}
