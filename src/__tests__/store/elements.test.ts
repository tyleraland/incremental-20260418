import { describe, it, expect } from 'vitest'
import { elementMultiplier } from '@/lib/elements'

describe('elementMultiplier — sample relationships', () => {
  it('neutral vs neutral is 1x; vs ghost 0x; vs earth 0.33x', () => {
    expect(elementMultiplier('neutral', 'neutral')).toBe(1)
    expect(elementMultiplier('neutral', 'ghost')).toBe(0)
    expect(elementMultiplier('neutral', 'earth')).toBe(0.33)
  })

  it('fire is effective vs plant/ice (2x), ineffective vs water (0.33x), immune to fire (0x)', () => {
    expect(elementMultiplier('fire', 'plant')).toBe(2)
    expect(elementMultiplier('fire', 'ice')).toBe(2)
    expect(elementMultiplier('fire', 'water')).toBe(0.33)
    expect(elementMultiplier('fire', 'fire')).toBe(0)
  })

  it('electric is 2x vs water, 0x vs earth (grounded)', () => {
    expect(elementMultiplier('electric', 'water')).toBe(2)
    expect(elementMultiplier('electric', 'earth')).toBe(0)
  })

  it('radiant is 2x vs shadow / ghost / undead', () => {
    expect(elementMultiplier('radiant', 'shadow')).toBe(2)
    expect(elementMultiplier('radiant', 'ghost')).toBe(2)
    expect(elementMultiplier('radiant', 'undead')).toBe(2)
  })

  it('missing pairs default to 1x', () => {
    expect(elementMultiplier('water', 'undead')).toBe(1)
    expect(elementMultiplier('plant', 'ghost')).toBe(1)
  })
})
