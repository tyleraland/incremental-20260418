import { test } from '@playwright/test'

// Cadence diagnosis: are main-thread blocks exceeding the 200ms tick budget (which
// makes catchUp skip-then-bunch ticks → the fast-slow)? Records a long-task duration
// histogram and the round-gap distribution in the heavy scene at mobile 4x CPU.
test('cadence: long-task + round-gap histogram', async ({ page, browserName }, testInfo) => {
  test.setTimeout(90_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  await page.goto('/?perf=1&hts=2&hevery=1&decide=5')
  if (throttle) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }) }
  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game, { timeout: 30_000 })
  await page.waitForTimeout(1500)
  const out = await page.evaluate(async ({ sampleMs }) => {
    const g = (window as unknown as { __game?: { getState: () => { battles: Record<string, { round: number }> } } }).__game!
    const locId = Object.keys(g.getState().battles)[0]
    const tasks: number[] = []
    let po: PerformanceObserver | undefined
    try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) tasks.push(e.duration) }); po.observe({ entryTypes: ['longtask'] }) } catch { /* unsupported */ }
    const gaps: number[] = []
    let lastRound = -1, lastT = 0, firstRound = -1, lastSeenRound = -1, frames = 0
    const t0 = performance.now()
    await new Promise<void>((res) => {
      const loop = () => {
        frames++
        const r = g.getState().battles[locId]?.round
        const now = performance.now()
        if (r != null && r !== lastRound) {
          if (firstRound < 0) firstRound = r
          if (lastT) { const delta = r - lastRound; for (let i = 0; i < delta; i++) gaps.push((now - lastT) / delta) }  // split merged jumps
          lastT = now; lastRound = r; lastSeenRound = r
        }
        now - t0 < sampleMs ? requestAnimationFrame(loop) : res()
      }
      requestAnimationFrame(loop)
    })
    const totalRounds = lastSeenRound - firstRound
    const elapsed = performance.now() - t0
    po?.disconnect()
    const engineMs = ((window as unknown as { __engineMs?: number[] }).__engineMs ?? []).slice()
    const stats = (a: number[]) => {
      if (!a.length) return { n: 0 }
      const s = [...a].sort((x, y) => x - y)
      const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
      return { n: a.length, min: Math.round(s[0]), p50: Math.round(q(0.5)), p90: Math.round(q(0.9)), max: Math.round(s[s.length - 1]), mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length) }
    }
    return {
      seconds: ((performance.now() - t0) / 1000).toFixed(1),
      longTasks: stats(tasks),
      over100: tasks.filter((d) => d > 100).length,
      over200: tasks.filter((d) => d > 200).length,
      perRoundGap: stats(gaps),
      truePerRoundMs: totalRounds > 0 ? Math.round(elapsed / totalRounds) : 0,
      totalRounds, probeFps: Math.round(frames / (elapsed / 1000)),
      engineMsPerTick: stats(engineMs),
    }
  }, { sampleMs: 8000 })
  // eslint-disable-next-line no-console
  console.log('\n[cadence] ' + JSON.stringify(out, null, 0) + '\n')
})
