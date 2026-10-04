// Map navigation actions: roster double-tap (showUnitOnMap) and the "Map"
// button (focusLocationOnMap). In overworld mode both frame + recentre the
// camera (mapFocusNonce bump); in battle mode a roster double-tap re-centres
// the battlefield on that unit (battleFocus).
import { describe, expect, it } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { makeUnit, resetStore } from '../helpers'

const LOC = (id: string, region = 'world'): Location => ({
  id, region, name: id, description: '', traits: [], monsterIds: ['slime'],
  familiarityMax: 100, connections: [],
})

describe('map navigation', () => {
  it('overworld: showUnitOnMap frames the unit location and bumps the focus nonce', () => {
    resetStore({
      locations: [LOC('beach-1')],
      units: [makeUnit({ id: 'u1', locationId: 'beach-1' })],
    })
    useGameStore.setState({ mapMode: 'world', selectedLocationId: null, mapFocusNonce: 0 })
    useGameStore.getState().showUnitOnMap('u1')
    const s = useGameStore.getState()
    expect(s.mapMode).toBe('world')
    expect(s.selectedLocationId).toBe('beach-1')
    expect(s.mapFocusNonce).toBe(1)        // camera recentre requested
  })

  it('focusLocationOnMap selects + recentres on the location', () => {
    resetStore({ locations: [LOC('prontera-field-2')] })
    useGameStore.setState({ selectedLocationId: null, mapFocusNonce: 5 })
    useGameStore.getState().focusLocationOnMap('prontera-field-2')
    const s = useGameStore.getState()
    expect(s.selectedLocationId).toBe('prontera-field-2')
    expect(s.mapFocusNonce).toBe(6)
  })

  it('battle mode: showUnitOnMap jumps to the unit battlefield and sets battleFocus', () => {
    resetStore({
      locations: [LOC('beach-1')],
      units: [makeUnit({ id: 'u1', locationId: 'beach-1' })],
    })
    useGameStore.setState({ mapMode: 'battle', combatLocationId: 'other', battleFocus: null })
    useGameStore.getState().showUnitOnMap('u1')
    const s = useGameStore.getState()
    expect(s.mapMode).toBe('battle')           // stays in battle view
    expect(s.combatLocationId).toBe('beach-1') // jumped to the unit's field
    expect(s.battleFocus?.unitId).toBe('u1')   // camera centres on the unit
    expect(s.battleFocus?.nonce).toBe(1)
  })

  it('battle mode: an unassigned unit keeps the current field but still focuses', () => {
    resetStore({ locations: [LOC('beach-1')], units: [makeUnit({ id: 'u1', locationId: null })] })
    useGameStore.setState({ mapMode: 'battle', combatLocationId: 'beach-1', battleFocus: { unitId: 'x', nonce: 3 } })
    useGameStore.getState().showUnitOnMap('u1')
    const s = useGameStore.getState()
    expect(s.combatLocationId).toBe('beach-1')   // unchanged (unit has no location)
    expect(s.battleFocus?.unitId).toBe('u1')
    expect(s.battleFocus?.nonce).toBe(4)         // nonce advances off the previous
  })
})
