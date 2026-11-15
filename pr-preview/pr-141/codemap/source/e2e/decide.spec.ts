import { test } from '@playwright/test'

// Prototype measurement for the decision-throttle idea: re-decide targeting + the
// team planner only every N engine rounds (?decide=N), executing the committed
// lock/movement in between. Held at the FULL-pace render cadence the user liked
// (hts=2 hevery=1 = render every tick), so we isolate the effect of deciding less
// often. Lower medianCoV = smoother; watch fps for the AI-cost win. Same jerk metric
// as jerk.spec.ts (per-token on-screen speed CoV) under 4x CPU throttle.
const SWEEP = [
  { decide: 1,  note: 'baseline: re-decide every round (5/s)' },
  { decide: 3,  note: 're-decide every 3 rounds (~1.7/s)' },
  { decide: 5,  note: 're-decide ~1/s' },
  { decide: 10, note: 're-decide every ~2s' },
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
          sp.push(Math.hypot(b.x - a.x, b.y - a.y) / dt)
        }
        if (sp.length < 30) continue
        const mean = sp.reduce((s, v) => s + v, 0) / sp.length
        if (mean < 0.005) continue
        const variance = sp.reduce((s, v) => s + (v - mean) ** 2, 0) / sp.length
        covs.push(Math.sqrt(variance) / mean)
        means.push(mean)
      }
      covs.sort((a, b) => a - b)
      means.sort((a, b) => a - b)
      const median = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : NaN)
      const seconds = (frames[frames.length - 1].t - frames[0].t) / 1000
      return { movingTokens: covs.length, medianCoV: median(covs), medianSpeedPxS: median(means) * 1000, fps: frames.length / seconds }
    },
    { sampleMs: SAMPLE_MS },
  )
}

test('decision-throttle sweep (full-pace render)', async ({ page, browserName }, testInfo) => {
  test.setTimeout(180_000)
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  console.log(`\n[decide] sweep on ${testInfo.project.name}${throttle ? ' (4x CPU)' : ''} — lower CoV = smoother, higher fps = cheaper AI\n`)
  for (const s of SWEEP) {
    await page.goto(`/?perf=1&hts=2&hevery=1&decide=${s.decide}`)
    if (throttle) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 10, { timeout: 30_000 })
    await page.waitForTimeout(SETTLE_MS)
    const m = await measure(page)
    console.log(
      `[decide] decide=${String(s.decide).padStart(2)}  CoV=${m.medianCoV.toFixed(3)}  ` +
        `speed=${m.medianSpeedPxS.toFixed(1)}px/s  fps=${m.fps.toFixed(0)}  tokens=${m.movingTokens}   · ${s.note}`,
    )
  }
})
