import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, resolveTactics, TACTIC_REGISTRY,
  chargerBonus, armoredFactor, nimblePeriod,
  type BattleState, type Combatant, type ResolvedTactic,
} from '@/engine'
import { eu, combatant, attackSkill, healSkill } from './helpers'

const stateOf = (combatants: Combatant[]) => ({ combatants } as unknown as BattleState)
// Seed the team blackboard the way the planner would: focusTargetId = lowest-HP
// visible enemy. Targeting tactics that read the shared focus (Opportunist,
// Finish Them) need it populated when called outside a full advanceRound.
const withFocus = (combatants: Combatant[], team = 'player') => {
  const s = stateOf(combatants)
  let focus: Combatant | null = null
  for (const e of combatants) {
    if (!e.alive || e.team === team || e.statuses.some((x) => x.flags.includes('stealthed'))) continue
    if (!focus || e.hp < focus.hp || (e.hp === focus.hp && e.id < focus.id)) focus = e
  }
  ;(s as unknown as { plans: Record<string, unknown> }).plans = { [team]: { waypoint: null, focusTargetId: focus?.id ?? null, threat: {} } }
  return s
}
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const T = (id: string, rank = 1): ResolvedTactic => ({ def: TACTIC_REGISTRY[id], rank })

describe('tactics: targeting', () => {
  it('Tank Buster locks the highest-DEF enemy', () => {
    const self = combatant({ id: 'p' })
    const e1 = combatant({ id: 'e1', team: 'enemy', def: 4 })
    const e2 = combatant({ id: 'e2', team: 'enemy', def: 40 })
    expect(TACTIC_REGISTRY['tank-buster'].targeting!(self, stateOf([self, e1, e2]), 1)).toBe('e2')
  })

  it('Opportunist locks the team\'s wounded focus, else falls through', () => {
    const self = combatant({ id: 'p' })
    const full = combatant({ id: 'e1', team: 'enemy', hp: 100, maxHp: 100 })
    const hurt = combatant({ id: 'e2', team: 'enemy', hp: 20, maxHp: 100 })
    // focus = e2 (most wounded) and it's below the 40% bar → lock it
    expect(TACTIC_REGISTRY['opportunist'].targeting!(self, withFocus([self, full, hurt]), 1)).toBe('e2')
    // focus = e1 (only enemy) at full HP → above the bar → fall through
    expect(TACTIC_REGISTRY['opportunist'].targeting!(self, withFocus([self, full]), 1)).toBeNull()
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

  // (Threatening Presence's old distance-bias is gone — drawing aggro now runs
  // through the §threat model: see threat.test.ts.)
})

describe('tactics: movement', () => {
  it('Charger advances faster than a plain unit', () => {
    const base = createBattle({ playerUnits: [eu({ id: 'p' })], enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    const chg = createBattle({ playerUnits: [eu({ id: 'p', tactics: [{ id: 'charger', rank: 1 }] })], enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    advanceRound(base); advanceRound(chg)
    expect(find(chg, 'p').pos.y).toBeGreaterThan(find(base, 'p').pos.y)
  })

  it('Charger is a modifier — it no longer starves a movement tactic below it', () => {
    // Charger sits above Retreater. As a plan-producer it used to win the
    // movement channel every turn and the badly-hurt unit would never fall back.
    // As a modifier it has no plan, so Retreater fires.
    const b = createBattle({
      playerUnits: [eu({ id: 'p', hp: 8, maxHp: 100, tactics: [{ id: 'charger', rank: 1 }, { id: 'retreater', rank: 1 }], meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', meleeRange: 30 })],
    })
    const before = find(b, 'p').pos.y
    advanceRound(b)
    const p = find(b, 'p')
    expect(p.pos.y).toBeLessThan(before)        // retreated toward own edge
    expect(p.lockedTargetId).toBeNull()
    expect(p.tacticsUsed).toContain('retreater')
  })

  it('Charger first melee hit deals +30%', () => {
    const mk = (tactics: { id: string; rank: number }[]) => createBattle({
      playerUnits: [eu({ id: 'p', str: 20, tactics, meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, hp: 100, maxHp: 100, meleeRange: 30 })],
    })
    const base = mk([]); const chg = mk([{ id: 'charger', rank: 1 }])
    advanceRound(base); advanceRound(chg)
    const hitBy = (b: typeof base) => b.events.find((e) => e.type === 'melee_attack' && e.sourceId === 'p')!.value!
    expect(hitBy(chg)).toBe(Math.floor(hitBy(base) * 1.3))
  })

  it('Retreater falls back and disengages once when badly hurt', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', hp: 8, maxHp: 100, tactics: [{ id: 'retreater', rank: 1 }], meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', meleeRange: 30 })],
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
      playerUnits: [eu({ id: 'p', hp: 5, maxHp: 100, str: 20, spd: 10, tactics: [{ id: 'last-stand', rank: 1 }], meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 1, meleeRange: 30 })],
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
  it('reports skill-granted passive parameters (Armored/Nimble are now combatant fields)', () => {
    expect(chargerBonus(combatant({ tactics: [T('charger')] }))).toBeCloseTo(0.3)
    expect(armoredFactor(combatant({ armorReduction: 0.1 }))).toBeCloseTo(0.9)
    expect(armoredFactor(combatant({ armorReduction: 0.9 }))).toBeCloseTo(0.5)   // capped
    expect(nimblePeriod(combatant({ dodgePeriod: 7 }))).toBe(7)
    expect(nimblePeriod(combatant({ dodgePeriod: 5 }))).toBe(5)
    expect(armoredFactor(combatant({}))).toBe(1)
    expect(nimblePeriod(combatant({}))).toBeNull()
  })

  it('Armored (armorReduction) mitigates incoming damage vs an unarmored twin', () => {
    const mk = (armorReduction: number) => createBattle({
      playerUnits: [eu({ id: 'p', armorReduction, maxHp: 300, hp: 300, meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 40, meleeRange: 30 })],
    })
    const plain = mk(0); const arm = mk(0.1)
    advanceRound(plain); advanceRound(arm)
    expect(300 - find(arm, 'p').hp).toBeLessThan(300 - find(plain, 'p').hp)
  })

  it('Nimble (dodgePeriod) dodges every 7th incoming attack', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', dodgePeriod: 7, maxHp: 9999, hp: 9999, def: 9999, meleeRange: 30 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 5, def: 9999, maxHp: 9999, hp: 9999, meleeRange: 30 })],
    })
    for (let i = 0; i < 10; i++) advanceRound(b)
    expect(b.events.some((e) => e.type === 'dodge' && e.targetId === 'p')).toBe(true)
  })
})

describe('tactics: party injection (§5.5)', () => {
  it('injects party tactics at the bottom (lowest priority)', () => {
    // opportunist + finish-them are both triggers, so injection order is the
    // only thing under test (no floor demotion to muddy it).
    const r = resolveTactics([{ id: 'opportunist', rank: 1 }], [{ id: 'finish-them', rank: 1 }])
    expect(r.map((t) => t.def.id)).toEqual(['opportunist', 'finish-them'])
  })

  it('Opportunist reads the planner\'s shared focus in a live battle', () => {
    // No bare-state seeding here: advanceRound runs the planner, which sets the
    // blackboard focus to the most-wounded visible enemy; Opportunist reads it.
    const b = createBattle({
      playerUnits: [eu({ id: 'p', tactics: [{ id: 'opportunist', rank: 1 }] })],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', hp: 100, maxHp: 100 }),
        eu({ id: 'e2', team: 'enemy', hp: 15, maxHp: 100 }),
      ],
    })
    advanceRound(b)
    expect(b.plans.player!.focusTargetId).toBe('e2')
    expect(find(b, 'p').lockedTargetId).toBe('e2')
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

describe('tactics: floor demotion (§5.3)', () => {
  const ids = (r: ResolvedTactic[]) => r.map((t) => t.def.id)

  it('demotes a floor below a trigger in the same channel even when equipped first', () => {
    // tank-buster (floor) always locks something; opportunist (trigger) only
    // fires on a wounded foe. Equipped floor-first, the floor would starve the
    // trigger — resolveTactics flips them so the trigger gets first crack.
    const r = resolveTactics([{ id: 'tank-buster', rank: 1 }, { id: 'opportunist', rank: 1 }])
    expect(ids(r)).toEqual(['opportunist', 'tank-buster'])
  })

  it('keeps two triggers (and two floors) in their equipped order', () => {
    const triggers = resolveTactics([{ id: 'opportunist', rank: 1 }, { id: 'interrupt', rank: 1 }])
    expect(ids(triggers)).toEqual(['opportunist', 'interrupt'])
    const floors = resolveTactics([{ id: 'flanker', rank: 1 }, { id: 'guardian', rank: 1 }])
    expect(ids(floors)).toEqual(['flanker', 'guardian'])
  })

  it('demotes per channel without disturbing other channels', () => {
    // movement floor (flanker) + movement trigger (retreater) + a targeting
    // trigger (opportunist): only the movement pair reorders.
    const r = resolveTactics([
      { id: 'flanker', rank: 1 }, { id: 'opportunist', rank: 1 }, { id: 'retreater', rank: 1 },
    ])
    // opportunist holds its slot; flanker (floor) drops below retreater (trigger).
    expect(ids(r)).toEqual(['retreater', 'opportunist', 'flanker'])
  })

  it('lets a trigger fire before a floor that was equipped above it', () => {
    // p has tank-buster (floor) equipped above opportunist (trigger). e2 is
    // wounded, so opportunist should win the lock despite the floor's priority.
    const b = createBattle({
      playerUnits: [eu({ id: 'p', tactics: [{ id: 'tank-buster', rank: 1 }, { id: 'opportunist', rank: 1 }] })],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', def: 99, hp: 100, maxHp: 100 }),
        eu({ id: 'e2', team: 'enemy', def: 1, hp: 10, maxHp: 100 }),
      ],
    })
    advanceRound(b)
    expect(find(b, 'p').lockedTargetId).toBe('e2')   // opportunist, not tank-buster's e1
  })
})

describe('tactics: per-turn resolution (§debug)', () => {
  it('records what fired vs what was starved/dormant each turn', () => {
    // opportunist (trigger) above tank-buster (floor, demoted below it). With a
    // wounded foe present, opportunist fires and starves the floor below it.
    const b = createBattle({
      playerUnits: [eu({ id: 'p', tactics: [{ id: 'opportunist', rank: 1 }, { id: 'tank-buster', rank: 1 }] })],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', def: 99, hp: 100, maxHp: 100 }),
        eu({ id: 'e2', team: 'enemy', def: 1, hp: 10, maxHp: 100 }),
      ],
    })
    advanceRound(b)
    const res = find(b, 'p').lastResolution
    expect(res.find((r) => r.id === 'opportunist')?.outcome).toBe('fired')
    expect(res.find((r) => r.id === 'tank-buster')?.outcome).toBe('starved')
  })

  it('marks a trigger idle when its condition is not met (floor then fires)', () => {
    // No wounded foe → opportunist is dormant, so the demoted floor takes over.
    const b = createBattle({
      playerUnits: [eu({ id: 'p', tactics: [{ id: 'opportunist', rank: 1 }, { id: 'tank-buster', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e1', team: 'enemy', def: 5, hp: 100, maxHp: 100 })],
    })
    advanceRound(b)
    const res = find(b, 'p').lastResolution
    expect(res.find((r) => r.id === 'opportunist')?.outcome).toBe('idle')
    expect(res.find((r) => r.id === 'tank-buster')?.outcome).toBe('fired')
  })
})

describe('tactics: burst kit (item 8)', () => {
  const big = () => attackSkill({ id: 'big', name: 'Big', damageFormula: 'str * 4', cooldown: 5 })
  const small = () => attackSkill({ id: 'small', name: 'Small', damageFormula: 'str * 1', cooldown: 2 })

  it('Assassinate hunts the enemy healer first, else the top caster, else falls through', () => {
    const tac = TACTIC_REGISTRY['assassinate'].targeting!
    const self = combatant({ id: 'p' })
    const healer = combatant({ id: 'e1', team: 'enemy', int: 5, skills: [healSkill()] })
    const mage = combatant({ id: 'e2', team: 'enemy', int: 12, str: 2 })
    const bruiser = combatant({ id: 'e3', team: 'enemy', int: 1, str: 20 })
    expect(tac(self, stateOf([self, healer, mage, bruiser]), 1)).toBe('e1')      // healer wins
    expect(tac(self, stateOf([self, mage, bruiser]), 1)).toBe('e2')              // else top caster
    expect(tac(self, stateOf([self, bruiser]), 1)).toBeNull()                    // else fall through
  })

  it('Burst banks a ready small skill while the heavy hitter is imminent', () => {
    const self = combatant({ id: 'p', skills: [big(), small()], skillCooldowns: { big: 2, small: 0 } })
    // big imminent (cd 2 ≤ window 2 at rank 1) and small ready → hold the small one
    expect(TACTIC_REGISTRY['burst'].action!(self, stateOf([self]), 1)).toEqual({ skipAttack: true })
  })

  it('Burst does not bank when the heavy hitter is ready or far off', () => {
    const ready = combatant({ id: 'p', skills: [big(), small()], skillCooldowns: { big: 0, small: 0 } })
    expect(TACTIC_REGISTRY['burst'].action!(ready, stateOf([ready]), 1)).toBeNull()     // big ready → fire it
    const farOff = combatant({ id: 'p', skills: [big(), small()], skillCooldowns: { big: 4, small: 0 } })
    expect(TACTIC_REGISTRY['burst'].action!(farOff, stateOf([farOff]), 1)).toBeNull()   // cd 4 > window → just cast / chain
  })

  it('Burst does not bank when no small skill is ready (keeps tempo)', () => {
    const self = combatant({ id: 'p', skills: [big(), small()], skillCooldowns: { big: 2, small: 1 } })
    expect(TACTIC_REGISTRY['burst'].action!(self, stateOf([self]), 1)).toBeNull()       // nothing to bank → attack normally
  })

  it('Burst is inert for a one-skill unit', () => {
    const self = combatant({ id: 'p', skills: [big()], skillCooldowns: { big: 2 } })
    expect(TACTIC_REGISTRY['burst'].action!(self, stateOf([self]), 1)).toBeNull()
  })

  it('Burst does not bank when the heavy hitter recharges too fast to ever chain', () => {
    // cooldown 3 ≤ window(2)+1 → no round exists where it is on cooldown but
    // outside the bank window, so banking would just starve the filler forever.
    const fast = () => attackSkill({ id: 'big', name: 'Big', damageFormula: 'str * 4', cooldown: 3 })
    const self = combatant({ id: 'p', skills: [fast(), small()], skillCooldowns: { big: 2, small: 0 } })
    expect(TACTIC_REGISTRY['burst'].action!(self, stateOf([self]), 1)).toBeNull()
  })

  it('Focus Fire locks the shared blackboard focus for the whole team', () => {
    const self = combatant({ id: 'p' })
    const full = combatant({ id: 'e1', team: 'enemy', hp: 100, maxHp: 100 })
    const hurt = combatant({ id: 'e2', team: 'enemy', hp: 30, maxHp: 100 })
    expect(TACTIC_REGISTRY['focus-fire'].targeting!(self, withFocus([self, full, hurt]), 1)).toBe('e2')
    expect(TACTIC_REGISTRY['focus-fire'].scope).toBe('party')
  })
})
