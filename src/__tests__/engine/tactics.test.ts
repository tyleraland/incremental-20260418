import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, resolveTactics, TACTIC_REGISTRY,
  chargerBonus, armoredFactor, nimblePeriod, tauntBiasOf,
  type BattleState, type Combatant, type ResolvedTactic,
} from '@/engine'
import { eu, combatant } from './helpers'

const stateOf = (combatants: Combatant[]) => ({ combatants } as unknown as BattleState)
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const T = (id: string, rank = 1): ResolvedTactic => ({ def: TACTIC_REGISTRY[id], rank })

describe('tactics: targeting', () => {
  it('Tank Buster locks the highest-DEF enemy', () => {
    const self = combatant({ id: 'p' })
    const e1 = combatant({ id: 'e1', team: 'enemy', def: 4 })
    const e2 = combatant({ id: 'e2', team: 'enemy', def: 40 })
    expect(TACTIC_REGISTRY['tank-buster'].targeting!(self, stateOf([self, e1, e2]), 1)).toBe('e2')
  })

  it('Opportunist locks a wounded enemy, else falls through', () => {
    const self = combatant({ id: 'p' })
    const full = combatant({ id: 'e1', team: 'enemy', hp: 100, maxHp: 100 })
    const hurt = combatant({ id: 'e2', team: 'enemy', hp: 20, maxHp: 100 })
    expect(TACTIC_REGISTRY['opportunist'].targeting!(self, stateOf([self, full, hurt]), 1)).toBe('e2')
    expect(TACTIC_REGISTRY['opportunist'].targeting!(self, stateOf([self, full]), 1)).toBeNull()
  })

  it('Interrupt locks the nearest enemy that is mid-cast', () => {
    const self = combatant({ id: 'p', pos: { x: 2.5, y: 1 } })
    const idle = combatant({ id: 'e1', team: 'enemy', pos: { x: 2.5, y: 2 } })
    const far = combatant({ id: 'e2', team: 'enemy', pos: { x: 2.5, y: 9 }, channel: { skillId: 'lightning-bolt', targetId: 'p', roundsLeft: 1 } })
    const near = combatant({ id: 'e3', team: 'enemy', pos: { x: 2.5, y: 4 }, channel: { skillId: 'fire-bolt', targetId: 'p', roundsLeft: 1 } })
    const tactic = TACTIC_REGISTRY['interrupt'].targeting!
    expect(tactic(self, stateOf([self, idle, far, near]), 1)).toBe('e3')   // nearest caster
    expect(tactic(self, stateOf([self, idle]), 1)).toBeNull()              // nobody casting
  })

  it('Focus Casters locks the highest-INT spellcaster', () => {
    const self = combatant({ id: 'p' })
    const fighter = combatant({ id: 'e1', team: 'enemy', str: 12, int: 2 })
    const mage = combatant({ id: 'e2', team: 'enemy', str: 3, int: 9 })
    const archmage = combatant({ id: 'e3', team: 'enemy', str: 3, int: 14 })
    const tactic = TACTIC_REGISTRY['focus-casters'].targeting!
    expect(tactic(self, stateOf([self, fighter, mage, archmage]), 1)).toBe('e3')
    expect(tactic(self, stateOf([self, fighter]), 1)).toBeNull()   // no casters → fall through
  })

  it('Threatening Presence draws enemies to the taunter', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'A' }), eu({ id: 'B', tactics: [{ id: 'threatening-presence', rank: 1 }] })],
      enemyUnits: [eu({ id: 'E', team: 'enemy' })],
    })
    advanceRound(b)
    expect(find(b, 'E').lockedTargetId).toBe('B')
  })
})

describe('tactics: movement', () => {
  it('Charger advances faster than a plain unit', () => {
    const base = createBattle({ playerUnits: [eu({ id: 'p' })], enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    const chg = createBattle({ playerUnits: [eu({ id: 'p', tactics: [{ id: 'charger', rank: 1 }] })], enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    advanceRound(base); advanceRound(chg)
    expect(find(chg, 'p').pos.y).toBeGreaterThan(find(base, 'p').pos.y)
  })

  it('Charger first melee hit deals +30%', () => {
    const mk = (tactics: { id: string; rank: number }[]) => createBattle({
      playerUnits: [eu({ id: 'p', str: 20, tactics, meleeRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, hp: 100, maxHp: 100, meleeRange: 10 })],
    })
    const base = mk([]); const chg = mk([{ id: 'charger', rank: 1 }])
    advanceRound(base); advanceRound(chg)
    const hitBy = (b: typeof base) => b.events.find((e) => e.type === 'melee_attack' && e.sourceId === 'p')!.value!
    expect(hitBy(chg)).toBe(Math.floor(hitBy(base) * 1.3))
  })

  it('Retreater falls back and disengages once when badly hurt', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', hp: 8, maxHp: 100, tactics: [{ id: 'retreater', rank: 1 }], meleeRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', meleeRange: 10 })],
    })
    const before = find(b, 'p').pos.y
    advanceRound(b)
    const p = find(b, 'p')
    expect(p.pos.y).toBeLessThan(before)   // moved toward own (bottom) edge
    expect(p.lockedTargetId).toBeNull()
    expect(p.tacticsUsed).toContain('retreater')
  })
})

