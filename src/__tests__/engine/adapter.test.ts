import { describe, it, expect } from 'vitest'
import { unitToEngineInput, monsterToEngineInput } from '@/engine'
import { getDerivedStats } from '@/lib/stats'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { makeUnit } from '../helpers'

describe('adapter: unitToEngineInput', () => {
  it('projects derived stats and defaults a weaponless unit to melee/front', () => {
    const unit = makeUnit({ id: 'u1', name: 'Ada', health: 42 })
    const d = getDerivedStats(unit, [])
    const e = unitToEngineInput(unit, d, 'player')
    expect(e).toMatchObject({
      id: 'u1', name: 'Ada', team: 'player',
      str: d.attack, def: d.defense, int: d.magicAttack, spd: d.attackSpeed,
      maxHp: d.maxHp, preferredRank: 'front', rangedRange: 0,
    })
    expect(e.hp).toBe(42)
    expect(e.meleeRange).toBeGreaterThan(0)
  })

  it('clamps hp into [0, maxHp]', () => {
    const unit = makeUnit({ health: 99999 })
    const d = getDerivedStats(unit, [])
    expect(unitToEngineInput(unit, d, 'player').hp).toBe(d.maxHp)
  })
})

describe('adapter: monsterToEngineInput', () => {
  it('maps a melee monster (slime)', () => {
    const e = monsterToEngineInput(MONSTER_REGISTRY['slime'], 'slime#0', 'enemy')
    expect(e).toMatchObject({
      id: 'slime#0', name: 'Slime', team: 'enemy',
      str: 1, def: 2, maxHp: 25, hp: 25, preferredRank: 'front', rangedRange: 0,
    })
  })

  it('treats a long-range monster (giant-frog) as ranged/back', () => {
    const e = monsterToEngineInput(MONSTER_REGISTRY['giant-frog'], 'giant-frog#0', 'enemy')
    expect(e.preferredRank).toBe('back')
    expect(e.rangedRange).toBeGreaterThan(0)
  })

  it('carries optional skills + tactics through to the engine (humanoid monsters)', () => {
    // Elite Four members are stats-like-a-monster but inherit the hero engine
    // kit: skills give per-skill engine tactics, and the explicit tactics list
    // flows through unchanged.
    const e = monsterToEngineInput(MONSTER_REGISTRY['elite-ranger'], 'elite-ranger#0', 'enemy')
    expect(e.skills.map((s) => s.id).sort()).toEqual(['ankle-snare', 'arrow-shower'])
    expect((e.tactics ?? []).map((t) => t.id).sort()).toEqual(['focus-casters', 'kiter', 'opportunist', 'retreater'])
  })
})
