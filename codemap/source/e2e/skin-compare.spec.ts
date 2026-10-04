import { test } from '@playwright/test'

// Skin A/B perf + visual harness (NOT a pass/fail gate — the logged fps and the
// screenshots are the signal). Drives the same heavy `?perf` scene once per
// battle skin, so a new skin's render cost is a one-command before/after:
//   npm run skin-ab        (alias for: npm run e2e -- skin-compare.spec.ts --project=mobile-chrome)
// Screenshots land at e2e/__shots__/skin-<skin>-<project>.png.
//
// The ?perf scene is DETERMINISTIC (perfSeed.ts: seeded Math.random + fixed-
// cadence tick stepping), so both skins render the exact same battle and one run
// is a trustworthy verdict. Median-of-windows sampling is kept anyway: the
// *content* replays 1:1, but rAF timing still carries OS/browser scheduling
// noise — the min and per-window list are logged so a real regression is
// distinguishable from one bad window.

const WINDOW_MS = 1200
const WINDOWS = 5
const SKINS = ['circle', 'paper'] as const

async function sampleFps(page: import('@playwright/test').Page, windowMs: number, windows: number) {
  return page.evaluate(
    ({ windowMs, windows }) =>
      new Promise<{ fpsMedian: number; fpsMin: number; fpsWindows: number[]; longTaskMs: number; arenaNodes: number }>((resolve) => {
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
              const arena = document.querySelector('.aspect-square')
              resolve({
                fpsMedian: sorted[Math.floor(sorted.length / 2)],
                fpsMin: sorted[0],
                fpsWindows,
                longTaskMs,
                arenaNodes: arena ? arena.querySelectorAll('*').length : 0,
              })
              return
            }
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { windowMs, windows },
  )
}

for (const skin of SKINS) {
  test(`heavy battle under the '${skin}' skin`, async ({ page, browserName }, testInfo) => {
    await page.goto(`/?perf=1&skin=${skin}`)
    if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction((s) => {
      const arena = document.querySelector('.aspect-square')
      return !!arena && arena.querySelectorAll(`[data-skin="${s}"]`).length > 10
    }, skin, { timeout: 30_000 })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: `e2e/__shots__/skin-${skin}-${testInfo.project.name}.png` })
    const m = await sampleFps(page, WINDOW_MS, WINDOWS)
    console.log(`[skin:${skin}] median ${m.fpsMedian.toFixed(1)} fps (min ${m.fpsMin.toFixed(1)}; windows ${m.fpsWindows.map((f) => f.toFixed(0)).join('/')}) · longtask ${m.longTaskMs.toFixed(0)}ms · arena DOM nodes ${m.arenaNodes}`)
    await testInfo.attach(`metrics-${skin}.json`, { body: JSON.stringify(m, null, 2), contentType: 'application/json' })
  })
}
