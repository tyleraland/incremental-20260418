// Smoke tests: rendering the shell's per-hero lenses (HeroLens/EquipmentLens/
// SkillsLens, src/proto/ProtoLens.tsx) must not throw. Ported from the classic
// Units.tsx page's crash-guard suite (now deleted) — the original regression
// target was a runtime crash in the action-slot bar / dnd-kit hookups that
// blanked the entire app, so SkillsLens (the shell's action-bar/dnd-kit
// surface) gets the same specific data-shape cases classic covered.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { HeroLens, EquipmentLens, SkillsLens } from '@/proto/ProtoLens'
import { makeUnit, resetStore } from '../helpers'
import type { Unit } from '@/types'

beforeEach(() => {
  resetStore()
  globalThis.ResizeObserver = class { observe() {}; unobserve() {}; disconnect() {} }
  Element.prototype.setPointerCapture    = () => {}
  Element.prototype.releasePointerCapture = () => {}
})
afterEach(() => cleanup())

const renderAll = (unit: Unit) => {
  expect(() => render(<HeroLens unit={unit} />)).not.toThrow()
  cleanup()
  expect(() => render(<EquipmentLens unit={unit} />)).not.toThrow()
  cleanup()
  expect(() => render(<SkillsLens unit={unit} />)).not.toThrow()
}

describe('Hero lens render (shell)', () => {
  it('renders a bare unit without crashing', () => {
    const u = makeUnit({ id: 'u1' })
    resetStore({ units: [u] })
    renderAll(u)
  })

  it('renders every INITIAL_UNITS hero without crashing (matches the live shape)', async () => {
    const { INITIAL_UNITS } = await import('@/data/units')
    resetStore({ units: INITIAL_UNITS })
    for (const u of INITIAL_UNITS) renderAll(u)
  })

  it('SkillsLens renders fine when an active skill (with draggable handle) is learned', () => {
    const u = makeUnit({ id: 'u1', skillPoints: 0, learnedSkills: { 'fire-bolt': 1 } })
    resetStore({ units: [u] })
    expect(() => render(<SkillsLens unit={u} />)).not.toThrow()
  })

  it('SkillsLens renders with an action slot already filled (item & skill)', () => {
    const u = makeUnit({
      id: 'u1',
      learnedSkills: { bash: 1 },
      actionSlots: [
        { kind: 'skill', id: 'bash' },
        { kind: 'item', id: 'eq-knife-fire' },
        null, null, null, null,
      ],
      equipment: { armor: null, sideboard1: 'eq-knife-fire', sideboard2: null, accessory: null },
    })
    resetStore({ units: [u] })
    expect(() => render(<SkillsLens unit={u} />)).not.toThrow()
  })
})
