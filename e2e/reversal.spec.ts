import { test } from '@playwright/test'

// Validate the backward-snap fix: read the rAF's interpolated positions (__interp,
// what's written to the DOM) and count REVERSALS — frames where a token's movement
// direction flips >120° while moving meaningfully. The bug showed as frequent large
// reversals (tokens clipping backward); a correct monotonic clock should show ~none.
test('interp reversal rate (should be ~0)', async ({ page, browserName }, testInfo) => {
  test.setTimeout(90_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  await page.goto('/?perf=1&hts=2&hevery=1&decide=5')
  if (throttle) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }) }
  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => !!(window as unknown as { __interp?: unknown }).__interp, { timeout: 30_000 })
  await page.waitForTimeout(2500)
  const m = await page.evaluate(async () => {
    type S = { t: number; pos: Record<string, { x: number; y: number }> }
    const frames: S[] = []; let lastT = -1; let frameCount = 0
    const t0 = performance.now()
    await new Promise<void>((res) => { const loop = () => { frameCount++; const s = (window as unknown as { __interp?: S }).__interp; if (s && s.t !== lastT) { lastT = s.t; frames.push({ t: s.t, pos: { ...s.pos } }) } performance.now() - t0 < 6000 ? requestAnimationFrame(loop) : res() }; requestAnimationFrame(loop) })
    const ids = new Set<string>(); for (const f of frames) for (const k of Object.keys(f.pos)) ids.add(k)
    let reversals = 0, moves = 0
    for (const id of ids) {
      for (let i = 2; i < frames.length; i++) {
        const a = frames[i - 2].pos[id], b = frames[i - 1].pos[id], c = frames[i].pos[id]
        if (!a || !b || !c) continue
        const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y
        const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y)
        if (m1 < 0.01 || m2 < 0.01) continue            // ignore near-still frames
        moves++
        const cos = (v1x * v2x + v1y * v2y) / (m1 * m2)
        if (cos < -0.5) reversals++                      // >120° direction flip = a backward clip
      }
    }
    return { reversals, moves, reversalPct: moves ? (100 * reversals / moves) : 0, fps: frameCount / 6, tokens: ids.size }
  })
  // eslint-disable-next-line no-console
  console.log(`\n[reversal] ${m.reversals}/${m.moves} moving frames reversed (${m.reversalPct.toFixed(1)}%)  fps=${m.fps.toFixed(0)}  tokens=${m.tokens}\n`)
})
