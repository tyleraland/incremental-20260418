// World-map organization: the normal overworld is open-world locations only; the
// fixed-round (discrete-wave) encounters live in a sandbox-only 'fixed-encounters'
// dungeon, reached from Prontera. Curated class-change quests must still target
// monsters reachable on the overworld.
import { describe, expect, it } from 'vitest'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { isRegionUnlocked } from '@/lib/unlocks'
import { CLASS_CHANGE_QUESTS } from '@/proto/protoStore'

const byRegion = (r: string) => INITIAL_LOCATIONS.filter((l) => l.region === r)

describe('world map organization', () => {
  it('every overworld (region "world") location is open-world', () => {
    const world = byRegion('world')
    expect(world.length).toBeGreaterThan(0)
    for (const l of world) expect(l.openWorld, `${l.id} should be open-world`).toBe(true)
  })

  it('the fixed-encounters dungeon holds discrete (non-open-world) encounters', () => {
    const fixed = byRegion('fixed-encounters')
    expect(fixed.length).toBeGreaterThan(0)
    for (const l of fixed) expect(l.openWorld ?? false, `${l.id} should be discrete`).toBe(false)
  })

  it('Prontera is the entry to the fixed-encounters dungeon, gated to sandbox', () => {
    const prontera = INITIAL_LOCATIONS.find((l) => l.id === 'prontera-city')!
    expect(prontera.dungeonEntryRegion).toBe('fixed-encounters')
    expect(isRegionUnlocked('sandbox', 'fixed-encounters')).toBe(true)
    expect(isRegionUnlocked('curated', 'fixed-encounters')).toBe(false)
    // The real overworld + content dungeons stay reachable in both modes.
    for (const r of ['world', 'geffen-dungeon', 'aerie']) {
      expect(isRegionUnlocked('curated', r)).toBe(true)
    }
  })

  it('curated class-change quests target monsters reachable on the overworld', () => {
    const overworldMonsters = new Set(byRegion('world').flatMap((l) => l.monsterIds))
    for (const q of CLASS_CHANGE_QUESTS) {
      const o = q.objective
      if ((o.kind === 'kill' || o.kind === 'collect') && o.monsterId) {
        expect(overworldMonsters.has(o.monsterId), `${q.id} targets ${o.monsterId}, not on the overworld`).toBe(true)
      }
    }
  })
})
