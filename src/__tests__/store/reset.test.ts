// resetSave must fully reset — including wiping the persisted save blob, not just
// in-memory state. Regression: a leveled save survived in localStorage and the
// next page load restored it, so the reset silently didn't stick (skill levels
// stayed > 1 on a fresh build).
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { persistSave } from '@/save'
import { SAVE_KEY } from '@/lib/save'
import { makeUnit, resetStore } from '../helpers'

describe('store: resetSave', () => {
  beforeEach(() => localStorage.clear())

  it('wipes the persisted save and restores the level-1 starter baseline', () => {
    // A leveled save sitting in localStorage (what a played-in save looks like).
    resetStore({ units: [makeUnit({ id: 'x', learnedSkills: { 'fire-bolt': 5 } })] })
    persistSave()
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()

    useGameStore.getState().resetSave()

    // The stale save is gone, so a reload now falls back to fresh INITIAL_UNITS.
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    // ...and in-memory units are the starter party, all skills at level 1.
    const units = useGameStore.getState().units
    expect(units.length).toBeGreaterThan(0)
    for (const u of units) {
      // Starters carry no leftover progression: zero banked exp and no skill
      // ranks above 1. (Level itself is a design choice — a Novice starter ships
      // at level 2 so a city class-change is available out of the box.)
      expect(u.level).toBeGreaterThanOrEqual(1)
      expect(u.exp).toBe(0)
      for (const lv of Object.values(u.learnedSkills)) expect(lv).toBeLessThanOrEqual(1)
    }
  })
})
