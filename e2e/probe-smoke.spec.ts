import { test, expect } from '@playwright/test'

// Smoke test for the on-device perf probe (src/dev/perfProbe.ts). Drives the heavy
// synthetic scene with the probe enabled, starts a capture, lets the battle run,
// stops, and asserts the report has real engine-phase + render + frame numbers.
// Prints the report so we can eyeball the format. Not a CI gate.

test('perf probe captures engine/render/frame data on the heavy scene', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/?perf=1&probe=1&heroes=15&cap=40')
  if (testInfo.project.name.startsWith('mobile')) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-cid]').length > 5, { timeout: 30_000 })

  // Drive the probe through window.__perf (exposed under ?probe).
  await page.waitForFunction(() => (window as any).__perf != null, { timeout: 10_000 })
  await page.evaluate(() => (window as any).__perf.start())
  await page.waitForTimeout(8000)
  await page.evaluate(() => (window as any).__perf.stop())

  const report = await page.evaluate(() => (window as any).__perf.buildReport())
  console.log('\n' + report.text + '\n')

  const j = report.json
  expect(j.engine.rounds).toBeGreaterThan(0)
  expect(j.enginePhases.find((p: any) => p.phase === 'decide')).toBeTruthy()
  expect(j.enginePhases.find((p: any) => p.phase === 'turns')).toBeTruthy()
  expect(j.frames.sampledFrames).toBeGreaterThan(0)
  expect(j.render.commits).toBeGreaterThan(0)
  expect(j.scene.combatants).toBeGreaterThan(5)
})
