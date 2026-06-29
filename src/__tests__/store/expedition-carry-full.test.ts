// §logistics — a hero must head home when its pack is effectively full, even when
// the carried weight stalls a few units BELOW the limit. Loot arrives in discrete
// weights (a Living Nightshade berry weighs 20), so a 1000-cap pack saturates at
// 980–999 and an exact `>=1000` check never trips — the hero would hunt forever.
// Fullness is therefore "can't fit even the lightest drop here" (room < minDrop).
import { describe, it, expect } from 'vitest'
import { minDropWeight } from '@/proto/expeditionDriver'
import { freshHero } from '@/proto/expeditionStore'
import { heroFull, heroRoom, itemWeight } from '@/proto/economy'
import type { Location, PackItem } from '@/types'

const nightshadeField = {
  id: 'prontera-field-3', region: 'world', name: 'Prontera Field', description: '',
  traits: ['plains'], monsterIds: ['living-nightshade'], familiarityMax: 100,
  connections: [], openWorld: true, openWorldCap: 180, openWorldSize: 200,
} as unknown as Location

describe('carry-full return trigger (discrete drop weights)', () => {
  it('a nightshade berry weighs the default 20 (not in the weight table)', () => {
    expect(itemWeight('drop-nightshade-berry')).toBe(20)
  })

  it('minDropWeight reflects the lightest keepable drop on the field', () => {
    expect(minDropWeight(nightshadeField, freshHero())).toBe(20)
  })

  it('a pack stalled below the limit is full (room < minDrop) though heroFull() is false', () => {
    // 49 berries (×20 = 980) + 3 potions (×3 = 9) = 989 carried → room 11, < 20.
    const loot = { 'drop-nightshade-berry': 49 }
    const consumables: PackItem[] = [{ itemId: 'potion-hp', count: 3, target: 3 }]
    const minDrop = minDropWeight(nightshadeField, freshHero())

    expect(heroFull(loot, consumables)).toBe(false)            // 989 < 1000 → old check never fires
    expect(heroRoom(loot, consumables)).toBeLessThan(minDrop)  // but no room for another berry
    // → the driver's `room < minDropWeight` makes this hero "full" and sends it home.
  })

  it('a roomy pack is NOT full (room >= minDrop)', () => {
    const loot = { 'drop-nightshade-berry': 10 }   // 200 carried, room 800
    expect(heroRoom(loot, undefined)).toBeGreaterThanOrEqual(minDropWeight(nightshadeField, freshHero()))
  })
})
