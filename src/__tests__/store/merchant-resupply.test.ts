// §logistics — a MERCHANT-sourced supplies loadout actually loads: while a hero is
// in a city, the driver buys the shortfall from a merchant that stocks it (paying
// gold, into the stash), and the in-town pack reconcile then withdraws it into the
// hero's pack. (Before, the reconcile only pulled from the stash, so a merchant-only
// loadout with an empty stash never filled.)
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { buyMerchantSupplies } from '@/proto/expeditionDriver'
import { newSupplyEntry, type Loadout } from '@/proto/expedition'
import { INITIAL_LOCATIONS } from '@/data/locations'
import { makeUnit, resetStore, tick } from '../helpers'

const gold = () => useGameStore.getState().miscItems.find((m) => m.id === 'm-gold')?.quantity ?? 0
const stash = (id: string) => useGameStore.getState().miscItems.find((m) => m.id === id)?.quantity ?? 0
const unit = (id: string) => useGameStore.getState().units.find((u) => u.id === id)!
const carried = (id: string, item: string) => unit(id).pack?.find((p) => p.itemId === item)?.count ?? 0

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))
afterEach(() => vi.restoreAllMocks())

describe('merchant-sourced supplies resupply', () => {
  const loadout: Loadout = { 'potion-hp': { ...newSupplyEntry(10), storage: false, merchant: true } }

  it('buys the shortfall from a Prontera merchant into the stash (spending gold)', () => {
    resetStore({
      locations: INITIAL_LOCATIONS,
      units: [makeUnit({ id: 'u1', locationId: 'prontera-city' })],
      miscItems: [{ id: 'm-gold', name: 'Gold', quantity: 1000 }],
    })
    buyMerchantSupplies(unit('u1'), 'prontera-city', loadout)
    expect(stash('potion-hp')).toBe(10)      // bought up to the target
    expect(gold()).toBeLessThan(1000)        // paid for them
  })

  it('only buys what the hero can afford', () => {
    resetStore({
      locations: INITIAL_LOCATIONS,
      units: [makeUnit({ id: 'u1', locationId: 'prontera-city' })],
      miscItems: [{ id: 'm-gold', name: 'Gold', quantity: 25 }],   // potion-hp is 12g → 2 affordable
    })
    buyMerchantSupplies(unit('u1'), 'prontera-city', loadout)
    expect(stash('potion-hp')).toBe(2)
  })

  it('a DEFAULT-source loadout buys from the merchant (idle hero in town, gold in bank)', () => {
    resetStore({
      locations: INITIAL_LOCATIONS,
      units: [makeUnit({ id: 'u1', locationId: 'prontera-city' })],
      miscItems: [{ id: 'm-gold', name: 'Gold', quantity: 64_000 }],
    })
    // newSupplyEntry now defaults to "either" (storage + merchant), so the common
    // case — a configured loadout + gold, but an empty stash — restocks itself.
    buyMerchantSupplies(unit('u1'), 'prontera-city', { 'potion-hp': newSupplyEntry(25) })
    expect(stash('potion-hp')).toBe(25)
    expect(gold()).toBeLessThan(64_000)
  })

  it('turning merchant OFF opts out (lives off the stash only)', () => {
    resetStore({
      locations: INITIAL_LOCATIONS,
      units: [makeUnit({ id: 'u1', locationId: 'prontera-city' })],
      miscItems: [{ id: 'm-gold', name: 'Gold', quantity: 64_000 }],
    })
    buyMerchantSupplies(unit('u1'), 'prontera-city', { 'potion-hp': { ...newSupplyEntry(25), merchant: false } })
    expect(stash('potion-hp')).toBe(0)
    expect(gold()).toBe(64_000)
  })

  it('end-to-end: a merchant loadout fills the pack over a few in-town ticks', () => {
    resetStore({
      locations: INITIAL_LOCATIONS,
      units: [makeUnit({ id: 'u1', locationId: 'prontera-city', pack: [{ itemId: 'potion-hp', count: 0, target: 10 }] })],
      miscItems: [{ id: 'm-gold', name: 'Gold', quantity: 1000 }],
    })
    // The driver is a hook; drive its merchant-buy by hand, then let the game tick
    // run the in-town reconcile that withdraws stash → pack.
    for (let i = 0; i < 6 && carried('u1', 'potion-hp') < 10; i++) {
      buyMerchantSupplies(unit('u1'), 'prontera-city', loadout)
      tick()
    }
    expect(carried('u1', 'potion-hp')).toBe(10)
  })
})
