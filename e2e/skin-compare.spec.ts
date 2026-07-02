import { test } from '@playwright/test'

// Skin A/B perf + visual harness (NOT a pass/fail gate — the logged fps and the
// screenshots are the signal). Drives the same heavy `?perf` scene once per
// battle skin, so a new skin's render cost is a one-command before/after:
//   npm run e2e -- skin-compare.spec.ts --project=mobile-chrome
// Screenshots land at e2e/__shots__/skin-<skin>-<project>.png.

const SAMPLE_MS = 4000
const SKINS = ['circle', 'paper'] as const

async function sampleFps(page: import('@playwright/test').Page, ms: number) {
  return page.evaluate(
    (durationMs) =>
      new Promise<{ fps: number; longTaskMs: number; arenaNodes: number }>((resolve) => {
        let frames = 0, longTaskMs = 0
        let po: PerformanceObserver | undefined
        try {
          po = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTaskMs += e.duration })
          po.observe({ entryTypes: ['longtask'] })
        } catch { /* longtask unsupported */ }
        const start = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - start < durationMs) { requestAnimationFrame(tick); return }
          po?.disconnect()
          const arena = document.querySelector('.aspect-square')
          resolve({
            fps: frames / ((performance.now() - start) / 1000),
            longTaskMs,
            arenaNodes: arena ? arena.querySelectorAll('*').length : 0,
          })
        }
        requestAnimationFrame(tick)
      }),
    ms,
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
    const m = await sampleFps(page, SAMPLE_MS)
    console.log(`[skin:${skin}] ${m.fps.toFixed(1)} fps · longtask ${m.longTaskMs.toFixed(0)}ms · arena DOM nodes ${m.arenaNodes}`)
    await testInfo.attach(`metrics-${skin}.json`, { body: JSON.stringify(m, null, 2), contentType: 'application/json' })
  })
}
