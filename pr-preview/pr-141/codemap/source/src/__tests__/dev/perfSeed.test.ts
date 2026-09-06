// The dev perf harness seed (src/dev/perfSeed.ts) must deterministically stand
// up a heavy open-world battle and drop into it — this guards the Playwright
// entry path (right location, battle populated) without needing a browser.
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { seedPerfBattle } from '@/dev/perfSeed'
import { resetStore } from '../helpers'

// The real app ships INITIAL_LOCATIONS (incl. the open-world Harpy Roost); the
// test harness wipes locations, so restore them for the seed to find a field.
beforeEach(() => resetStore({ locations: INITIAL_LOCATIONS }))

describe('seedPerfBattle', () => {
  it('drops into a populated open-world battle on the densest field', () => {
    seedPerfBattle(12)
    const s = useGameStore.getState()

    expect(s.mapMode).toBe('battle')
    expect(s.combatLocationId).toBe('harpy-roost')        // densest openWorld by packing (25 in a 25×25 field)
    expect(s.units).toHaveLength(12)
    expect(new Set(s.units.map((u) => u.id)).size).toBe(12) // unique ids (no Date.now collisions)

    const battle = s.battles['harpy-roost']
    expect(battle?.mode).toBe('open')
    // 12 heroes + 25 scattered harpies → a heavy, many-token scene.
    expect(battle!.combatants.length).toBeGreaterThan(30)
    expect(battle!.combatants.filter((c) => c.team === 'enemy').length).toBeGreaterThan(20)
  })

  it('equips each hero with a full tactic loadout (real per-turn work)', () => {
    seedPerfBattle(12)
    for (const u of useGameStore.getState().units) {
      expect(u.tactics.length).toBeGreaterThan(1)   // 'charger' + the extras
    }
  })
})
