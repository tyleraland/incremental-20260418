import { expect, test } from '@playwright/test'

const LOCATION = 'perf-sandbox'
const WINDOW_MS = 4000

test('4 heroes fight 48 compiled horses in the real mobile battle view', async ({ page, browserName }, testInfo) => {
  await page.goto('/?sandbox=1&showcase=horse-swarm&skin=horse&play=1')
  const cdp = await page.context().newCDPSession(page)
  if (testInfo.project.name.startsWith('mobile') && browserName === 'chromium') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }
  await cdp.send('Performance.enable')

  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction((location) => {
    const b = (window as any).__game?.getState().battles[location]
    return b?.combatants.filter((c: any) => c.team === 'player').length === 4
      && b?.combatants.filter((c: any) => c.team === 'enemy').length === 48
  }, LOCATION, { timeout: 30_000 })
  await page.waitForTimeout(800)

  const roster = await page.evaluate((location) => {
    const b = (window as any).__game.getState().battles[location]
    const heroes = b.combatants.filter((c: any) => c.team === 'player')
    const horses = b.combatants.filter((c: any) => c.team === 'enemy')
    return {
      heroes: heroes.length,
      horses: horses.length,
      namedHorses: horses.filter((c: any) => c.name === 'Paper Horse' && c.id.startsWith('paper-horse#')).length,
    }
  }, LOCATION)
  expect(roster).toEqual({ heroes: 4, horses: 48, namedHorses: 48 })
  await expect(page.locator('[data-skin="horse"]').first()).toBeVisible()

  const metrics = async () => Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]),
  )
  const before = await metrics()
  const fps = await page.evaluate((ms) => new Promise<number>((resolve) => {
    let frames = 0
    const started = performance.now()
    const tick = () => {
      frames++
      const elapsed = performance.now() - started
      if (elapsed >= ms) resolve(frames / (elapsed / 1000))
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }), WINDOW_MS)
  const after = await metrics()
  const render = await page.evaluate(() => {
    const arena = document.querySelector('.aspect-square')!
    return {
      horseBodies: arena.querySelectorAll('[data-skin="horse"]').length,
      paths: arena.querySelectorAll('[data-skin="horse"] path').length,
      animatedParts: arena.querySelectorAll('[data-skin="horse"] [data-rig-animate]').length,
      nodes: arena.querySelectorAll('*').length,
    }
  })
  const delta = (key: string) => (after[key] ?? 0) - (before[key] ?? 0)
  const row = {
    ...roster,
    ...render,
    fps: +fps.toFixed(1),
    scriptMs: +(delta('ScriptDuration') * 1000).toFixed(0),
    styleMs: +(delta('RecalcStyleDuration') * 1000).toFixed(0),
    layoutMs: +(delta('LayoutDuration') * 1000).toFixed(0),
    taskMs: +(delta('TaskDuration') * 1000).toFixed(0),
  }
  console.log(`[HORSE-BATTLE] ${JSON.stringify(row)}`)
  await testInfo.attach('horse-battle-mobile.json', {
    body: JSON.stringify(row, null, 2),
    contentType: 'application/json',
  })
  await page.screenshot({ path: `e2e/__shots__/horse-battle-${testInfo.project.name}.png`, fullPage: true })

  // This is primarily a measurement, but catching a complete render collapse is useful.
  expect(render.horseBodies).toBeGreaterThan(0)
  expect(fps).toBeGreaterThan(5)
})
