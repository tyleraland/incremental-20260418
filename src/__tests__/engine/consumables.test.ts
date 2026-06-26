// §consumables: a carried item used mid-combat under a player rule. The hero
// drinks a health potion when HP drops below the configured threshold, healing to
// full and decrementing the pack — all in-engine, so it lives in the snapshot and
// replays 1:1.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, serializeBattle, deserializeBattle,
  type BattleState, type ConsumableSpec,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const SPEC: ConsumableSpec = { itemId: 'potion-hp', threshold: 0.4, effect: 'heal-max' }
const HEAL = (itemId: string, healAmount: number): ConsumableSpec => ({ itemId, threshold: 0.5, effect: 'heal', healAmount })

function woundedHeroBattle(pack: Record<string, number>, specs: ConsumableSpec[]): BattleState {
  const b = createBattle({
    playerUnits: [eu({ id: 'hero', name: 'Hero', maxHp: 50, hp: 50, pack, consumableSpecs: specs })],
    enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 80, hp: 80 })],
    mode: 'open', cols: 20, rows: 20,
  })
  find(b, 'hero').pos = { x: 5, y: 5 }
  // Far enough that the slime can't close to melee in one round — so a heal-to-max
  // is cleanly observable (it's still visible: encounter/∞ vision). It only gates
  // the use rule, which needs *a* foe in sight, not an adjacent one.
  find(b, 'slime#0').pos = { x: 17, y: 5 }
  return b
}

describe('consumables', () => {
  it('uses a potion when HP is below the rule threshold, healing to full', () => {
    const b = woundedHeroBattle({ 'potion-hp': 1 }, [SPEC])
    const hero = find(b, 'hero')
    hero.hp = 15   // 30% of 50 — below the 40% threshold

    advanceRound(b)

    expect(hero.hp).toBe(hero.maxHp)           // healed to full
    expect(hero.pack['potion-hp']).toBe(0)     // one potion consumed
    expect(b.stats.potionsConsumed).toBe(1)
  })

  it('does not fire above the threshold, when out of stock, or without a rule', () => {
    // Above threshold: full HP → no use.
    const healthy = woundedHeroBattle({ 'potion-hp': 1 }, [SPEC])
    advanceRound(healthy)
    expect(find(healthy, 'hero').pack['potion-hp']).toBe(1)

    // Out of stock: wounded but pack empty → no heal.
    const empty = woundedHeroBattle({ 'potion-hp': 0 }, [SPEC])
    find(empty, 'hero').hp = 10
    advanceRound(empty)
    expect(find(empty, 'hero').hp).toBeLessThanOrEqual(10)   // never healed up

    // No rule (allow-list empty): wounded with stock but the player never allowed it.
    const noRule = woundedHeroBattle({ 'potion-hp': 5 }, [])
    find(noRule, 'hero').hp = 10
    advanceRound(noRule)
    expect(find(noRule, 'hero').pack['potion-hp']).toBe(5)   // untouched
  })

  it('a fixed-amount heal restores its amount, capped at the missing HP', () => {
    // maxHp 200, hp 50 → missing 150. A Health Potion (80) heals 80 → 130.
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', name: 'Hero', maxHp: 200, hp: 50, pack: { 'potion-hp': 1 }, consumableSpecs: [HEAL('potion-hp', 80)] })],
      enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 80, hp: 80 })],
      mode: 'open', cols: 20, rows: 20,
    })
    find(b, 'hero').pos = { x: 5, y: 5 }
    find(b, 'slime#0').pos = { x: 17, y: 5 }
    advanceRound(b)
    expect(find(b, 'hero').hp).toBe(130)
  })

  it('the greater potion heals more than the basic one from the same wound', () => {
    const mk = (itemId: string, amount: number) => {
      const b = createBattle({
        playerUnits: [eu({ id: 'hero', name: 'Hero', maxHp: 400, hp: 100, pack: { [itemId]: 1 }, consumableSpecs: [HEAL(itemId, amount)] })],
        enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 80, hp: 80 })],
        mode: 'open', cols: 20, rows: 20,
      })
      find(b, 'hero').pos = { x: 5, y: 5 }
      find(b, 'slime#0').pos = { x: 17, y: 5 }
      advanceRound(b)
      return find(b, 'hero').hp
    }
    expect(mk('potion-hp-greater', 220)).toBeGreaterThan(mk('potion-hp', 80))
  })

  it('round-trips the pack through a snapshot and replays identically', () => {
    const original = woundedHeroBattle({ 'potion-hp': 3 }, [SPEC])
    find(original, 'hero').hp = 12
    advanceRound(original)   // uses one potion → pack 2, hp full

    const reloaded = deserializeBattle(serializeBattle(original))
    expect(find(reloaded, 'hero').pack).toEqual(find(original, 'hero').pack)
    expect(find(reloaded, 'hero').consumableSpecs).toEqual(find(original, 'hero').consumableSpecs)
    // The rebuilt use-item tactic is present (reconstructed from the serialized spec).
    expect(find(reloaded, 'hero').tactics.some((t) => t.def.id === 'item:potion-hp')).toBe(true)

    // Drive both low again and confirm they consume in lockstep.
    for (let r = 0; r < 10; r++) {
      find(original, 'hero').hp = 12
      find(reloaded, 'hero').hp = 12
      advanceRound(original)
      advanceRound(reloaded)
    }
    expect(find(reloaded, 'hero').pack).toEqual(find(original, 'hero').pack)
  })

  it('a hero with no consumable config has an empty pack and injects no item tactic', () => {
    const b = woundedHeroBattle({}, [])
    const hero = find(b, 'hero')
    expect(hero.pack).toEqual({})
    expect(hero.tactics.some((t) => t.def.id.startsWith('item:'))).toBe(false)
    // Round-trips clean (the legacy-equivalent path).
    const clone = deserializeBattle(serializeBattle(b))
    expect(find(clone, 'hero').pack).toEqual({})
  })
})
