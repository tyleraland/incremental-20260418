import { afterEach, describe, expect, it } from 'vitest'
import { advanceRound, createBattle, ENGINE_PERF_PROBE } from '@/engine'
import { eu } from './helpers'

describe('engine performance probe', () => {
  afterEach(() => { ENGINE_PERF_PROBE.enabled = false })

  it('observes targeting, vision caching, and spatial queries without battle state', () => {
    const battle = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 12 })],
      enemyUnits: [eu({ id: 'e', visionRange: 12 })],
      mode: 'open', cols: 30, rows: 30,
    })
    ENGINE_PERF_PROBE.enabled = true
    advanceRound(battle)

    expect(ENGINE_PERF_PROBE.round).toBe(1)
    expect(ENGINE_PERF_PROBE.decisionRound).toBe(true)
    expect(ENGINE_PERF_PROBE.targetEvaluations).toBe(2)
    expect(ENGINE_PERF_PROBE.visibleEnemyQueries).toBeGreaterThan(0)
    expect(ENGINE_PERF_PROBE.visionCacheHits).toBeGreaterThanOrEqual(0)
    expect(ENGINE_PERF_PROBE.spatialNearQueries).toBeGreaterThan(0)
    expect(ENGINE_PERF_PROBE.spatialCandidates).toBeGreaterThan(0)
    expect(Object.hasOwn(battle, 'perf')).toBe(false)
  })
})
