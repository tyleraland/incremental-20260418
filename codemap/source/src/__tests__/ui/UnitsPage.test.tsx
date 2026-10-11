// Smoke test: rendering the Units page with an expanded unit must not throw.
// Regression target: a runtime crash in the action-slot bar / dnd-kit hookups
// that blanks the entire app when the user taps the Units tab.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Units } from '@/pages/Units'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => {
  resetStore()
  globalThis.ResizeObserver = class {
    observe() {}; unobserve() {}; disconnect() {}
  }
  Element.prototype.setPointerCapture    = () => {}
  Element.prototype.releasePointerCapture = () => {}
})
afterEach(() => cleanup())

describe('Units page render', () => {
  it('renders with no units without crashing', () => {
    expect(() => render(<Units />)).not.toThrow()
  })

  it('renders with one unit, collapsed', () => {
    resetStore({ units: [makeUnit({ id: 'u1' })] })
    expect(() => render(<Units />)).not.toThrow()
  })

  it('renders with one unit expanded (action bar + DndContext mount)', () => {
    resetStore({
      units: [makeUnit({ id: 'u1' })],
    })
    useGameStore.setState({ expandedUnitIds: ['u1'] })
    expect(() => render(<Units />)).not.toThrow()
  })

  it('renders with all INITIAL_UNITS and Aldric expanded (matches the live shape)', async () => {
    const { INITIAL_UNITS } = await import('@/data/units')
    resetStore({ units: INITIAL_UNITS })
    useGameStore.setState({ expandedUnitIds: ['u1'] })
    expect(() => render(<Units />)).not.toThrow()
  })

  it('renders fine when an active skill (with draggable handle) is learned', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', skillPoints: 0, learnedSkills: { 'fire-bolt': 1 } })],
    })
    useGameStore.setState({ expandedUnitIds: ['u1'] })
    expect(() => render(<Units />)).not.toThrow()
  })

  it('renders with an action slot already filled (item & skill)', () => {
    resetStore({
      units: [makeUnit({
        id: 'u1',
        learnedSkills: { 'bash': 1 },
        actionSlots: [
          { kind: 'skill', id: 'bash' },
          { kind: 'item', id: 'eq-knife-fire' },
          null, null, null, null,
        ],
        equipment: { armor: null, sideboard1: 'eq-knife-fire', sideboard2: null, accessory: null },
      })],
    })
    useGameStore.setState({ expandedUnitIds: ['u1'] })
    expect(() => render(<Units />)).not.toThrow()
  })
})
