// Anchor, stance, formation (tactical-coordination.md M3). `decide` picks
// stance + anchor at commit (kite/hold/collapse, gated on ACUMEN.stance);
// `hold`/`kite` execution (formation slots, the kiter-style default);
// standing guard on the fragility outlier (NO acumen gate); `cohesionW` in
// scoreCandidate; the `corridor` field for shared waypoint routing. See
// teamplan.ts's decideStanceAnchor/fragilityOutlier, engine.ts's
// formationSlot/executeMovement's stance+guard branches, and plan.ts's
// scoreCandidate for the implementation this exercises.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, decideEngagement, defaultPlanner, scoreCandidate,
  serializeBattle, deserializeBattle,
  type BattleState, type Combatant, type Planner,
} from '@/engine'
import { eu, attackSkill, combatant } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const placeFatCamp = (b: BattleState, cx: number, cy: number) => {
  const offsets = [[-1.2, -1.2], [-1.2, 0], [-1.2, 1.2], [0, -1.2], [0, 1.2], [1.2, -1.2], [1.2, 0], [1.2, 1.2]]
  offsets.forEach((o, i) => { find(b, `g${i}`).pos = { x: cx + o[0], y: cy + o[1] } })
}

describe('M3 — hold the line', () => {
  it('units without movement tactics form on the anchor: tough forward, fragile behind', () => {
    // A short free-standing wall (open ground on both sides — a real
    // chokepoint gap, not a long bar the fan itself would clip) between the
    // party and an approaching camp it can afford to fight.
    const wall = { x: 10, y: 10, w: 3, h: 0.6, kind: 'wall' as const }
    const playerUnits = [
      // int carries the party over ACUMEN.stance(90) on its own.
      eu({ id: 'p0', str: 15, int: 100, hp: 60, maxHp: 60, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 'p1', str: 15, hp: 80, maxHp: 80, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 'p2', str: 15, hp: 100, maxHp: 100, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 'p3', str: 15, hp: 120, maxHp: 120, moveSpeed: 0.9, meleeRange: 1.2 }),
    ]
    const enemyUnits = [0, 1, 2].map((i) => eu({
      id: `e${i}`, team: 'enemy', str: 10, hp: 80, maxHp: 80, moveSpeed: 0, meleeRange: 1.2, visionRange: 20,
    }))
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 30, rows: 30, barriers: [wall] })
    find(b, 'p0').pos = { x: 10.5, y: 16 }
    find(b, 'p1').pos = { x: 11.5, y: 16 }
    find(b, 'p2').pos = { x: 10.5, y: 17 }
    find(b, 'p3').pos = { x: 11.5, y: 17 }
    find(b, 'e0').pos = { x: 11.5, y: 3 }
    find(b, 'e1').pos = { x: 12.5, y: 3 }
    find(b, 'e2').pos = { x: 10.5, y: 3 }

    for (let r = 0; r < 40; r++) advanceRound(b)
    const eng = b.plans.player!.engagement!
    expect(eng.stance).toBe('hold')
    expect(eng.anchor).not.toBeNull()
    // No member equipped a movement tactic — every position below came purely
    // from the stance-hold execution default.
    for (const id of ['p0', 'p1', 'p2', 'p3']) {
      expect(find(b, id).tactics.some((t) => t.def.channel === 'movement')).toBe(false)
    }

    const anchor = eng.anchor!
    const primary = find(b, eng.primaryId!)
    const ax = primary.pos.x - anchor.x, ay = primary.pos.y - anchor.y
    const d = Math.hypot(ax, ay)
    const ux = ax / d, uy = ay / d
    const projected = ['p0', 'p1', 'p2', 'p3'].map((id) => {
      const c = find(b, id)
      const proj = (c.pos.x - anchor.x) * ux + (c.pos.y - anchor.y) * uy
      return { id, hp: c.maxHp, proj, dist: Math.hypot(c.pos.x - anchor.x, c.pos.y - anchor.y) }
    })
    // Everyone clusters near the anchor (a small formation fan, not scattered).
    for (const p of projected) expect(p.dist).toBeLessThan(3)
    // Toughest members (p3=120, p2=100) project FORWARD (toward the camp);
    // the rest (p1=80, p0=60) project BEHIND them.
    const front = projected.filter((p) => p.hp >= 100).map((p) => p.proj)
    const back = projected.filter((p) => p.hp < 100).map((p) => p.proj)
    expect(Math.min(...front)).toBeGreaterThan(Math.max(...back))
  })
})

