// Tests for the per-unit action slots and their auto-sync with the sideboard.
//
// Invariants:
//   - Placing an *item* into an action slot also stages it in the sideboard.
//   - When the sideboard is full, placing a new item evicts sideboard1 and
//     clears any action slot that referenced the evicted item.
//   - Clearing the last action slot that referenced an item removes it from
//     the sideboard too.
//   - Skill entries never touch the sideboard.

import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => {
  resetStore({ units: [makeUnit({ id: 'u1' })] })
})

function u() { return useGameStore.getState().units[0] }

describe('setActionSlot — item ↔ sideboard linkage', () => {
  it('placing an item also stages it in sideboard1', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'item', id: 'eq-knife-fire' })
    const unit = u()
    expect(unit.actionSlots[0]).toEqual({ kind: 'item', id: 'eq-knife-fire' })
    expect(unit.equipment.sideboard1).toBe('eq-knife-fire')
    expect(unit.equipment.sideboard2).toBe(null)
  })

  it('placing a second distinct item fills sideboard2', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'item', id: 'eq-knife-fire' })
    useGameStore.getState().setActionSlot('u1', 1, { kind: 'item', id: 'eq-knife-water' })
    const unit = u()
    expect(unit.equipment.sideboard1).toBe('eq-knife-fire')
    expect(unit.equipment.sideboard2).toBe('eq-knife-water')
  })

  it('placing a third item evicts sideboard1 and clears its action slot', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'item', id: 'eq-knife-fire' })
    useGameStore.getState().setActionSlot('u1', 1, { kind: 'item', id: 'eq-knife-water' })
    useGameStore.getState().setActionSlot('u1', 2, { kind: 'item', id: 'eq-knife-earth' })
    const unit = u()
    // Evicted item (fire) is no longer in the sideboard, and its action slot
    // was cleared too.
    expect(unit.equipment.sideboard1).toBe('eq-knife-water')
    expect(unit.equipment.sideboard2).toBe('eq-knife-earth')
    expect(unit.actionSlots[0]).toBe(null)
    expect(unit.actionSlots[1]).toEqual({ kind: 'item', id: 'eq-knife-water' })
    expect(unit.actionSlots[2]).toEqual({ kind: 'item', id: 'eq-knife-earth' })
  })

  it('clearing the last action slot referencing an item removes it from sideboard', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'item', id: 'eq-knife-fire' })
    useGameStore.getState().setActionSlot('u1', 0, null)
    const unit = u()
    expect(unit.actionSlots[0]).toBe(null)
    expect(unit.equipment.sideboard1).toBe(null)
  })

  it('items in more than one action slot stay reserved while any slot references them', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'item', id: 'eq-knife-fire' })
    useGameStore.getState().setActionSlot('u1', 3, { kind: 'item', id: 'eq-knife-fire' })
    useGameStore.getState().setActionSlot('u1', 0, null)
    const unit = u()
    expect(unit.equipment.sideboard1).toBe('eq-knife-fire')
    expect(unit.actionSlots[3]).toEqual({ kind: 'item', id: 'eq-knife-fire' })
  })

  it('skill entries do not touch the sideboard', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'skill', id: 'bash' })
    const unit = u()
    expect(unit.actionSlots[0]).toEqual({ kind: 'skill', id: 'bash' })
    expect(unit.equipment.sideboard1).toBe(null)
    expect(unit.equipment.sideboard2).toBe(null)
  })

  it('replacing an item slot with a skill releases the sideboard reservation', () => {
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'item', id: 'eq-knife-fire' })
    useGameStore.getState().setActionSlot('u1', 0, { kind: 'skill', id: 'fire-bolt' })
    const unit = u()
    expect(unit.actionSlots[0]).toEqual({ kind: 'skill', id: 'fire-bolt' })
    expect(unit.equipment.sideboard1).toBe(null)
  })
})
