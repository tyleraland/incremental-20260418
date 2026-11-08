import { test, type CDPSession, type Page } from '@playwright/test'

const LOCATION = 'perf-sandbox'
const SETTLE_MS = 5500
const WINDOW_MS = 1200
const WINDOWS = 4
const TRACE_MS = 1800

type Profile = {
  scenario: string
  fpsMedian: number
  fpsMin: number
  fpsWindows: number[]
  longTaskMs: number
  longTaskCount: number
  horseBodies: number
  tokens: number
  nodes: number
  svgShapes: number
  paths: number
  ellipses: number
  farBodies: number
  detailBodies: number
  animatedParts: number
  scriptMs: number
  styleMs: number
  layoutMs: number
  taskMs: number
  styleCount: number
  layoutCount: number
  heapMb: number
  paintMs: number
  prePaintMs: number
  compositeMs: number
  traceTop: { name: string; ms: number; count: number }[]
}

async function sample(page: Page, cdp: CDPSession, scenario: string): Promise<Profile> {
  const metrics = async () => Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((metric: { name: string; value: number }) => [metric.name, metric.value]),
  ) as Record<string, number>
  const before = await metrics()
  const render = await page.evaluate(
    ({ windowMs, windows }) => new Promise<{
      fpsWindows: number[]; longTaskMs: number; longTaskCount: number
      horseBodies: number; tokens: number; nodes: number; svgShapes: number; paths: number; ellipses: number
      farBodies: number; detailBodies: number; animatedParts: number
    }>((resolve) => {
      let longTaskMs = 0
      let longTaskCount = 0
      let observer: PerformanceObserver | undefined
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) { longTaskMs += entry.duration; longTaskCount++ }
        })
        observer.observe({ entryTypes: ['longtask'] })
      } catch { /* unsupported */ }
      const fpsWindows: number[] = []
      let frames = 0
      let started = performance.now()
      const tick = () => {
        frames++
        const now = performance.now()
        if (now - started >= windowMs) {
          fpsWindows.push(frames / ((now - started) / 1000))
          frames = 0
          started = now
          if (fpsWindows.length === windows) {
            observer?.disconnect()
            const arena = document.querySelector('.aspect-square')!
            resolve({
              fpsWindows, longTaskMs, longTaskCount,
              horseBodies: arena.querySelectorAll('[data-skin="horse"]').length,
              tokens: arena.querySelectorAll('[data-cid]').length,
              nodes: arena.querySelectorAll('*').length,
              svgShapes: arena.querySelectorAll('[data-skin="horse"] path, [data-skin="horse"] ellipse').length,
              paths: arena.querySelectorAll('[data-skin="horse"] path').length,
              ellipses: arena.querySelectorAll('[data-skin="horse"] ellipse').length,
              farBodies: arena.querySelectorAll('[data-rig-lod="far"]').length,
              detailBodies: arena.querySelectorAll('[data-rig-lod="detail"]').length,
              animatedParts: arena.querySelectorAll('[data-skin="horse"] [data-rig-animate]').length,
            })
            return
          }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }),
    { windowMs: WINDOW_MS, windows: WINDOWS },
  )
  const after = await metrics()

  // Trace in a separate window: DevTools tracing is intentionally expensive
  // and would depress the FPS number it is meant to explain.
  const traceEvents: { name: string; dur?: number }[] = []
  const collect = (data: { value: { name: string; dur?: number }[] }) => traceEvents.push(...data.value)
  cdp.on('Tracing.dataCollected', collect)
  const traceDone = new Promise<void>((resolve) => cdp.once('Tracing.tracingComplete', () => resolve()))
  await cdp.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
    transferMode: 'ReportEvents',
  })
  await page.waitForTimeout(TRACE_MS)
  await cdp.send('Tracing.end')
  await traceDone
  cdp.off('Tracing.dataCollected', collect)
  const sorted = [...render.fpsWindows].sort((a, b) => a - b)
  const delta = (key: string) => (after[key] ?? 0) - (before[key] ?? 0)
  const traceByName = new Map<string, { ms: number; count: number }>()
  for (const event of traceEvents) {
    if (!event.dur) continue
    const current = traceByName.get(event.name) ?? { ms: 0, count: 0 }
    current.ms += event.dur / 1000
    current.count++
    traceByName.set(event.name, current)
  }
  const trace = (name: string) => +(traceByName.get(name)?.ms ?? 0).toFixed(0)
  const traceTop = [...traceByName.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 10)
    .map(([name, value]) => ({ name, ms: +value.ms.toFixed(0), count: value.count }))
  return {
    scenario,
    ...render,
    fpsMedian: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
    fpsMin: +sorted[0].toFixed(1),
    fpsWindows: render.fpsWindows.map((fps) => +fps.toFixed(1)),
    scriptMs: +(delta('ScriptDuration') * 1000).toFixed(0),
    styleMs: +(delta('RecalcStyleDuration') * 1000).toFixed(0),
    layoutMs: +(delta('LayoutDuration') * 1000).toFixed(0),
    taskMs: +(delta('TaskDuration') * 1000).toFixed(0),
    styleCount: delta('RecalcStyleCount'),
    layoutCount: delta('LayoutCount'),
    heapMb: +(after.JSHeapUsedSize / 1024 / 1024).toFixed(1),
    paintMs: trace('Paint'),
    prePaintMs: trace('PrePaint'),
    compositeMs: trace('CompositeLayers'),
    traceTop,
  }
}

const SCENARIOS = [
  { name: 'circle merged-LOD playing', skin: 'circle', lod: 'on', paused: false },
  { name: 'horse merged-LOD playing', skin: 'horse', lod: 'on', paused: false },
  { name: 'horse merged-LOD paused', skin: 'horse', lod: 'on', paused: true },
  { name: 'horse 21-part detail playing', skin: 'horse', lod: 'off', paused: false },
] as const

for (const scenario of SCENARIOS) {
  test(`horse model profile: ${scenario.name}`, async ({ page, browserName }, testInfo) => {
    test.setTimeout(90_000)
    await page.goto(`/?sandbox=1&showcase=horse-swarm&skin=${scenario.skin}&lod=${scenario.lod}&play=1`)
    const cdp = await page.context().newCDPSession(page)
    if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await cdp.send('Performance.enable')
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForFunction((location) => {
      const b = (window as any).__game?.getState().battles[location]
      return b?.combatants.filter((c: any) => c.team === 'enemy').length === 100
    }, LOCATION, { timeout: 30_000 })
    await page.waitForTimeout(SETTLE_MS)
    if (scenario.paused) {
      await page.evaluate(() => (window as any).__game.setState({ paused: true }))
      await page.waitForTimeout(500)
    }

    const profile = await sample(page, cdp, scenario.name)
    console.log(`[HORSE-MODEL-PROFILE] ${JSON.stringify(profile)}`)
    await testInfo.attach(`${scenario.name}.json`, {
      body: JSON.stringify(profile, null, 2),
      contentType: 'application/json',
    })
  })
}