describe('M3 — stance flips by comp', () => {
  const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1.5', cooldown: 1 })
  const rangedParty = (withScholar: boolean) => [
    eu({ id: 'p0', str: 5, int: withScholar ? 100 : 20, hp: 60, maxHp: 60, moveSpeed: 1.4, rangedRange: 6, skills: [{ ...bolt, id: 'bolt0' }] }),
    eu({ id: 'p1', str: 5, int: withScholar ? 0 : 20, hp: 60, maxHp: 60, moveSpeed: 1.4, rangedRange: 6, skills: [{ ...bolt, id: 'bolt1' }] }),
    eu({ id: 'p2', str: 5, int: withScholar ? 0 : 20, hp: 60, maxHp: 60, moveSpeed: 1.4, rangedRange: 6, skills: [{ ...bolt, id: 'bolt2' }] }),
  ]
  const meleeCamp = () => [0, 1, 2].map((i) => eu({
    id: `e${i}`, team: 'enemy', str: 10, hp: 80, maxHp: 80, moveSpeed: 0.3, meleeRange: 1.2, rangedRange: 0, visionRange: 20,
  }))
  const setup = (playerUnits: ReturnType<typeof rangedParty>) => {
    const b = createBattle({ playerUnits, enemyUnits: meleeCamp(), mode: 'encounter', cols: 40, rows: 40 })
    find(b, 'p0').pos = { x: 10, y: 20 }; find(b, 'p1').pos = { x: 11, y: 20 }; find(b, 'p2').pos = { x: 9, y: 20 }
    find(b, 'e0').pos = { x: 10, y: 10 }; find(b, 'e1').pos = { x: 11, y: 10 }; find(b, 'e2').pos = { x: 9, y: 10 }
    advanceRound(b)
    return b
  }

  it('an all-ranged, fast, scholar-led party commits kite — casters hold range without equipping Kiter', () => {
    const b = setup(rangedParty(true))
    expect(b.plans.player!.engagement!.stance).toBe('kite')
    for (const id of ['p0', 'p1', 'p2']) {
      expect(find(b, id).tactics.some((t) => t.def.id === 'kiter')).toBe(false)
    }
    // Let the default kite execution run a while — the party should hold off
    // rather than close to melee (never lets the ring collapse to ~0).
    for (let r = 0; r < 30; r++) advanceRound(b)
    for (const id of ['p0', 'p1', 'p2']) {
      const c = find(b, id)
      const nearestE = ['e0', 'e1', 'e2'].map((eid) => find(b, eid)).filter((e) => e.alive)
      if (!nearestE.length) continue
      const dmin = Math.min(...nearestE.map((e) => Math.hypot(c.pos.x - e.pos.x, c.pos.y - e.pos.y)))
      expect(dmin).toBeGreaterThan(2)
    }
  })

  it('the SAME camp gated below ACUMEN.stance still collapses even for the ranged party', () => {
    const b = setup(rangedParty(false))
    expect(b.plans.player!.engagement!.stance).toBe('collapse')
  })

  it('an all-melee party (affordable camp) commits collapse', () => {
    const meleeParty = [
      eu({ id: 'p0', str: 15, int: 100, hp: 100, maxHp: 100, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 'p1', str: 15, hp: 100, maxHp: 100, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 'p2', str: 15, hp: 100, maxHp: 100, moveSpeed: 0.9, meleeRange: 1.2 }),
    ]
    const weakCamp = [0, 1, 2].map((i) => eu({
      id: `e${i}`, team: 'enemy', str: 5, hp: 40, maxHp: 40, moveSpeed: 0.3, meleeRange: 1.2, visionRange: 20,
    }))
    const b = createBattle({ playerUnits: meleeParty, enemyUnits: weakCamp, mode: 'encounter', cols: 40, rows: 40 })
    find(b, 'p0').pos = { x: 10, y: 20 }; find(b, 'p1').pos = { x: 11, y: 20 }; find(b, 'p2').pos = { x: 9, y: 20 }
    find(b, 'e0').pos = { x: 10, y: 10 }; find(b, 'e1').pos = { x: 11, y: 10 }; find(b, 'e2').pos = { x: 9, y: 10 }
    advanceRound(b)
    expect(b.plans.player!.engagement!.stance).toBe('collapse')
  })
})

