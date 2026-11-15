// §minions: Summon Skeletons — a self-cast that raises two owned, leashed,
// time-limited melee bodies (Guardian) that follow the caster, crumble after
// their TTL or when the caster falls, and are capped at two live at once.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from './helpers'

const skellies = (b: BattleState, ownerId = 'necro') =>
  b.combatants.filter((c) => c.ownerId === ownerId && c.summonTag === 'summon-skeletons')
const live = (b: BattleState) => skellies(b).filter((c) => c.alive)

// A stationary caster carrying only Summon Skeletons, vs a far, idle dummy.
const necro = (extra = {}) => eu({ id: 'necro', str: 0, int: 10, maxHp: 300, hp: 300, moveSpeed: 0, skills: [buildEngineSkill('summon-skeletons', 3)!], ...extra })
const dummy = (extra = {}) => eu({ id: 'e', team: 'enemy', str: 0, maxHp: 500, hp: 500, moveSpeed: 0, ...extra })

describe('Summon Skeletons catalog', () => {
  it('is an instant self-cast summon for two leashed, timed minions', () => {
    const s = buildEngineSkill('summon-skeletons', 3)!
    expect(s.type).toBe('summon')
    expect(s.targeting).toBe('self')
    expect(s.summon?.count).toBe(2)
    expect(s.summon?.maxActive).toBe(2)
    expect(s.summon?.tactics?.[0].id).toBe('guardian')
    expect(s.summon?.leash).toBeGreaterThan(0)
  })
})

describe('Summon Skeletons in combat', () => {
  it('raises two owned skeletons on the caster team, leashed near the caster', () => {
    const b = createBattle({ playerUnits: [necro()], enemyUnits: [dummy()] })
    b.combatants.find((c) => c.id === 'necro')!.pos = { x: 7, y: 7 }
    b.combatants.find((c) => c.id === 'e')!.pos = { x: 7, y: 13 }
    advanceRound(b)   // caster's turn → cast
    const mob = live(b)
    expect(mob).toHaveLength(2)
    for (const m of mob) {
      expect(m.team).toBe('player')
      expect(m.ownerId).toBe('necro')
      expect(m.leashRange).toBeGreaterThan(0)
      expect(m.summonTtl).toBeGreaterThan(0)
      expect(m.hp).toBeLessThan(60)   // low HP
    }
  })

  it('does not exceed the active cap of two on recast', () => {
    const b = createBattle({ playerUnits: [necro()], enemyUnits: [dummy()] })
    for (let i = 0; i < 12; i++) advanceRound(b)   // plenty of casts, cooldown permitting
    expect(live(b).length).toBeLessThanOrEqual(2)
  })

  it('crumbles the skeletons after their lifetime expires', () => {
    const b = createBattle({ playerUnits: [necro()], enemyUnits: [dummy()] })
    advanceRound(b)
    expect(live(b)).toHaveLength(2)
    const ttl = skellies(b)[0].summonTtl!
    for (let i = 0; i < ttl + 2; i++) advanceRound(b)
    // After TTL they're gone (or re-summoned ones are still ≤ cap and freshly timed,
    // but the originals from round 1 must have crumbled at least once).
    expect(skellies(b).some((c) => !c.alive)).toBe(true)
  })

  it('crumbles all skeletons the moment the caster dies', () => {
    const b = createBattle({ playerUnits: [necro()], enemyUnits: [dummy()] })
    advanceRound(b)
    expect(live(b)).toHaveLength(2)
    const necroC = b.combatants.find((c) => c.id === 'necro')!
    necroC.hp = 0
    necroC.alive = false
    advanceRound(b)
    expect(live(b)).toHaveLength(0)
  })
})