describe('tactics: action', () => {
  it('Shield Wall turtles when 3+ enemies are within radius 3', () => {
    const self = combatant({ id: 'p', pos: { x: 2.5, y: 5 } })
    const es = [0, 1, 2].map((i) => combatant({ id: 'e' + i, team: 'enemy', pos: { x: 2.5 + i * 0.5, y: 5.2 } }))
    const res = TACTIC_REGISTRY['shield-wall'].action!(self, stateOf([self, ...es]), 1)
    expect(res?.skipAttack).toBe(true)
    expect(res?.applyStatusToSelf?.flags).toContain('shielded')
    expect(TACTIC_REGISTRY['shield-wall'].action!(self, stateOf([self, es[0]]), 1)).toBeNull()
  })
})

describe('tactics: reaction', () => {
  it('Last Stand buffs STR/SPD when near death (once)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', hp: 5, maxHp: 100, str: 20, spd: 10, tactics: [{ id: 'last-stand', rank: 1 }], meleeRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 1, meleeRange: 10 })],
    })
    advanceRound(b)
    const p = find(b, 'p')
    expect(p.statuses.some((s) => s.id === 'last-stand')).toBe(true)
    expect(p.tacticsUsed).toContain('last-stand')
  })

  it('Counterattacker counters whoever hit it', () => {
    const e = combatant({ id: 'e', team: 'enemy' })
    const self = combatant({ id: 'p', tactics: [T('counterattacker')], lastHitById: 'e' })
    expect(TACTIC_REGISTRY['counterattacker'].reaction!(self, stateOf([self, e]), 1)).toEqual({ counterAttack: 'e' })
    const calm = combatant({ id: 'p2', tactics: [T('counterattacker')], lastHitById: null })
    expect(TACTIC_REGISTRY['counterattacker'].reaction!(calm, stateOf([calm, e]), 1)).toBeNull()
  })
})

describe('tactics: passive helpers', () => {
  it('reports rank-scaled parameters', () => {
    expect(chargerBonus(combatant({ tactics: [T('charger')] }))).toBeCloseTo(0.3)
    expect(armoredFactor(combatant({ tactics: [T('armored')] }))).toBeCloseTo(0.9)
    expect(nimblePeriod(combatant({ tactics: [T('nimble')] }))).toBe(7)
    expect(nimblePeriod(combatant({ tactics: [T('nimble', 5)] }))).toBe(5)
    expect(tauntBiasOf(combatant({ tactics: [T('threatening-presence')] }))).toBeCloseTo(1.5)
    expect(armoredFactor(combatant({}))).toBe(1)
  })

  it('Armored mitigates incoming damage vs an unarmored twin', () => {
    const mk = (tactics: { id: string; rank: number }[]) => createBattle({
      playerUnits: [eu({ id: 'p', tactics, maxHp: 300, hp: 300, meleeRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 40, meleeRange: 10 })],
    })
    const plain = mk([]); const arm = mk([{ id: 'armored', rank: 1 }])
    advanceRound(plain); advanceRound(arm)
    expect(300 - find(arm, 'p').hp).toBeLessThan(300 - find(plain, 'p').hp)
  })

  it('Nimble dodges every 7th incoming attack', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', tactics: [{ id: 'nimble', rank: 1 }], maxHp: 9999, hp: 9999, def: 9999, meleeRange: 10 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 5, def: 9999, maxHp: 9999, hp: 9999, meleeRange: 10 })],
    })
    for (let i = 0; i < 10; i++) advanceRound(b)
    expect(b.events.some((e) => e.type === 'dodge' && e.targetId === 'p')).toBe(true)
  })
})

describe('tactics: party injection (§5.5)', () => {
  it('injects party tactics at the bottom (lowest priority)', () => {
    const r = resolveTactics([{ id: 'tank-buster', rank: 1 }], [{ id: 'finish-them', rank: 1 }])
    expect(r.map((t) => t.def.id)).toEqual(['tank-buster', 'finish-them'])
  })

  it('Finish Them focuses a near-dead enemy for units without their own targeting', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p' })],
      enemyUnits: [eu({ id: 'e1', team: 'enemy', hp: 100, maxHp: 100 }), eu({ id: 'e2', team: 'enemy', hp: 10, maxHp: 100 })],
      playerPartyTactics: [{ id: 'finish-them', rank: 1 }],
    })
    advanceRound(b)
    expect(find(b, 'p').lockedTargetId).toBe('e2')
  })
})