describe('M3 — squishy protected (standing guard, no acumen gate)', () => {
  const stripAssignments: Planner = (state, team) => {
    const { assignments, ...rest } = defaultPlanner(state, team)
    return rest
  }
  const setup = (planner?: Planner) => {
    const bolt = attackSkill({ id: 'bolt', range: 5, damageFormula: 'int * 1', cooldown: 1 })
    const playerUnits = [
      eu({ id: 'caster', str: 2, int: 20, def: 0, hp: 30, maxHp: 30, moveSpeed: 0.9, rangedRange: 5, skills: [bolt] }),
      eu({ id: 't1', str: 15, def: 10, hp: 200, maxHp: 200, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 't2', str: 15, def: 10, hp: 200, maxHp: 200, moveSpeed: 0.9, meleeRange: 1.2 }),
      eu({ id: 't3', str: 15, def: 10, hp: 200, maxHp: 200, moveSpeed: 0.9, meleeRange: 1.2 }),
    ]
    const enemyUnits = [0, 1, 2].map((i) => eu({
      id: `e${i}`, team: 'enemy', str: 8, hp: 120, maxHp: 120, moveSpeed: 0.9, meleeRange: 1.2, visionRange: 20,
    }))
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, planner })
    find(b, 'caster').pos = { x: 10, y: 20 }
    find(b, 't1').pos = { x: 9, y: 18 }; find(b, 't2').pos = { x: 10, y: 18 }; find(b, 't3').pos = { x: 11, y: 18 }
    find(b, 'e0').pos = { x: 10, y: 10 }; find(b, 'e1').pos = { x: 11, y: 10 }; find(b, 'e2').pos = { x: 9, y: 10 }
    return b
  }
  const hitsOnCaster = (b: BattleState, rounds: number): number => {
    let hits = 0
    for (let r = 0; r < rounds; r++) {
      advanceRound(b)
      hits += b.events.filter((e) => e.round === b.round && e.targetId === 'caster'
        && (e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use')).length
    }
    return hits
  }

  it('a guard assignment targets the fragile caster, and materially reduces hits taken vs a stripped-assignment stub', () => {
    const b = setup()
    advanceRound(b)
    expect(b.plans.player!.assignments).toMatchObject({ t1: { role: 'guard', allyId: 'caster' } })

    const withGuard = hitsOnCaster(b, 30)
    const b2 = setup(stripAssignments)
    const withoutGuard = hitsOnCaster(b2, 31)   // one extra round to offset the sanity advanceRound above
    expect(withGuard).toBeLessThan(withoutGuard)
  })
})

