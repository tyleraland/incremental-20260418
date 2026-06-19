import { test } from '@playwright/test'

// Render-clock interpolation check. interp=1: read the rAF's own interpolated world
// positions (window.__interp — what gets written to the DOM, so no
// getBoundingClientRect thrash) → per-token velocity CoV. interp=0: CSS-glide
// baseline via getBoundingClientRect. Both measure rendered-position steadiness
// (lower = smoother). Engine per-round step CoV ~0.48 is the input.
async function prep(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo, browserName: string, interp: string) {
  const throttle = testInfo.project.name.startsWith('mobile') && browserName === 'chromium'
  await page.goto(`/?perf=1&hts=2&hevery=1&decide=5&interp=${interp}`)
  if (throttle) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }) }
  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 10, { timeout: 30_000 })
  await page.waitForTimeout(2500)
}

type Frame = { t: number; m: Record<string, { x: number; y: number }> }
function median(frames: Frame[]) {
  const cov = (a: number[]) => { const mn = a.reduce((s, v) => s + v, 0) / a.length; const v = a.reduce((s, x) => s + (x - mn) ** 2, 0) / a.length; return Math.sqrt(v) / mn }
  const ids = new Set<string>(); for (const f of frames) for (const k of Object.keys(f.m)) ids.add(k)
  const covs: number[] = []
  for (const id of ids) {
    const sp: number[] = []
    for (let i = 1; i < frames.length; i++) { const a = frames[i - 1].m[id], b = frames[i].m[id], dt = frames[i].t - frames[i - 1].t; if (a && b && dt > 0) sp.push(Math.hypot(b.x - a.x, b.y - a.y) / dt) }
    if (sp.length < 30) continue
    const mean = sp.reduce((s, v) => s + v, 0) / sp.length; if (mean < 1e-5) continue
    covs.push(cov(sp))
  }
  covs.sort((a, b) => a - b)
  return { coV: covs[Math.floor(covs.length / 2)], tokens: covs.length }
}

test('interp on (interpolated positions)', async ({ page, browserName }, testInfo) => {
  test.setTimeout(90_000)
  await prep(page, testInfo, browserName, '1')
  const raw = await page.evaluate(async () => {
    const frames: { t: number; m: Record<string, { x: number; y: number }> }[] = []
    let lastT = -1, frameCount = 0
    const t0 = performance.now()
    await new Promise<void>((res) => { const loop = () => { frameCount++; const s = (window as unknown as { __interp?: { t: number; pos: Record<string, { x: number; y: number }> } }).__interp; if (s && s.t !== lastT) { lastT = s.t; frames.push({ t: s.t, m: { ...s.pos } }) } performance.now() - t0 < 5000 ? requestAnimationFrame(loop) : res() }; requestAnimationFrame(loop) })
    return { frames, fps: frameCount / 5 }
  })
  const m = median(raw.frames)
  // eslint-disable-next-line no-console
  console.log(`\n[interp=1] worldCoV=${m.coV.toFixed(3)}  fps=${raw.fps.toFixed(0)}  tokens=${m.tokens}\n`)
})

test('interp off (CSS baseline)', async ({ page, browserName }, testInfo) => {
  test.setTimeout(90_000)
  await prep(page, testInfo, browserName, '0')
  const raw = await page.evaluate(async () => {
    const frames: { t: number; m: Record<string, { x: number; y: number }> }[] = []
    let frameCount = 0
    const centres = () => { const o: Record<string, { x: number; y: number }> = {}; document.querySelectorAll('[data-cid]').forEach((el) => { const r = (el as HTMLElement).getBoundingClientRect(); o[el.getAttribute('data-cid')!] = { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); return o }
    const t0 = performance.now()
    await new Promise<void>((res) => { const loop = () => { frameCount++; frames.push({ t: performance.now(), m: centres() }); performance.now() - t0 < 5000 ? requestAnimationFrame(loop) : res() }; requestAnimationFrame(loop) })
    return { frames, fps: frameCount / 5 }
  })
  const m = median(raw.frames)
  // eslint-disable-next-line no-console
  console.log(`\n[interp=0] screenCoV=${m.coV.toFixed(3)}  fps=${raw.fps.toFixed(0)}  tokens=${m.tokens}\n`)
})
