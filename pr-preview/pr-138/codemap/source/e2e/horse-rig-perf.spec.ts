import { test } from '@playwright/test'

const WINDOW_MS = 4000
const SCENARIOS = [
  { mode: 'current', count: 80 },
  { mode: 'detail', count: 80 },
  { mode: 'animated', count: 80 },
  { mode: 'animated', count: 16 },
  { mode: 'far', count: 80 },
] as const

for (const { mode, count } of SCENARIOS) {
  test(`horse paper-rig density mode=${mode} count=${count}`, async ({ page, browserName }, testInfo) => {
    await page.goto(`/?rigperf=1&mode=${mode}&count=${count}`)
    const cdp = await page.context().newCDPSession(page)
    if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await cdp.send('Performance.enable')
    await page.locator('[data-rig-perf-arena]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction((expected) => document.querySelectorAll('[data-rig-token]').length === expected, count)
    await page.waitForTimeout(700)

    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]))
    const before = await metrics()
    const fps = await page.evaluate((ms) => new Promise<number>((resolve) => {
      let frames = 0
      const started = performance.now()
      const tick = () => {
        frames++
        const elapsed = performance.now() - started
        if (elapsed >= ms) resolve(frames / (elapsed / 1000))
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }), WINDOW_MS)
    const after = await metrics()
    const counts = await page.evaluate(() => {
      const arena = document.querySelector('[data-rig-perf-arena]')!
      return {
        nodes: arena.querySelectorAll('*').length,
        paths: arena.querySelectorAll('path').length,
        animatedParts: arena.querySelectorAll('[data-rig-animate]').length,
      }
    })
    const delta = (key: string) => (after[key] ?? 0) - (before[key] ?? 0)
    const row = {
      mode,
      count,
      fps: +fps.toFixed(1),
      ...counts,
      scriptMs: +(delta('ScriptDuration') * 1000).toFixed(0),
      styleMs: +(delta('RecalcStyleDuration') * 1000).toFixed(0),
      layoutMs: +(delta('LayoutDuration') * 1000).toFixed(0),
      taskMs: +(delta('TaskDuration') * 1000).toFixed(0),
    }
    console.log(`[HORSE-RIG] ${JSON.stringify(row)}`)
    await testInfo.attach(`horse-rig-${mode}.json`, { body: JSON.stringify(row, null, 2), contentType: 'application/json' })
    if (mode === 'detail') await page.screenshot({ path: `e2e/__shots__/horse-rig-${testInfo.project.name}.png` })
  })
}