describe('M3 — cohesionW term in scoreCandidate', () => {
  const stateOf = (combatants: Combatant[], anchor: { x: number; y: number }) => ({
    combatants, barriers: [],
    plans: { player: { waypoint: null, focusTargetId: null, threat: {}, engagement: { targetIds: [], primaryId: null, anchor, stance: 'hold', sinceRound: 0 } } },
  } as unknown as BattleState)

  it('a unit drifts toward the anchor between two same-forecast candidates; wary sticks harder than bold', () => {
    const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })
    const anchor = { x: 5, y: 0 }
    const aim = combatant({ id: 'e', team: 'enemy', pos: { x: 0, y: 0 }, moveSpeed: 0 })
    // Both candidates sit exactly on the same firing ring (distance 5 from
    // `aim`) — identical forecast score and identical GAP term — differing
    // ONLY in distance from the anchor (0 vs 10).
    const near = { pos: { x: 5, y: 0 }, kind: 'close' as const }
    const far = { pos: { x: -5, y: 0 }, kind: 'close' as const }
    const scoreAs = (posture: Combatant['posture'], cand: typeof near) => {
      const me = combatant({ id: 'm', int: 20, str: 2, pos: { x: 0, y: 5 }, skills: [{ ...bolt }], lockedTargetId: 'e', posture })
      return scoreCandidate(stateOf([me, aim], anchor), me, cand, aim, 5)
    }
    const boldMargin = scoreAs('bold', near) - scoreAs('bold', far)
    const waryMargin = scoreAs('wary', near) - scoreAs('wary', far)
    expect(boldMargin).toBeGreaterThan(0)   // both postures prefer the anchor-adjacent spot...
    expect(waryMargin).toBeGreaterThan(boldMargin)   // ...but wary (higher cohesionW) drifts harder
  })

  it('no engagement/anchor ⇒ the term is exactly 0 (byte-identical to pre-M3 scoring)', () => {
    const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })
    const aim = combatant({ id: 'e', team: 'enemy', pos: { x: 0, y: 0 }, moveSpeed: 0 })
    const me = combatant({ id: 'm', int: 20, str: 2, pos: { x: 0, y: 5 }, skills: [{ ...bolt }], lockedTargetId: 'e', posture: 'wary' })
    const cand = { pos: { x: 5, y: 0 }, kind: 'close' as const }
    const noPlanState = { combatants: [me, aim], barriers: [] } as unknown as BattleState
    const emptyPlanState = { combatants: [me, aim], barriers: [], plans: {} } as unknown as BattleState
    expect(scoreCandidate(noPlanState, me, cand, aim, 5)).toBe(scoreCandidate(emptyPlanState, me, cand, aim, 5))
  })
})

describe('M3 — corridor (shared route corner, HERD_BIAS residual)', () => {
  it('far members route through the published corridor toward the scout+prey, never the far side', () => {
    const wall = { x: 30, y: 9, w: 3, h: 0.6, kind: 'wall' as const }
    const b = createBattle({
      playerUnits: [
        eu({ id: 'a', visionRange: 10, moveSpeed: 0.9 }),
        eu({ id: 'f1', visionRange: 3, moveSpeed: 0.9 }),
        eu({ id: 'f2', visionRange: 3, moveSpeed: 0.9 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 99999, hp: 99999, moveSpeed: 0, visionRange: 1 })],
      mode: 'open', cols: 60, rows: 60, barriers: [wall],
    })
    find(b, 'a').pos = { x: 30, y: 3 }
    find(b, 'e').pos = { x: 32, y: 3 }
    find(b, 'f1').pos = { x: 29, y: 20 }
    find(b, 'f2').pos = { x: 31, y: 20 }

    let sawCorridor = false
    let corridorAtPop: { x: number; y: number } | null = null
    for (let r = 0; r < 20; r++) {
      advanceRound(b)
      const cor = b.plans.player!.corridor
      if (cor) { sawCorridor = true; corridorAtPop = cor }
      // While a member is at the wall's latitude, it must be on the SAME side
      // as the published corridor (east of the wall, x > wall.x + wall.w) —
      // never routes the far (west) side.
      if (cor) {
        for (const id of ['f1', 'f2']) {
          const c = find(b, id)
          if (c.pos.y > wall.y - 2 && c.pos.y < wall.y + wall.h + 6) {
            expect(c.pos.x).toBeGreaterThan(wall.x)
          }
        }
      }
    }
    expect(sawCorridor).toBe(true)
    expect(corridorAtPop).not.toBeNull()

    // Round-trip fidelity: replays 1:1 at a round where the corridor field is live.
    const b2 = createBattle({
      playerUnits: [
        eu({ id: 'a', visionRange: 10, moveSpeed: 0.9 }),
        eu({ id: 'f1', visionRange: 3, moveSpeed: 0.9 }),
        eu({ id: 'f2', visionRange: 3, moveSpeed: 0.9 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 99999, hp: 99999, moveSpeed: 0, visionRange: 1 })],
      mode: 'open', cols: 60, rows: 60, barriers: [wall],
    })
    find(b2, 'a').pos = { x: 30, y: 3 }
    find(b2, 'e').pos = { x: 32, y: 3 }
    find(b2, 'f1').pos = { x: 29, y: 20 }
    find(b2, 'f2').pos = { x: 31, y: 20 }
    for (let r = 0; r < 5; r++) advanceRound(b2)
    expect(b2.plans.player!.corridor).toBeTruthy()   // sanity: populated at this checkpoint
    const token = serializeBattle(b2)
    const reloaded = deserializeBattle(token)
    expect(reloaded.plans.player!.corridor).toEqual(b2.plans.player!.corridor)
    for (let r = 0; r < 10; r++) { advanceRound(b2); advanceRound(reloaded) }
    expect(reloaded.round).toBe(b2.round)
    for (const c of b2.combatants) {
      const rc = reloaded.combatants.find((x) => x.id === c.id)!
      expect(rc.pos).toEqual(c.pos)
    }
    expect(reloaded.plans.player).toEqual(b2.plans.player)
  })
})

