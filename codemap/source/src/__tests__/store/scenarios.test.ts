// Validates the hand-authored test-scenario data: every scenario is reachable
// from a map location, and discrete-encounter terrain stays inside the 15×15
// arena (open-world scenarios use the location's larger openWorldSize, so they
// are size-checked against that instead).
import { describe, it, expect } from 'vitest'
import { SCENARIO_REGISTRY } from '@/data/scenarios'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { COLS, ROWS } from '@/engine'

const locById = new Map(INITIAL_LOCATIONS.map((l) => [l.id, l]))
const scenarioLocations = INITIAL_LOCATIONS.filter((l) => l.testScenarioId)

describe('scenario data', () => {
  it('every location.testScenarioId resolves to a registered scenario', () => {
    for (const l of scenarioLocations) {
      expect(SCENARIO_REGISTRY[l.testScenarioId!], `${l.id} → ${l.testScenarioId}`).toBeDefined()
    }
  })

  it('every scenario is staged on at least one map location', () => {
    const used = new Set(scenarioLocations.map((l) => l.testScenarioId))
    for (const id of Object.keys(SCENARIO_REGISTRY)) {
      expect(used.has(id), `scenario ${id} is not placed on any location`).toBe(true)
    }
  })

  it('discrete-encounter barriers fit inside the 15×15 arena', () => {
    for (const l of scenarioLocations) {
      if (l.openWorld) continue   // open-world uses openWorldSize, checked below
      const scen = SCENARIO_REGISTRY[l.testScenarioId!]
      for (const b of scen.barriers?.() ?? []) {
        expect(b.x, `${scen.id} x`).toBeGreaterThanOrEqual(0)
        expect(b.y, `${scen.id} y`).toBeGreaterThanOrEqual(0)
        expect(b.x + b.w, `${scen.id} right edge`).toBeLessThanOrEqual(COLS)
        expect(b.y + b.h, `${scen.id} bottom edge`).toBeLessThanOrEqual(ROWS)
      }
    }
  })

  it('open-world scenario barriers fit inside the location\'s openWorldSize', () => {
    for (const l of scenarioLocations) {
      if (!l.openWorld) continue
      const size = l.openWorldSize ?? 50
      const scen = SCENARIO_REGISTRY[l.testScenarioId!]
      for (const b of scen.barriers?.() ?? []) {
        expect(b.x + b.w, `${scen.id} right edge`).toBeLessThanOrEqual(size)
        expect(b.y + b.h, `${scen.id} bottom edge`).toBeLessThanOrEqual(size)
      }
    }
  })

  it('every scenario monster id (wave + location pool) exists', async () => {
    const { MONSTER_REGISTRY } = await import('@/data/monsters')
    for (const l of scenarioLocations) {
      const scen = SCENARIO_REGISTRY[l.testScenarioId!]
      for (const m of scen.wave ?? l.monsterIds) {
        expect(MONSTER_REGISTRY[m], `${scen.id} monster ${m}`).toBeDefined()
      }
    }
  })
})

describe('new Pathing Grounds locations', () => {
  it('all exist', () => {
    for (const id of ['pg-bottleneck', 'pg-serpentine', 'pg-pillared-hall', 'pg-moat', 'pg-overgrown-maze']) {
      expect(locById.get(id), id).toBeDefined()
    }
  })

  it('the Overgrown Ruins is the open-world maze (persistent + terrain)', () => {
    const l = locById.get('pg-overgrown-maze')!
    expect(l.openWorld).toBe(true)
    expect(l.openWorldSize).toBe(60)
    expect(SCENARIO_REGISTRY[l.testScenarioId!].barriers?.().length).toBeGreaterThan(0)
  })
})
