import { test, expect } from '@playwright/test'

// Heavy open-world battle perf + visual harness. Drives the dev-only `?perf`
// seed (src/dev/perfSeed.ts) — ~12 tactic-laden heroes vs the 25-cap Harpy
// Roost — then measures sustained frame rate / long-task time and captures a
// screenshot. This is the verification the vitest suite can't do: it exercises
// the real rAF render loop under load, so it's the gate for the deferred
// imperative motion-decouple (Phase 1 of performance.md).

const SAMPLE_MS = 5000

// Sampled in-page: count rAF frames and sum long-task (>50ms) time over a window.
async function sampleRuntime(page: import('@playwright/test').Page, durationMs: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ frames: number; seconds: number; fps: number; longTaskMs: number; longTaskCount: number; arenaNodes: number }>((resolve) => {
        let frames = 0
        let longTaskMs = 0
        let longTaskCount = 0
        let po: PerformanceObserver | undefined
        try {
          po = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) { longTaskMs += e.duration; longTaskCount++ }
          })
          po.observe({ entryTypes: ['longtask'] })
        } catch { /* longtask unsupported — fps still meaningful */ }
        const start = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - start < ms) { requestAnimationFrame(tick); return }
          const seconds = (performance.now() - start) / 1000
          po?.disconnect()
          const arena = document.querySelector('.aspect-square')
          resolve({
            frames, seconds, fps: frames / seconds, longTaskMs, longTaskCount,
            arenaNodes: arena ? arena.querySelectorAll('*').length : 0,
          })
        }
        requestAnimationFrame(tick)
      }),
    durationMs,
  )
}

test('heavy open-world battle: frame rate + visual', async ({ page, browserName }, testInfo) => {
  await page.goto('/?perf=1')

  // The Pixel 5 profile emulates viewport/touch but NOT CPU — so without this the
  // "mobile" fps reads as desktop. Throttle the CPU 4× to approximate a mid-range
  // phone, which is the case the whole perf effort is about.
  if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }

  // Wait for the seeded battle to stand up and render its arena + tokens.
  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => {
    const arena = document.querySelector('.aspect-square')
    return !!arena && arena.querySelectorAll('.rounded-full').length > 10
  }, { timeout: 30_000 })
  await page.waitForTimeout(1000) // let the sim settle into steady state

  // Visual artifact for manual / diff review (the refactor should change nothing).
  // Also write it to a predictable repo path (`e2e/__shots__/<project>.png`,
  // gitignored) so a reviewer can just open that file instead of digging through
  // the HTML report's hashed attachments.
  const body = await page.screenshot({ path: `e2e/__shots__/${testInfo.project.name}.png` })
  await testInfo.attach('battle.png', { body, contentType: 'image/png' })

  const m = await sampleRuntime(page, SAMPLE_MS)
  console.log(`[perf] ${m.fps.toFixed(1)} fps over ${m.seconds.toFixed(1)}s · ` +
    `longtasks ${m.longTaskCount} (${m.longTaskMs.toFixed(0)}ms) · arena DOM nodes ${m.arenaNodes}`)
  await testInfo.attach('metrics.json', { body: JSON.stringify(m, null, 2), contentType: 'application/json' })

  // Very generous floor — this only catches a total collapse, not the known
  // mobile slowness. The LOGGED fps is the real before/after comparison signal;
  // the CPU-throttled mobile number is the one to watch as the perf work lands.
  expect(m.fps, 'sustained frame rate under a heavy battle').toBeGreaterThan(10)
})