// ── M2-deferred regression tests (per the M2 review) ─────────────────────────

describe('M2-deferred (a) — re-anchor uses the primary\'s CURRENT (drifted) position', () => {
  it('a joiner near the primary\'s live position gets swept in even though it is far from the original commit spot', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p1', str: 10, int: 60, hp: 200, maxHp: 200, moveSpeed: 0 })],
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 10 }),
        // Finite vision — only captured by pullSetOf's passiveAcquires when
        // the seed point is genuinely near IT, not near the stale commit spot.
        eu({ id: 'e2', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 5, tactics: [{ id: 'skittish', rank: 1 }] }),
      ],
      mode: 'encounter', cols: 100, rows: 100,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'e1').pos = { x: 10, y: 20 }   // commit position (A)
    find(b, 'e2').pos = { x: 60, y: 60 }   // far from A — must not be swept if A were (wrongly) reused

    const members = () => [find(b, 'p1')]
    const enemies = () => [find(b, 'e1'), find(b, 'e2')]
    const threat = { e1: 5, e2: 5 }

    const first = decideEngagement(b, 'player', members(), enemies(), threat, null)
    expect(first.engagement!.targetIds).toEqual(['e1'])

    // e1 drifts to a NEW live position (B), right next to e2 — simulating
    // real movement between decision rounds. e2 "joins uninvited" there.
    find(b, 'e1').pos = { x: 58, y: 60 }
    find(b, 'p1').threat['e2'] = 5
    find(b, 'e2').provoked = true

    const second = decideEngagement(b, 'player', members(), enemies(), threat, first.engagement)
    expect(second.engagement!.targetIds).toEqual(['e1', 'e2'])
  })
})

