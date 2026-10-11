// Movement tactics driven through real rounds (not just their decision fn):
// prove the plan actually produces the intended outcome over a fight.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, buildEngineSkill, buildStatus,
  TACTIC_REGISTRY, kiteDistanceFor, type BattleState,
} from '@/engine'
import { eu, combatant, attackSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const dist = (a: { x: number; y: number }, c: { x: number; y: number }) => Math.hypot(a.x - c.x, a.y - c.y)

describe('Guardian: actually body-blocks for the squishy', () => {
  it('interposes so the enemy hits the guardian and the backliner is left untouched', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'g', def: 30, str: 8, maxHp: 600, hp: 600, meleeRange: 1.2, tactics: [{ id: 'guardian', rank: 1 }] }),
        // immobile, fragile backliner — it should never get touched
        eu({ id: 'squishy', def: 2, str: 2, rangedRange: 6, maxHp: 100, hp: 100, moveSpeed: 0 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', def: 0, str: 20, maxHp: 500, hp: 500, meleeRange: 1.2, moveSpeed: 0.9 })],
    })
    find(b, 'g').pos = { x: 2.5, y: 3.5 }
    find(b, 'squishy').pos = { x: 2.5, y: 2 }
    find(b, 'e').pos = { x: 2.5, y: 11 }
    for (let i = 0; i < 16; i++) advanceRound(b)

    const g = find(b, 'g'), sq = find(b, 'squishy'), e = find(b, 'e')
    expect(b.events.some((ev) => ev.type === 'melee_attack' && ev.targetId === 'g')).toBe(true)   // enemy fought the guard
    expect(b.events.some((ev) => ev.type === 'melee_attack' && ev.targetId === 'squishy')).toBe(false)
    expect(sq.hp).toBe(100)                       // backliner never got hit
    expect(g.hp).toBeLessThan(600)                // the guard took the blows instead
    expect(dist(g.pos, e.pos)).toBeLessThan(dist(sq.pos, e.pos))   // guard stayed between them
  })
})

describe('Ambusher: stalks the flank while cloaked, then backstabs', () => {
  // Same start, same target, both cloaked — one runs Ambusher, one runs nothing
  // (straight-in default movement). Ambusher should bend its approach toward the
  // target's exposed (ally-free) side, and both should land a stealth-powered
  // Back Stab because they stay hidden until they strike.
  const firstBackstab = (b: BattleState) =>
    b.events.find((e) => e.type === 'skill_use' && e.skillId === 'back-stab')?.value ?? 0

  function run(withAmbusher: boolean): BattleState {
    const bs = { ...buildEngineSkill('back-stab', 1)! }
    const b = createBattle({
      playerUnits: [eu({
        id: 'rogue', str: 20, spd: 12, moveSpeed: 1.2, maxHp: 200, hp: 200,
        meleeRange: 1.2, skills: [bs], tactics: withAmbusher ? [{ id: 'ambusher', rank: 1 }] : [],
      })],
      enemyUnits: [
        eu({ id: 'boss', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, moveSpeed: 0 }),
        eu({ id: 'guard', team: 'enemy', def: 0, str: 0, maxHp: 999, hp: 999, moveSpeed: 0 }),
      ],
    })
    const r = find(b, 'rogue')
    r.pos = { x: 2.5, y: 6 }
    r.statuses.push(buildStatus('stealthed', 'rogue')!)
    r.lockedTargetId = 'boss'
    find(b, 'boss').pos = { x: 2.5, y: 8.2 }
    find(b, 'guard').pos = { x: 0.5, y: 8.2 }   // boss's ally is to its LEFT → exposed flank is to the RIGHT
    for (let i = 0; i < 5; i++) advanceRound(b)
    return b
  }

  it('approaches from the exposed flank, lands the stealth strike, and is revealed', () => {
    const ambush = run(true)
    const plain = run(false)

    // Both stayed cloaked through the approach → their Back Stab carried the
    // stealth multiplier (≈ str * 2.5 * 1.25, far above the ~20 of an open hit).
    expect(firstBackstab(ambush)).toBeGreaterThan(40)
    expect(firstBackstab(plain)).toBeGreaterThan(40)
    expect(find(ambush, 'rogue').statuses.some((s) => s.id === 'stealthed')).toBe(false)   // revealed by striking

    // Ambusher bent toward the boss's open right side; the plain rogue drove
    // straight up the middle.
    expect(find(ambush, 'rogue').pos.x).toBeGreaterThan(find(plain, 'rogue').pos.x)
  })
})

