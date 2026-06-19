import { test } from '@playwright/test'

// Separation-strength sweep (?sep=). The moving-step jitter (~0.48 CoV) is the
// per-round crowd shove; softening it should lower the jitter — but too soft and
// units overlap (clump). Reports, over player units: moving-step CoV (lower =
// smoother) and the median nearest-neighbour distance (SEPARATION=0.7; well below
// that = clumping). Sampled from engine positions in the heavy scene.
const SEPS = ['1', '0.6', '0.35', '0.15']

test('separation sweep (heavy scene)', async ({ page, browserName }, testInfo) => {
  test.setTimeout(200_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  // eslint-disable-next-line no-console
  console.log(`\n[sep] sweep — movingCoV lower = smoother; nnDist near 0.7 = well-spaced, << 0.7 = clumped\n`)
  for (const sep of SEPS) {
    await page.goto(`/?perf=1&hts=2&hevery=1&decide=5&sep=${sep}`)
    if (throttle) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 10, { timeout: 30_000 })
    await page.waitForTimeout(2000)
    const out = await page.evaluate(async ({ sampleMs }) => {
      const g = (window as unknown as { __game?: { getState: () => { battles: Record<string, { round: number; combatants: { id: string; team: string; pos: { x: number; y: number }; alive: boolean }[] }> } } }).__game
      if (!g) return { error: 'no __game' } as const
      const locId = Object.keys(g.getState().battles)[0]
      const last: Record<string, { x: number; y: number }> = {}
      const steps: Record<string, number[]> = {}
      const nnSamples: number[] = []
      let lastRound = -1
      const t0 = performance.now()
      await new Promise<void>((res) => {
        const loop = () => {
          const b = g.getState().battles[locId]
          if (b && b.round !== lastRound) {
            lastRound = b.round
            const alive = b.combatants.filter((c) => c.alive)
            for (const c of b.combatants) {
              if (!c.alive || c.team !== 'player') continue
              const lp = last[c.id]
              if (lp) (steps[c.id] ??= []).push(Math.hypot(c.pos.x - lp.x, c.pos.y - lp.y))
              last[c.id] = { x: c.pos.x, y: c.pos.y }
              // nearest neighbour distance for this unit
              let nn = Infinity
              for (const o of alive) { if (o === c) continue; const dd = Math.hypot(c.pos.x - o.pos.x, c.pos.y - o.pos.y); if (dd < nn) nn = dd }
              if (Number.isFinite(nn)) nnSamples.push(nn)
            }
          }
          if (performance.now() - t0 < sampleMs) requestAnimationFrame(loop)
          else res()
        }
        requestAnimationFrame(loop)
      })
      const cov = (a: number[]) => { if (a.length < 3) return NaN; const m = a.reduce((s, v) => s + v, 0) / a.length; if (!m) return NaN; const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length; return Math.sqrt(v) / m }
      const med = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
      const movCoVs: number[] = []
      for (const id of Object.keys(steps)) {
        const d = steps[id]; const moving = d.filter((v) => v > 0.06)
        const mean = d.reduce((s, v) => s + v, 0) / d.length
        if (mean < 0.02 || moving.length < 3) continue
        movCoVs.push(cov(moving))
      }
      return { movingCoV: med(movCoVs), nnDist: med(nnSamples), units: movCoVs.length }
    }, { sampleMs: 6000 })
    // eslint-disable-next-line no-console
    console.log(`[sep] sep=${sep.padStart(4)}  movingCoV=${'movingCoV' in out ? out.movingCoV.toFixed(3) : '—'}  nnDist=${'nnDist' in out ? out.nnDist.toFixed(3) : '—'}`)
  }
})
