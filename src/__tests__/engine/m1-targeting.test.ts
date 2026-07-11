// Smart-party targeting baseline (tactical-coordination.md M1). The planner
// publishes Engagement.primaryId (dangerous-first, killability-weighted kill
// order, with commitment hysteresis) and avoidTargetIds (do-not-aggro
// bystanders); selectTarget reads both. See teamplan.ts's decideEngagement
// and behavior.ts's selectTarget for the implementation this exercises.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, defaultPlanner, serializeBattle, deserializeBattle,
  type BattleState, type Planner,
} from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// The pre-M1 baseline: defaultPlanner's engagement/avoidTargetIds stripped
// back off, so selectTarget/teamFocus see exactly the M0 shape. Used as the
// "no coordination" control for the convergence comparison.
const noEngagementPlanner: Planner = (state, team) => {
  const { engagement, avoidTargetIds, ...rest } = defaultPlanner(state, team)
  return rest
}

describe('M1 — smart-party targeting baseline', () => {
  it('publishes no engagement when nothing is visible (legacy-absent shape preserved)', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', visionRange: 5 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 100, rows: 100,
    })
    find(b, 'p').pos = { x: 10, y: 10 }
    find(b, 'e').pos = { x: 90, y: 90 }   // far outside vision
    advanceRound(b)
    const plan = b.plans.player!
    expect('engagement' in plan).toBe(false)
    expect('avoidTargetIds' in plan).toBe(false)
  })

  it('dangerous-first: a low-HP high-threat caster becomes primary and dies before the trash', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p1', str: 20 }), eu({ id: 'p2', str: 20 }), eu({ id: 'p3', str: 20 })],
      enemyUnits: [
        eu({ id: 'caster', team: 'enemy', str: 5, int: 40, def: 0, hp: 30, maxHp: 30 }),
        eu({ id: 'trash1', team: 'enemy', str: 5, int: 0, def: 0, hp: 500, maxHp: 500 }),
        eu({ id: 'trash2', team: 'enemy', str: 5, int: 0, def: 0, hp: 500, maxHp: 500 }),
      ],
      mode: 'encounter', cols: 30, rows: 30,
    })
    find(b, 'p1').pos = { x: 9, y: 10 }
    find(b, 'p2').pos = { x: 9, y: 11 }
    find(b, 'p3').pos = { x: 9, y: 9 }
    find(b, 'caster').pos = { x: 11, y: 10 }
    find(b, 'trash1').pos = { x: 11, y: 9 }
    find(b, 'trash2').pos = { x: 11, y: 11 }

    advanceRound(b)
    expect(b.plans.player!.engagement!.primaryId).toBe('caster')

    for (let r = 0; r < 40 && find(b, 'caster').alive; r++) advanceRound(b)
    expect(find(b, 'caster').alive).toBe(false)
    expect(find(b, 'trash1').alive).toBe(true)
    expect(find(b, 'trash2').alive).toBe(true)
  })

  it('killability weighting: a monstrous-HP high-threat foe does not out-rank a killable dangerous one', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'p1', str: 15 }), eu({ id: 'p2', str: 15 }), eu({ id: 'p3', str: 15 }), eu({ id: 'p4', str: 15 }),
      ],
      enemyUnits: [
        eu({ id: 'juggernaut', team: 'enemy', str: 50, int: 0, hp: 3000, maxHp: 3000 }),
        eu({ id: 'squishy', team: 'enemy', str: 20, int: 0, hp: 100, maxHp: 100 }),
      ],
      mode: 'encounter', cols: 30, rows: 30,
    })
    find(b, 'p1').pos = { x: 9, y: 9 }
    find(b, 'p2').pos = { x: 9, y: 11 }
    find(b, 'p3').pos = { x: 9, y: 13 }
    find(b, 'p4').pos = { x: 9, y: 15 }
    find(b, 'juggernaut').pos = { x: 12, y: 12 }
    find(b, 'squishy').pos = { x: 12, y: 12.5 }   // same neighborhood — proximity isn't the deciding factor

    advanceRound(b)
    // juggernaut: threat 50 / ttk(3000/partySustained) → low score despite huge raw danger.
    // squishy: threat 20 / ttk(100/partySustained) → wins on killability.
    expect(b.plans.player!.engagement!.primaryId).toBe('squishy')
  })

  it('convergence: idle units lock the shared kill-order primary within a few rounds', () => {
    const b = createBattle({
      // Enemies act AFTER heroes each round (much lower spd) so round 1's lock
      // decision reflects the plan, not a reflexive "who hit me first" threat
      // blip from turn-order interleaving.
      playerUnits: [
        eu({ id: 'p1', str: 15 }), eu({ id: 'p2', str: 15 }), eu({ id: 'p3', str: 15 }), eu({ id: 'p4', str: 15 }),
      ],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 20, int: 0, def: 0, hp: 20, maxHp: 20, spd: 1 }),   // dangerous + squishy
        eu({ id: 'e2', team: 'enemy', str: 2, int: 0, def: 0, hp: 300, maxHp: 300, spd: 1 }),
        eu({ id: 'e3', team: 'enemy', str: 2, int: 0, def: 0, hp: 300, maxHp: 300, spd: 1 }),
        eu({ id: 'e4', team: 'enemy', str: 2, int: 0, def: 0, hp: 300, maxHp: 300, spd: 1 }),
      ],
      mode: 'encounter', cols: 30, rows: 30,
    })
    find(b, 'e1').pos = { x: 12, y: 12 }
    find(b, 'e2').pos = { x: 9, y: 12 }
    find(b, 'e3').pos = { x: 15, y: 12 }
    find(b, 'e4').pos = { x: 12, y: 9 }
    // Each idle unit starts NEAREST a different trash mob, not the primary —
    // convergence has to actually pull them off their nearest neighbor.
    find(b, 'p1').pos = { x: 9, y: 13 }    // nearest e2
    find(b, 'p2').pos = { x: 15, y: 13 }   // nearest e3
    find(b, 'p3').pos = { x: 13, y: 9 }    // nearest e4
    find(b, 'p4').pos = { x: 12, y: 13 }   // nearest e1 already

    advanceRound(b)
    expect(b.plans.player!.engagement!.primaryId).toBe('e1')
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(find(b, id).lockedTargetId).toBe('e1')
  })

  it('convergence beats a planner stub that omits engagement: the primary dies faster', () => {
    const setup = () => ({
      playerUnits: [
        eu({ id: 'p1', str: 15, meleeRange: 4 }), eu({ id: 'p2', str: 15, meleeRange: 4 }),
        eu({ id: 'p3', str: 15, meleeRange: 4 }), eu({ id: 'p4', str: 15, meleeRange: 4 }),
      ],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 20, int: 0, def: 0, hp: 60, maxHp: 60, meleeRange: 4, spd: 1 }),
        eu({ id: 'e2', team: 'enemy', str: 2, int: 0, def: 0, hp: 400, maxHp: 400, meleeRange: 4, spd: 1 }),
        eu({ id: 'e3', team: 'enemy', str: 2, int: 0, def: 0, hp: 400, maxHp: 400, meleeRange: 4, spd: 1 }),
        eu({ id: 'e4', team: 'enemy', str: 2, int: 0, def: 0, hp: 400, maxHp: 400, meleeRange: 4, spd: 1 }),
      ],
      mode: 'encounter' as const, cols: 30, rows: 30,
    })
    const place = (b: BattleState) => {
      find(b, 'e1').pos = { x: 12, y: 12 }
      find(b, 'e2').pos = { x: 9, y: 12 }
      find(b, 'e3').pos = { x: 15, y: 12 }
      find(b, 'e4').pos = { x: 12, y: 9 }
      find(b, 'p1').pos = { x: 9, y: 13 }
      find(b, 'p2').pos = { x: 15, y: 13 }
      find(b, 'p3').pos = { x: 13, y: 9 }
      find(b, 'p4').pos = { x: 12, y: 13 }
    }
    const roundsToKillE1 = (planner?: Planner): number => {
      const b = createBattle({ ...setup(), planner })
      place(b)
      let r = 0
      while (find(b, 'e1').alive && r < 60) { advanceRound(b); r++ }
      return r
    }
    const withEngagement = roundsToKillE1()
    const baseline = roundsToKillE1(noEngagementPlanner)
    expect(withEngagement).toBeLessThan(baseline)
  })

  it('tank keeps aggro: accrued threat + hysteresis holds even though the primary bonus favors the squishier hero', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'tank', str: 10, threatMult: 6, hp: 150, maxHp: 150, meleeRange: 2 }),
        eu({ id: 'dps', str: 20, hp: 40, maxHp: 40, meleeRange: 2 }),
      ],
      enemyUnits: [eu({ id: 'mob', team: 'enemy', str: 8, def: 0, hp: 400, maxHp: 400, meleeRange: 2, moveSpeed: 0 })],
      mode: 'encounter', cols: 30, rows: 30,
    })
    find(b, 'tank').pos = { x: 10, y: 9 }
    find(b, 'dps').pos = { x: 10, y: 12 }
    find(b, 'mob').pos = { x: 10, y: 10 }
    // Pre-existing accrued threat — the tank has already been holding this
    // fight, mirroring a mid-battle state rather than the opening round.
    find(b, 'mob').lockedTargetId = 'tank'
    find(b, 'mob').threat = { tank: 200 }

    for (let r = 0; r < 6; r++) {
      advanceRound(b)
      // The monster team's kill-order primary favors the squishier, higher
      // str/hp-ratio dps (threat 20 / hp 40 = 0.5 vs threat 10 / hp 150 ≈ 0.067)...
      expect(b.plans.enemy!.engagement!.primaryId).toBe('dps')
      // ...but the mob's actual lock never left the tank.
      expect(find(b, 'mob').lockedTargetId).toBe('tank')
    }
  })

  it('avoid: an out-of-camp bystander is never acquired while in-camp foes live; attacking flips it targetable', () => {
    const b = createBattle({
      // Tanky enough that everyone survives the whole 10-round window — "live
      // in-camp foes" needs to stay true (and the members doing the avoiding
      // need to stay alive) for the length of the check.
      playerUnits: [
        eu({ id: 'p1', str: 15, hp: 300, maxHp: 300, def: 8 }),
        eu({ id: 'p2', str: 15, hp: 300, maxHp: 300, def: 8 }),
      ],
      enemyUnits: [
        eu({ id: 'm1', team: 'enemy', str: 10, hp: 5000, maxHp: 5000 }),
        eu({ id: 'm2', team: 'enemy', str: 10, hp: 5000, maxHp: 5000 }),
        // Tankier still, so its kill-order score loses cleanly — otherwise an
        // id-lexicographic tiebreak ('bystander' < 'm1') could make IT the
        // primary and invert the test. 'skittish' keeps it non-provoked (no
        // autonomous lock) until something actually hits it — an aggressive
        // monster locks its nearest hero from turn 1 regardless of range,
        // which would trip alreadyFighting()'s lock check immediately.
        eu({ id: 'bystander', team: 'enemy', str: 5, hp: 50000, maxHp: 50000, tactics: [{ id: 'skittish', rank: 1 }] }),
      ],
      mode: 'encounter', cols: 30, rows: 30,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'm1').pos = { x: 12, y: 10 }
    find(b, 'm2').pos = { x: 12, y: 11 }
    find(b, 'bystander').pos = { x: 29, y: 29 }   // far outside the camp radius

    for (let r = 0; r < 10; r++) {
      advanceRound(b)
      expect(b.plans.player!.avoidTargetIds).toContain('bystander')
      expect(find(b, 'p1').lockedTargetId).not.toBe('bystander')
      expect(find(b, 'p2').lockedTargetId).not.toBe('bystander')
    }

    // The bystander "enters the fight on its own" — simulate it having dealt
    // damage to a member (the same signal applyDamageRaw would have set).
    find(b, 'p1').threat['bystander'] = 5
    advanceRound(b)
    expect(b.plans.player!.avoidTargetIds).not.toContain('bystander')
  })

  it('hysteresis: primary does not flip-flop between two near-equal enemies', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p1', str: 15 }), eu({ id: 'p2', str: 15 })],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 20, int: 0, hp: 100, maxHp: 100 }),
        eu({ id: 'e2', team: 'enemy', str: 20, int: 0, hp: 100, maxHp: 100 }),
      ],
      mode: 'encounter', cols: 30, rows: 30,
    })
    find(b, 'e1').pos = { x: 10, y: 10 }
    find(b, 'e2').pos = { x: 10, y: 10 }
    find(b, 'p1').pos = { x: 8, y: 10 }
    find(b, 'p2').pos = { x: 8, y: 10 }

    let switches = 0
    let lastPrimary: string | null = null
    for (let r = 1; r <= 10; r++) {
      b.round = r
      // ±5% HP swing on e2 — well inside PRIMARY_SWITCH_MARGIN (25%), so a
      // committed primary should never be dislodged by this noise.
      find(b, 'e2').hp = r % 2 === 0 ? 105 : 95
      b.plans.player = defaultPlanner(b, 'player')
      const primary = b.plans.player.engagement!.primaryId
      if (lastPrimary && primary !== lastPrimary) switches++
      lastPrimary = primary
    }
    expect(switches).toBeLessThanOrEqual(1)
  })

  it('serialize→replay 1:1 with engagement/avoidTargetIds populated', () => {
    const b = createBattle({
      // Tanky enough that the fight is still ongoing (not a wipe) at the
      // round-8 checkpoint, so there's something meaningful to replay.
      playerUnits: [
        eu({ id: 'p1', str: 15, hp: 100, maxHp: 100, def: 8 }),
        eu({ id: 'p2', str: 12, hp: 100, maxHp: 100, def: 8 }),
      ],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 8, def: 0, hp: 80, maxHp: 80 }),
        eu({ id: 'e2', team: 'enemy', str: 5, def: 0, hp: 200, maxHp: 200 }),
      ],
      mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'e1').pos = { x: 12, y: 10 }
    find(b, 'e2').pos = { x: 12, y: 12 }
    for (let r = 0; r < 8; r++) advanceRound(b)
    expect(b.plans.player!.engagement).toBeTruthy()   // sanity: actually populated before testing replay

    const token = serializeBattle(b)
    const reloaded = deserializeBattle(token)
    expect(reloaded.plans.player!.engagement).toEqual(b.plans.player!.engagement)
    expect(reloaded.plans.player!.avoidTargetIds).toEqual(b.plans.player!.avoidTargetIds)

    for (let r = 0; r < 15; r++) { advanceRound(b); advanceRound(reloaded) }
    expect(reloaded.round).toBe(b.round)
    for (const c of b.combatants) {
      const rc = reloaded.combatants.find((x) => x.id === c.id)!
      expect(rc.pos).toEqual(c.pos)
      expect(rc.hp).toBe(c.hp)
      expect(rc.alive).toBe(c.alive)
      expect(rc.lockedTargetId).toBe(c.lockedTargetId)
    }
    expect(reloaded.plans.player).toEqual(b.plans.player)
    expect(reloaded.plans.enemy).toEqual(b.plans.enemy)
  })
})