describe('Swoop: dives into melee then peels back out (hit-and-run)', () => {
  it('lands a melee strike on the dive but never parks in melee', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'flyer', str: 12, spd: 16, moveSpeed: 1.3, maxHp: 200, hp: 200, meleeRange: 1.1, tactics: [{ id: 'swoop', rank: 1 }] })],
      // a fat, harmless, immobile dummy so the fight runs long enough to watch the cycle
      enemyUnits: [eu({ id: 'dummy', team: 'enemy', def: 0, str: 0, maxHp: 9999, hp: 9999, moveSpeed: 0 })],
    })
    find(b, 'flyer').pos = { x: 7.5, y: 5 }
    find(b, 'dummy').pos = { x: 7.5, y: 9 }   // start out of reach

    const dists: number[] = []
    for (let i = 0; i < 24; i++) {
      advanceRound(b)
      dists.push(dist(find(b, 'flyer').pos, find(b, 'dummy').pos))
    }

    // Dived in: reached melee at some point AND actually bit the dummy.
    expect(Math.min(...dists)).toBeLessThanOrEqual(1.2)
    expect(b.events.some((e) => e.type === 'melee_attack' && e.targetId === 'dummy')).toBe(true)
    // Hit-and-run: between dives it peeled back well out of melee (a plain melee
    // attacker would have parked at ~reach and this max would stay ~1.1).
    expect(Math.max(...dists)).toBeGreaterThan(2.5)
  })
})

describe('Wary Caster: a real interrupt makes it hold wider next time', () => {
  it('earns an interrupt in combat, then its kite hold widens past the calm distance', () => {
    const zap = attackSkill({ id: 'zap', channelTime: 3, range: 6, damageFormula: 'int * 1' })
    const b = createBattle({
      // Slow mage that can't simply outrun the threat → its channel really does
      // get broken (rather than kited away safely).
      playerUnits: [eu({ id: 'mage', int: 20, str: 3, spd: 10, rangedRange: 6, moveSpeed: 0.3, maxHp: 9999, hp: 9999, skills: [zap], tactics: [{ id: 'wary-caster', rank: 3 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', spd: 20, str: 30, def: 0, meleeRange: 1.2, moveSpeed: 1.0, maxHp: 9999, hp: 9999 })],
    })
    find(b, 'mage').pos = { x: 2.5, y: 5 }
    find(b, 'e').pos = { x: 2.5, y: 6.2 }
    for (let i = 0; i < 8; i++) advanceRound(b)

    const mage = find(b, 'mage')
    expect(b.events.some((ev) => ev.type === 'interrupt' && ev.targetId === 'mage')).toBe(true)
    expect(mage.interruptedCount).toBeGreaterThanOrEqual(1)

    // The earned interrupt count now widens the hold beyond a calm kite.
    const plan = TACTIC_REGISTRY['wary-caster'].movement!(mage, b, 3)
    expect(plan?.desiredRange).toBeGreaterThan(kiteDistanceFor(mage, find(b, 'e')))

    // An untouched (count 0) caster defers entirely — no widening.
    const calm = combatant({ id: 'calm', rangedRange: 6, interruptedCount: 0 })
    expect(TACTIC_REGISTRY['wary-caster'].movement!(calm, b, 3)).toBeNull()
  })
})
