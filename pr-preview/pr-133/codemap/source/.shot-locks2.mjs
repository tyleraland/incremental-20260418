import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1500, height: 980 } })
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
await p.goto('http://localhost:5199/incremental-20260418/?mapgen=1')
await p.waitForTimeout(1500)
await p.selectOption('select', 'dungeon')
await p.waitForTimeout(1800)
const thumbs = await p.locator('button.relative.block').count()
let gatedTag = null
for (let i = 0; i < thumbs && !gatedTag; i++) {
  await p.locator('button.relative.block').nth(i).click()
  await p.waitForTimeout(300)
  const locks = await p.locator('text=/locks: /').textContent().catch(() => null)
  if (locks && locks.includes('🔒')) gatedTag = locks.match(/locks: (\w+)/)?.[1]
}
console.log('gated tag:', gatedTag)
await p.screenshot({ path: process.env.SHOT1 })
if (gatedTag) {
  await p.locator(`label:has-text("${gatedTag}")`).last().click()
  await p.waitForTimeout(1500)
  await p.screenshot({ path: process.env.SHOT2 })
}
console.log('errors:', errors.length ? errors : 'none')
await b.close()
