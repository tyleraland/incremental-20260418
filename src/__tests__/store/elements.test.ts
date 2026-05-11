import { describe, it, expect } from 'vitest'
import { elementMultiplier } from '@/lib/elements'

describe('elementMultiplier — sample relationships', () => {
  it('neutral vs neutral is 1x; vs ghost 0x', () => {
    expect(elementMultiplier('neutral', 'neutral')).toBe(1)
    expect(elementMultiplier('neutral', 'ghost')).toBe(0)
  })

  it('fire is effective vs water/earth/poison/undead (2x), immune from fire (0.33x)', () => {
    expect(elementMultiplier('fire', 'water')).toBe(2)
    expect(elementMultiplier('fire', 'earth')).toBe(2)
    expect(elementMultiplier('fire', 'poison')).toBe(2)
    expect(elementMultiplier('fire', 'undead')).toBe(2)
    expect(elementMultiplier('fire', 'fire')).toBe(0.33)
  })

  it('lightning is 2x vs water and ineffective vs earth and itself', () => {
    expect(elementMultiplier('lightning', 'water')).toBe(2)
    expect(elementMultiplier('lightning', 'earth')).toBe(0.33)
    expect(elementMultiplier('lightning', 'lightning')).toBe(0.33)
  })

  it('holy is 2x vs poison / undead / ghost', () => {
    expect(elementMultiplier('holy', 'poison')).toBe(2)
    expect(elementMultiplier('holy', 'undead')).toBe(2)
    expect(elementMultiplier('holy', 'ghost')).toBe(2)
  })

  it('poison is immune to undead and ghost (0x)', () => {
    expect(elementMultiplier('poison', 'undead')).toBe(0)
    expect(elementMultiplier('poison', 'ghost')).toBe(0)
  })

  it('undead → holy is 0x; holy → undead is 2x', () => {
    expect(elementMultiplier('undead', 'holy')).toBe(0)
    expect(elementMultiplier('holy', 'undead')).toBe(2)
  })

  it('missing pairs default to 1x', () => {
    expect(elementMultiplier('water', 'undead')).toBe(1)
    expect(elementMultiplier('earth', 'fire')).toBe(1)
  })
})
