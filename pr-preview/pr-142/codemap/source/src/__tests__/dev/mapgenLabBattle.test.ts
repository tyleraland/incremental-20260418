// The Mapgen Lab battle seeder (src/dev/mapgenLabBattle.ts) must stand up a
// real open-world battle on the lab-generated map — this guards the lab's
// "drop in" entry path (battle populated, barriers from the baked spec)
// without needing a browser. Same shape as perfSeed.test.ts.
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { generateForLocationCached, specBarriers } from '@/mapgen'
import { biomeForLocation } from '@/render/appearance'
import { seedMapgenLabBattle, MAPGEN_LAB_SIM_LOC } from '@/dev/mapgenLabBattle'
import { resetStore } from '../helpers'

// The seeder brings its own synthetic location, so a bare store is enough.
beforeEach(() => resetStore())

const simLoc = () => useGameStore.getState().locations.find((l) => l.id === MAPGEN_LAB_SIM_LOC)!

describe('seedMapgenLabBattle', () => {
  it('stands up a live battle on the lab-generated map', () => {
    const id = seedMapgenLabBattle({ recipe: 'field', seed: 3, size: 96, themes: ['plains', 'water'] })
    expect(id).toBe(MAPGEN_LAB_SIM_LOC)

    const s = useGameStore.getState()
    expect(s.mapMode).toBe('battle')
    expect(s.combatLocationId).toBe(MAPGEN_LAB_SIM_LOC)

    const battle = s.battles[MAPGEN_LAB_SIM_LOC]
    expect(battle?.mode).toBe('open')
    expect(battle!.cols).toBe(96)
    expect(battle!.combatants.filter((c) => c.team === 'player').length).toBeGreaterThan(0)
    // default composition is size-scaled: round(96/10) = 10 enemies exactly
    // (battle stands up empty at cap 0, then the seeder spawns the count)
    expect(battle!.combatants.filter((c) => c.team === 'enemy').length).toBe(10)

    // The location pins the full lab config; the battle's barriers ARE the
    // baked spec's (gates default off, so the bare-kit cached bake matches).
    const loc = simLoc()
    expect(loc.mapGen).toMatchObject({ recipe: 'field', seed: 3, onFail: 'accept' })
    const gen = generateForLocationCached(loc)
    expect(gen.spec.cols).toBe(96)
    expect(battle!.barriers.length).toBeGreaterThan(0)
    expect(battle!.barriers).toEqual(specBarriers(gen.spec))
  })

  it('maps themes onto biome-driving traits (volcanic → stone; city stays hostile)', () => {
    seedMapgenLabBattle({ recipe: 'field', seed: 1, size: 48, themes: ['volcanic'] })
    expect(biomeForLocation(simLoc())).toBe('stone')

    // 'city' as a TRAIT would flip createOpenBattleFor's peaceful flag — the
    // seeder maps it to 'arena' (stone) so a city-recipe map still fights.
    seedMapgenLabBattle({ recipe: 'city', seed: 3, size: 50, themes: ['city'] })
    expect(biomeForLocation(simLoc())).toBe('stone')
    expect(simLoc().traits).not.toContain('city')
    const battle = useGameStore.getState().battles[MAPGEN_LAB_SIM_LOC]
    expect(battle!.combatants.some((c) => c.team === 'enemy')).toBe(true)
  })
})