describe('M2-deferred (b) — acumen mid-fight handoff', () => {
  it('the INT carrier dying mid-fight falls to v0\'s CAMP_RADIUS camp, without a crash or primary thrash', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'scholar', str: 5, int: 60, hp: 40, maxHp: 40, moveSpeed: 0, visionRange: 20 }),
        eu({ id: 'p2', str: 10, hp: 200, maxHp: 200, moveSpeed: 0, visionRange: 20 }),
        eu({ id: 'p3', str: 10, hp: 200, maxHp: 200, moveSpeed: 0, visionRange: 20 }),
      ],
      enemyUnits: [
        ...Array.from({ length: 8 }, (_, i) => eu({
          id: `g${i}`, name: 'Grunt', team: 'enemy', str: 10, hp: 5000, maxHp: 5000,
          moveSpeed: 0, visionRange: 3, tactics: [{ id: 'pack-tactics', rank: 1 }],
        })),
        eu({ id: 'loner', name: 'Loner', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 3 }),
      ],
      mode: 'encounter', cols: 80, rows: 80,
    })
    find(b, 'scholar').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'p3').pos = { x: 10, y: 9 }
    placeFatCamp(b, 15.5, 20)   // near the loner, but outside the Grunts' OWN vision (3)
    find(b, 'loner').pos = { x: 10, y: 20 }

    for (let r = 0; r < 5; r++) advanceRound(b)
    // M2 (scholar alive): affordability excludes the unaffordable Grunt blob.
    expect(b.plans.player!.engagement!.targetIds).toEqual(['loner'])

    find(b, 'scholar').hp = 0
    find(b, 'scholar').alive = false

    const primaries: (string | null)[] = []
    expect(() => {
      for (let r = 0; r < 10; r++) {
        advanceRound(b)
        primaries.push(b.plans.player!.engagement?.primaryId ?? null)
      }
    }).not.toThrow()

    // No thrash: the primary never flips across the ten post-death rounds
    // (v0's own PRIMARY_SWITCH_MARGIN hysteresis holds it).
    expect(new Set(primaries).size).toBe(1)
    // v0's naive CAMP_RADIUS sweep now rides along uninvited Grunts (the
    // over-pull v0 is diegetically supposed to commit).
    expect(b.plans.player!.engagement!.targetIds.length).toBeGreaterThan(1)
  })
})

describe('M2-deferred (c) — avoid-list holds under real drift', () => {
  it('a party with real moveSpeed never aggros an unaffordable camp across 20+ rounds of wandering', () => {
    const camp = Array.from({ length: 8 }, (_, i) => eu({
      id: `g${i}`, name: 'Grunt', team: 'enemy', str: 10, hp: 5000, maxHp: 5000,
      moveSpeed: 0, visionRange: 20, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
    }))
    const playerUnits = [
      eu({ id: 'p1', str: 10, int: 60, hp: 50, maxHp: 50, moveSpeed: 0.9, visionRange: 20 }),
      eu({ id: 'p2', str: 10, hp: 50, maxHp: 50, moveSpeed: 0.9, visionRange: 20 }),
      eu({ id: 'p3', str: 10, hp: 50, maxHp: 50, moveSpeed: 0.9, visionRange: 20 }),
    ]
    const b = createBattle({ playerUnits, enemyUnits: camp, mode: 'open', cols: 100, rows: 100 })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'p3').pos = { x: 10, y: 9 }
    placeFatCamp(b, 35, 10)   // near enough to be seen/priced, far enough not to be reached in 25 rounds

    const before = { ...find(b, 'p1').pos }
    let everProvoked = false
    let everEngaged = false
    for (let r = 0; r < 25; r++) {
      advanceRound(b)
      for (let i = 0; i < 8; i++) if (find(b, `g${i}`).provoked) everProvoked = true
      if (b.plans.player!.engagement) everEngaged = true
    }
    // The party actually moved (real drift, not the moveSpeed:0 pattern most
    // other tests use) — this is what makes the avoid-list stability real.
    expect(Math.hypot(find(b, 'p1').pos.x - before.x, find(b, 'p1').pos.y - before.y)).toBeGreaterThan(5)
    expect(everProvoked).toBe(false)
    expect(everEngaged).toBe(false)
    for (let i = 0; i < 8; i++) expect(find(b, `g${i}`).hp).toBe(5000)   // never touched
    // Steady state: whatever the party can now see of the camp is avoided.
    const seenNow = Array.from({ length: 8 }, (_, i) => find(b, `g${i}`))
      .filter((g) => [find(b, 'p1'), find(b, 'p2'), find(b, 'p3')].some((m) => Math.hypot(m.pos.x - g.pos.x, m.pos.y - g.pos.y) <= m.visionRange))
    expect(seenNow.length).toBeGreaterThan(0)
    for (const g of seenNow) expect(b.plans.player!.avoidTargetIds ?? []).toContain(g.id)
  })
})
