import { describe, it, expect } from 'vitest'
import { elementMultiplier } from '@/lib/elements'

describe('elementMultiplier — the 4-element wheel + exotic matchups', () => {
  it('core wheel: 1.5× the one it beats, 0.75× the one that beats it, 0.25× itself, 1× its opposite', () => {
    // beats-chain: fire → earth → wind → water → fire
    expect(elementMultiplier('fire', 'earth')).toBe(1.5)
    expect(elementMultiplier('fire', 'water')).toBe(0.75)
    expect(elementMultiplier('fire', 'fire')).toBe(0.25)
    expect(elementMultiplier('fire', 'wind')).toBe(1)

    expect(elementMultiplier('earth', 'wind')).toBe(1.5)
    expect(elementMultiplier('earth', 'fire')).toBe(0.75)
    expect(elementMultiplier('earth', 'earth')).toBe(0.25)
    expect(elementMultiplier('earth', 'water')).toBe(1)

    expect(elementMultiplier('wind', 'water')).toBe(1.5)
    expect(elementMultiplier('wind', 'earth')).toBe(0.75)
    expect(elementMultiplier('wind', 'wind')).toBe(0.25)
    expect(elementMultiplier('wind', 'fire')).toBe(1)

    expect(elementMultiplier('water', 'fire')).toBe(1.5)
    expect(elementMultiplier('water', 'wind')).toBe(0.75)
    expect(elementMultiplier('water', 'water')).toBe(0.25)
    expect(elementMultiplier('water', 'earth')).toBe(1)
  })

  it('neutral vs neutral is 1×; vs ghost 0×', () => {
    expect(elementMultiplier('neutral', 'neutral')).toBe(1)
    expect(elementMultiplier('neutral', 'ghost')).toBe(0)
  })

  it('exotic matchups retained: radiant 2× undead/ghost, poison 0× undead, undead 0× radiant', () => {
    expect(elementMultiplier('radiant', 'undead')).toBe(2)
    expect(elementMultiplier('radiant', 'ghost')).toBe(2)
    expect(elementMultiplier('poison', 'undead')).toBe(0)
    expect(elementMultiplier('undead', 'radiant')).toBe(0)
  })

  it('cross pairs between the core wheel and the exotic elements default to 1×', () => {
    expect(elementMultiplier('fire', 'poison')).toBe(1)
    expect(elementMultiplier('water', 'undead')).toBe(1)
    expect(elementMultiplier('wind', 'radiant')).toBe(1)
  })
})
