import { expect, test } from '@playwright/test'

const WINDOW_MS = 4000

test('production build sustains the 100-horse mobile showcase', async ({ page, browserName }, testInfo) => {
  await page.goto('/incremental-20260418/?sandbox=1&showcase=horse-swarm&skin=horse&play=1')
  const cdp = await page.context().newCDPSession(page)
  if (browserName === 'chromium') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Performance.enable')
  await page.locator('.aspect-square').first().waitFor({ state: 'visible', timeout: 30_000 })
  await expect(page.locator('[data-skin="horse"]')).toHaveCount(100, { timeout: 30_000 })
  await page.waitForTimeout(800)

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
  const render = await page.evaluate(() => ({
    horses: document.querySelectorAll('[data-skin="horse"]').length,
    detailBodies: document.querySelectorAll('[data-rig-lod="detail"]').length,
    farBodies: document.querySelectorAll('[data-rig-lod="far"]').length,
    minimapEnemies: Number(document.querySelector('[data-minimap-enemy-count]')?.getAttribute('data-minimap-enemy-count') ?? 0),
    minimapEnemyPaths: document.querySelectorAll('[data-minimap-enemies]').length,
    activeFloats: Number(document.querySelector('[data-active-combat-floats]')?.getAttribute('data-active-combat-floats') ?? 0),
  }))
  const row = { ...render, fps: +fps.toFixed(1) }
  console.log(`[HORSE-BATTLE-PRODUCTION] ${JSON.stringify(row)}`)
  await testInfo.attach('horse-battle-production.json', { body: JSON.stringify(row, null, 2), contentType: 'application/json' })

  expect(render).toMatchObject({ horses: 100, detailBodies: 0, farBodies: 100, minimapEnemyPaths: 1 })
  expect(render.activeFloats).toBeLessThanOrEqual(64)
  expect(fps).toBeGreaterThan(5)
})
