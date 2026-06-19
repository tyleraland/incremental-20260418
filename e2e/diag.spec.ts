import { test } from '@playwright/test'

// Render-glide tuning sweep. The engine produces a ~0.50-CoV per-round step in the
// dense scene (separation + stop-go); the render adds variance on top via the
// --seg-ms glide. CADENCE_RUNWAY (the overshoot factor) is the smoothing knob. We
// sweep ?runway= and report render speed CoV (lower = closer to the engine floor =
// steadier apparent motion) plus the engine step CoV (should be ~constant across
// runs — it's the floor the render can't beat without changing the sim).
const RUNWAYS = [1.0, 1.15, 1.3, 1.7, 2.2]

async function sample(page: import('@playwright/test').Page) {
  return page.evaluate(async ({ sampleMs }) => {
    const g = (window as unknown as { __game?: { getState: () => { battles: Record<string, { round: number; combatants: { id: string; team: string; pos: { x: number; y: number }; alive: boolean }[] }> } } }).__game
    if (!g) return { error: 'no __game' } as const
    const locId = Object.keys(g.getState().battles)[0]
    const renderFrames: { t: number; m: Record<string, { x: number; y: number }> }[] = []
    const lastEnginePos: Record<string, { x: number; y: number }> = {}
    const engineSteps: Record<string, number[]> = {}
    let lastRound = -1
    const cadenceGaps: number[] = []
    let lastRoundWall = 0
    const centres = () => {
      const m: Record<string, { x: number; y: number }> = {}
      document.querySelectorAll('[data-cid]').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        m[el.getAttribute('data-cid')!] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      return m
    }
    const t0 = performance.now()
    await new Promise<void>((res) => {
      const loop = () => {
        const now = performance.now()
        renderFrames.push({ t: now, m: centres() })
        const b = g.getState().battles[locId]
        if (b && b.round !== lastRound) {
          if (lastRoundWall) cadenceGaps.push(now - lastRoundWall)
          lastRoundWall = now
          lastRound = b.round
          for (const c of b.combatants) {
            if (!c.alive || c.team !== 'player') continue
            const lp = lastEnginePos[c.id]
            if (lp) (engineSteps[c.id] ??= []).push(Math.hypot(c.pos.x - lp.x, c.pos.y - lp.y))
            lastEnginePos[c.id] = { x: c.pos.x, y: c.pos.y }
          }
        }
        if (now - t0 < sampleMs) requestAnimationFrame(loop)
        else res()
      }
      requestAnimationFrame(loop)
    })
    const median = (arr: number[]) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
    const cov = (arr: number[]) => { if (arr.length < 3) return NaN; const m = arr.reduce((s, v) => s + v, 0) / arr.length; if (m === 0) return NaN; const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length; return Math.sqrt(v) / m }
    const engineCoVs: number[] = []
    for (const id of Object.keys(engineSteps)) {
      const d = engineSteps[id]; const m = d.reduce((s, v) => s + v, 0) / d.length
      if (m < 0.02) continue
      engineCoVs.push(cov(d))
    }
    const renderCoVs: number[] = []
    const ids = new Set<string>()
    for (const f of renderFrames) for (const k of Object.keys(f.m)) ids.add(k)
    for (const id of ids) {
      const sp: number[] = []
      for (let i = 1; i < renderFrames.length; i++) {
        const a = renderFrames[i - 1].m[id], b = renderFrames[i].m[id]
        const dt = renderFrames[i].t - renderFrames[i - 1].t
        if (!a || !b || dt <= 0) continue
        sp.push(Math.hypot(b.x - a.x, b.y - a.y) / dt)
      }
      if (sp.length < 30) continue
      const mean = sp.reduce((s, v) => s + v, 0) / sp.length
      if (mean < 0.005) continue
      renderCoVs.push(cov(sp))
    }
    return { engineStepCoV: median(engineCoVs), renderSpeedCoV: median(renderCoVs), cadenceMs: median(cadenceGaps), units: engineCoVs.length } as const
  }, { sampleMs: 5000 })
}

test('render-glide runway sweep (heavy scene)', async ({ page, browserName }, testInfo) => {
  test.setTimeout(220_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  // eslint-disable-next-line no-console
  console.log(`\n[runway] sweep on ${testInfo.project.name}${throttle ? ' (4x CPU)' : ''} — lower renderCoV = steadier apparent speed\n`)
  for (const rw of RUNWAYS) {
    await page.goto(`/?perf=1&hts=2&hevery=1&decide=5&runway=${rw}`)
    if (throttle) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 10, { timeout: 30_000 })
    await page.waitForTimeout(2500)
    const m = await sample(page)
    // eslint-disable-next-line no-console
    console.log(`[runway] runway=${rw.toFixed(2)}  renderCoV=${'renderSpeedCoV' in m ? m.renderSpeedCoV.toFixed(3) : '—'}  engineFloor=${'engineStepCoV' in m ? m.engineStepCoV.toFixed(3) : '—'}  cadence=${'cadenceMs' in m ? m.cadenceMs.toFixed(0) : '—'}ms`)
  }
})
