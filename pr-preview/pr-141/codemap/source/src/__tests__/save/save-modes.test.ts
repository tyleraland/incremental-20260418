import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { persistSave, switchProgressionMode, loadPersistedSave, exportSave, clearSave } from '@/save'
import { saveKeyFor, ACTIVE_MODE_KEY, SAVE_KEY } from '@/lib/save'
import { makeUnit } from '../helpers'

// Per-mode saves: sandbox and curated never share a slot, switching is
// non-destructive (saves the current game first), and resetting only wipes the
// active mode.
beforeEach(() => {
  localStorage.clear()
  useGameStore.getState().setProgressionMode('sandbox')
})

describe('per-mode save slots', () => {
  it('persists to the active mode slot and records which mode is active', () => {
    useGameStore.getState().setProgressionMode('sandbox')
    persistSave()
    expect(localStorage.getItem(saveKeyFor('sandbox'))).toMatch(/^v1:/)
    expect(localStorage.getItem(ACTIVE_MODE_KEY)).toBe('sandbox')
    expect(localStorage.getItem(saveKeyFor('curated'))).toBeNull()   // untouched
  })

  it('keeps separate games per mode; switching saves one and restores the other', () => {
    // A sandbox game, tagged with a recognisable hero.
    useGameStore.getState().setProgressionMode('sandbox')
    useGameStore.setState({ units: [makeUnit({ id: 'sandbox-hero' })] })
    persistSave()

    // Switch to curated → sandbox slot preserved; curated seeds a fresh game.
    switchProgressionMode('curated')
    expect(useGameStore.getState().progressionMode).toBe('curated')
    expect(localStorage.getItem(saveKeyFor('sandbox'))).not.toBeNull()
    expect(useGameStore.getState().units.some((u) => u.id === 'sandbox-hero')).toBe(false)

    // Tag + save the curated game, then bounce between modes.
    useGameStore.setState({ units: [makeUnit({ id: 'curated-hero', class: null })] })
    persistSave()

    switchProgressionMode('sandbox')
    expect(useGameStore.getState().units.map((u) => u.id)).toContain('sandbox-hero')

    switchProgressionMode('curated')
    expect(useGameStore.getState().units.map((u) => u.id)).toContain('curated-hero')
  })

  it('resetSave wipes only the active mode slot', () => {
    useGameStore.getState().setProgressionMode('sandbox')
    persistSave()
    switchProgressionMode('curated')
    persistSave()
    expect(localStorage.getItem(saveKeyFor('sandbox'))).not.toBeNull()
    expect(localStorage.getItem(saveKeyFor('curated'))).not.toBeNull()

    useGameStore.getState().resetSave()   // in curated
    expect(localStorage.getItem(saveKeyFor('curated'))).toBeNull()
    expect(localStorage.getItem(saveKeyFor('sandbox'))).not.toBeNull()   // the other game survives
  })

  it('migrates a legacy single save into the matching mode slot on load', () => {
    // Craft a legacy (pre-split) save in curated and stash it under the old key.
    useGameStore.getState().setProgressionMode('curated')
    useGameStore.setState({ units: [makeUnit({ id: 'legacy-hero', class: null })] })
    const legacy = exportSave()
    localStorage.clear()
    localStorage.setItem(SAVE_KEY, legacy)
    useGameStore.getState().setProgressionMode('sandbox')   // in-memory mode pre-load

    loadPersistedSave()

    expect(localStorage.getItem(SAVE_KEY)).toBeNull()                      // legacy key consumed
    expect(localStorage.getItem(saveKeyFor('curated'))).not.toBeNull()     // routed by its own mode
    expect(useGameStore.getState().progressionMode).toBe('curated')
    expect(useGameStore.getState().units.map((u) => u.id)).toContain('legacy-hero')
  })

  it('clearSave removes both slots and the active marker', () => {
    useGameStore.getState().setProgressionMode('sandbox'); persistSave()
    switchProgressionMode('curated'); persistSave()
    clearSave()
    expect(localStorage.getItem(saveKeyFor('sandbox'))).toBeNull()
    expect(localStorage.getItem(saveKeyFor('curated'))).toBeNull()
    expect(localStorage.getItem(ACTIVE_MODE_KEY)).toBeNull()
  })
})
