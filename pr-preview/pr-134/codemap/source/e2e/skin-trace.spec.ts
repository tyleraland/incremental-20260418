import { test } from '@playwright/test'

// One-off profiling harness (not CI): capture a devtools.timeline trace per skin
// on the ?perf scene and aggregate main-thread event durations by type, so a skin
// perf gap can be attributed (style vs layout vs paint vs script) instead of
// guessed at. Output: console table + e2e/__shots__/trace-<skin>.json.

const SKINS = ['circle', 'paper'] as const

for (const skin of SKINS) {
  test(`trace '${skin}' skin`, async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'CDP tracing is chromium-only')
    await page.goto(`/?perf=1&skin=${skin}`)
    const cdp = await page.context().newCDPSession(page)
    if (testInfo.project.name.startsWith('mobile')) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(2000)

    const events: { name: string; dur?: number }[] = []
    cdp.on('Tracing.dataCollected', (d) => { for (const e of (d.value as typeof events)) events.push(e) })
    const done = new Promise<void>((res) => cdp.once('Tracing.tracingComplete', () => res()))
    await cdp.send('Tracing.start', {
      traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
      transferMode: 'ReportEvents',
    })
    await page.waitForTimeout(4000)
    await cdp.send('Tracing.end')
    await done

    const byName = new Map<string, { ms: number; n: number }>()
    for (const e of events) {
      if (!e.dur) continue
      const cur = byName.get(e.name) ?? { ms: 0, n: 0 }
      cur.ms += e.dur / 1000; cur.n++
      byName.set(e.name, cur)
    }
    const top = [...byName.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)
    console.log(`[trace:${skin}]`)
    for (const [name, v] of top) console.log(`  ${name.padEnd(28)} ${v.ms.toFixed(0).padStart(6)}ms × ${v.n}`)
  })
}
