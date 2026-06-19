import { test } from '@playwright/test'

// Exploration harness for the "slower rounds" lever (NOT a pass/fail gate). Drives the
// ?perf heavy field at different cadence settings and measures how *jerky* token motion
// is — the fast-slow-fast-slow the adaptive --seg-ms glide didn't fully kill.
//
// Metric: every animation frame, read each token's on-screen centre; per token build a
// speed series (px/ms) and take its coefficient of variation (std/mean). Constant-
// velocity glide → CoV ~0; fast-slow pulsing → high CoV. Report the MEDIAN CoV across
// the moving tokens (robust to any one token stopping) plus mean speed (the pace) and
// fps. Sweep (hts = heavy timeScale / granularity, hevery = ticks per round / tempo):
const SWEEP = [
  { hts: 1, hevery: 2, note: 'baseline (shipped throttle): coarse, pace 2.5/s' },
  { hts: 2, hevery: 2, note: 'finer, same CPU, half pace (1.25/s)' },
  { hts: 2, hevery: 1, note: 'finer, full pace (2.5/s), 2x CPU' },
  { hts: 4, hevery: 2, note: 'much finer, quarter pace (0.625/s)' },
  { hts: 1, hevery: 4, note: 'coarse but slow tempo (1.25/s), half CPU' },
]

const SETTLE_MS = 2500
const SAMPLE_MS = 5000

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(
    async ({ sampleMs }) => {
      const centres = () => {
        const m: Record<string, { x: number; y: number }> = {}
        document.querySelectorAll('[data-cid]').forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          m[el.getAttribute('data-cid')!] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
        return m
      }
      const frames: { t: number; m: Record<string, { x: number; y: number }> }[] = []
      const t0 = performance.now()
      await new Promise<void>((res) => {
        const loop = () => {
          frames.push({ t: performance.now(), m: centres() })
          if (performance.now() - t0 < sampleMs) requestAnimationFrame(loop)
          else res()
        }
        requestAnimationFrame(loop)
      })
      // Per-cid speed series across frames where it's present in both endpoints.
      const ids = new Set<string>()
      for (const f of frames) for (const k of Object.keys(f.m)) ids.add(k)
      const covs: number[] = []
      const means: number[] = []
      for (const id of ids) {
        const sp: number[] = []
        for (let i = 1; i < frames.length; i++) {
          const a = frames[i - 1].m[id], b = frames[i].m[id]
          const dt = frames[i].t - frames[i - 1].t
          if (!a || !b || dt <= 0) continue
          sp.push(Math.hypot(b.x - a.x, b.y - a.y) / dt) // px/ms
        }
        if (sp.length < 30) continue
        const mean = sp.reduce((s, v) => s + v, 0) / sp.length
        if (mean < 0.005) continue // effectively stationary token — exclude
        const variance = sp.reduce((s, v) => s + (v - mean) ** 2, 0) / sp.length
        covs.push(Math.sqrt(variance) / mean)
        means.push(mean)
      }
      covs.sort((a, b) => a - b)
      means.sort((a, b) => a - b)
      const median = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : NaN)
      const seconds = (frames[frames.length - 1].t - frames[0].t) / 1000
      return {
        movingTokens: covs.length,
        medianCoV: median(covs),
        medianSpeedPxS: median(means) * 1000,
        fps: frames.length / seconds,
      }
    },
    { sampleMs: SAMPLE_MS },
  )
}

test('jerk sweep: slower-rounds lever', async ({ page, browserName }, testInfo) => {
  test.setTimeout(180_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  // eslint-disable-next-line no-console
  console.log(`\n[jerk] sweep on ${testInfo.project.name}${throttle ? ' (4x CPU)' : ''} — lower medianCoV = smoother\n`)
  for (const s of SWEEP) {
    await page.goto(`/?perf=1&hts=${s.hts}&hevery=${s.hevery}`)
    if (throttle) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 10, { timeout: 30_000 })
    await page.waitForTimeout(SETTLE_MS)
    const m = await measure(page)
    // eslint-disable-next-line no-console
    console.log(
      `[jerk] hts=${s.hts} hevery=${s.hevery}  ` +
        `CoV=${m.medianCoV.toFixed(3)}  speed=${m.medianSpeedPxS.toFixed(1)}px/s  ` +
        `fps=${m.fps.toFixed(0)}  tokens=${m.movingTokens}   · ${s.note}`,
    )
  }
})
