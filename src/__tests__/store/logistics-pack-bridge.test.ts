// §logistics ⇄ §consumables bridge — editing a hero's logistics loadout writes
// carry *targets* into the real Unit.pack, so the in-town reconcile withdraws the
// configured consumables from the guild stash and they count against carry weight.
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { useExpeditionStore } from '@/proto/expeditionStore'
import { consumablesWeight, heroCarried, heroRoom, heroFull, WEIGHT_LIMIT } from '@/proto/economy'
import { makeUnit, resetStore } from '../helpers'

beforeEach(() => {
  resetStore({ units: [makeUnit({ id: 'u1' })] })
  useExpeditionStore.setState({ heroes: {} })
})

const unit = () => useGameStore.getState().units.find((u) => u.id === 'u1')!
const target = (id: string) => unit().pack?.find((p) => p.itemId === id)?.target

describe('loadout → Unit.pack carry targets', () => {
  it('adding a supply sets a matching carry target on the hero pack', () => {
    useExpeditionStore.getState().addSupply('u1', 'potion-hp')
    useExpeditionStore.getState().setSupplyQty('u1', 'potion-hp', 25)
    expect(target('potion-hp')).toBe(25)
  })

  it('ensure() seeds the default loadout target', () => {
    useExpeditionStore.getState().ensure('u1')
    // DEFAULT_LOADOUT carries 5 potion-hp
    expect(target('potion-hp')).toBe(5)
  })

  it('removing a supply clears the carry target (and any carried stock returns to the stash)', () => {
    useExpeditionStore.getState().addSupply('u1', 'potion-hp')
    useExpeditionStore.getState().setSupplyQty('u1', 'potion-hp', 25)
    expect(target('potion-hp')).toBe(25)
    useExpeditionStore.getState().removeSupply('u1', 'potion-hp')
    expect(unit().pack?.some((p) => p.itemId === 'potion-hp')).toBe(false)
  })

  it('applyToParty copies the loadout targets onto every target hero', () => {
    resetStore({ units: [makeUnit({ id: 'u1' }), makeUnit({ id: 'u2' })] })
    useExpeditionStore.setState({ heroes: {} })
    useExpeditionStore.getState().addSupply('u1', 'potion-hp-greater')
    useExpeditionStore.getState().setSupplyQty('u1', 'potion-hp-greater', 12)
    useExpeditionStore.getState().applyToParty('u1', ['u2'])
    const u2 = useGameStore.getState().units.find((u) => u.id === 'u2')!
    expect(u2.pack?.find((p) => p.itemId === 'potion-hp-greater')?.target).toBe(12)
  })
})

describe('reload safety — ensure() hydrates the loadout from persisted pack targets', () => {
  it('does not clobber surviving pack targets with the default loadout', () => {
    // Simulate a reload: the unit's pack (persisted) carries a configured greater
    // potion (target 12), but the expedition store (unpersisted) is empty.
    resetStore({ units: [makeUnit({ id: 'u1', pack: [{ itemId: 'potion-hp-greater', count: 8, target: 12 }] })] })
    useExpeditionStore.setState({ heroes: {} })

    useExpeditionStore.getState().ensure('u1')

    // Loadout is rebuilt from the surviving target, NOT reset to the default potion-hp.
    const lo = useExpeditionStore.getState().heroes['u1'].loadout
    expect(lo['potion-hp-greater']?.qty).toBe(12)
    expect(lo['potion-hp']).toBeUndefined()

    // The persisted pack target + carried stock are untouched (no spurious deposit).
    const p = unit().pack?.find((x) => x.itemId === 'potion-hp-greater')
    expect(p?.target).toBe(12)
    expect(p?.count).toBe(8)
  })

  it('falls back to the default loadout for a hero carrying no configured consumables', () => {
    resetStore({ units: [makeUnit({ id: 'u1' })] })
    useExpeditionStore.setState({ heroes: {} })
    useExpeditionStore.getState().ensure('u1')
    expect(useExpeditionStore.getState().heroes['u1'].loadout['potion-hp']?.qty).toBe(5)
    expect(target('potion-hp')).toBe(5)
  })
})

describe('combined carry weight (loot pack + carried consumables)', () => {
  it('consumablesWeight sums itemWeight × count', () => {
    // potion-hp weighs 3, potion-hp-greater weighs 5
    expect(consumablesWeight([{ itemId: 'potion-hp', count: 10 }])).toBe(30)
    expect(consumablesWeight([
      { itemId: 'potion-hp', count: 10 },
      { itemId: 'potion-hp-greater', count: 2 },
    ])).toBe(40)
    expect(consumablesWeight(undefined)).toBe(0)
  })

  it('heroCarried folds loot pack and carried consumables', () => {
    const loot = { 'drop-slime-gel': 5 }  // weight 8 each → 40
    const pack = [{ itemId: 'potion-hp', count: 10, target: 10 }]  // 30
    expect(heroCarried(loot, pack)).toBe(70)
    expect(heroRoom(loot, pack)).toBe(WEIGHT_LIMIT - 70)
    expect(heroFull(loot, pack)).toBe(false)
  })

  it('heroFull trips once combined weight reaches the limit', () => {
    const pack = [{ itemId: 'potion-hp-greater', count: WEIGHT_LIMIT / 5, target: 0 }] // exactly the cap
    expect(heroFull(undefined, pack)).toBe(true)
    expect(heroRoom(undefined, pack)).toBe(0)
  })
})
