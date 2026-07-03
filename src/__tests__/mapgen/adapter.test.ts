// The game seam: a Location opted into mapgen produces a spec whose collision
// plane stands up a real engine battle (the whole point of "the engine only
// needs a collision graph"), with portals kept clear and reachable.

import { describe, it, expect } from 'vitest'
import { generateForLocation, specBarriers } from '@/mapgen'
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
})
