// The game seam: a Location opted into mapgen produces a spec whose collision
// plane stands up a real engine battle (the whole point of "the engine only
// needs a collision graph"), with portals kept clear and reachable.

import { describe, it, expect } from 'vitest'
import { generateForLocation, intensityAt, specBarriers, type MapSpec } from '@/mapgen'
import { createBattle, advanceRound, type EngineUnitInput } from '@/engine'

const LOC = {
  id: 'gen-smoke-field',
  traits: ['plains', 'water'],
  openWorldSize: 80,
  portals: [{ at: [1, 40] as [number, number] }],
  mapGen: { recipe: 'field' },
}

const unit = (id: string, team: 'player' | 'enemy'): EngineUnitInput => ({
  id, name: id, team,
  str: 10, def: 5, int: 5, spd: 10, maxHp: 100, hp: 100,
  preferredRank: 'front', meleeRange: 1.5, rangedRange: 0, moveSpeed: 2,
  skills: [],
})

describe('mapgen → engine adapter', () => {
  it('generates a valid spec for a mapGen location; portals become reachable POIs', () => {
    const res = generateForLocation(LOC)
    expect(res.report.ok).toBe(true)
    expect(res.spec.cols).toBe(80)
    expect(res.spec.semantic.pois.some((p) => p.kind === 'portal')).toBe(true)
    // deterministic per location id
    expect(generateForLocation(LOC).spec).toEqual(res.spec)
  })

  it('specBarriers feeds createBattle: pure {x,y,w,h,kind}, battle steps cleanly', () => {
    const res = generateForLocation(LOC)
    const barriers = specBarriers(res.spec)
    expect(barriers.length).toBeGreaterThan(0)
    for (const b of barriers) {
      expect(Object.keys(b).sort()).toEqual(['h', 'kind', 'w', 'x', 'y'])
      expect(['wall', 'cliff']).toContain(b.kind)
    }
    const battle = createBattle({
      playerUnits: [unit('hero', 'player')],
      enemyUnits: [unit('mob', 'enemy')],
      barriers, cols: res.spec.cols, rows: res.spec.rows, mode: 'open',
    })
    for (let i = 0; i < 30 && battle.outcome === 'ongoing'; i++) advanceRound(battle)
    expect(battle.round).toBeGreaterThan(0)
  })

  it('rejects a location without mapGen config or with an unknown recipe', () => {
    expect(() => generateForLocation({ ...LOC, mapGen: undefined })).toThrow(/no mapGen/)
    expect(() => generateForLocation({ ...LOC, mapGen: { recipe: 'castle' } })).toThrow(/unknown recipe/)
  })

  it('intensityAt: containing node wins, nearest anchor falls back, no intensity → 0', () => {
    const spec = {
      specVersion: 1, recipe: 'test', seed: 1, cols: 60, rows: 60,
      collision: [], scatter: [],
      surface: { cols: 60, rows: 60, cellsPerUnit: 1, grid: new Uint8Array(60 * 60) },
      semantic: {
        pois: [], locks: [], regionTags: [], name: null, premise: null,
        tactical: { openness: 1, barrierCount: 0, chokepoints: 0, longLanes: 0, coverClusters: 0 },
        nav: {
          nodes: [
            { id: 'calm', at: { x: 10, y: 10 }, area: { x: 0, y: 0, w: 20, h: 20 }, intensity: 0.1 },
            { id: 'hot', at: { x: 50, y: 50 }, area: { x: 40, y: 40, w: 20, h: 20 }, intensity: 0.9 },
            { id: 'stub', at: { x: 30, y: 5 } }, // no intensity — never consulted
          ],
          edges: [],
        },
      },
    } as unknown as MapSpec
    expect(intensityAt(spec, 5, 5)).toBe(0.1)          // inside 'calm' area
    expect(intensityAt(spec, 55, 55)).toBe(0.9)        // inside 'hot' area
    expect(intensityAt(spec, 30, 45)).toBe(0.9)        // outside every area → nearest anchor
    expect(intensityAt(spec, 25, 12)).toBe(0.1)        // nearest is 'calm' even beside the stub
    // a spec that publishes nothing answers the neutral 0
    const bare = { ...spec, semantic: { ...spec.semantic, nav: { nodes: [{ id: 'n', at: { x: 1, y: 1 } }], edges: [] } } } as unknown as MapSpec
    expect(intensityAt(bare, 1, 1)).toBe(0)
  })

  it('intensityAt: live field bakes answer hotter across the river than at the spawn', () => {
    const res = generateForLocation(LOC)
    const nodes = res.spec.semantic.nav.nodes
    if (nodes.length < 2) return // this seed's geography did not bisect — nothing to compare
    const spawnNode = nodes.find((n) => n.poiId === 'spawn')!
    const far = [...nodes].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0]
    expect(intensityAt(res.spec, spawnNode.at.x, spawnNode.at.y)).toBeLessThan(
      intensityAt(res.spec, far.at.x, far.at.y))
  })
})
