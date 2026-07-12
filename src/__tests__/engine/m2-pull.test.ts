// Pull model + engagement commitment (tactical-coordination.md M2). Camps,
// pullSetOf (predicates shared with rallyPack — no-drift), the mutual-TTK
// race, the commitment fast path + abandon predicates, the ACUMEN.pull gate,
// and the `pull` assignment + Puller tactic. See teamplan.ts's pullSetOf/
// decideEngagement and spatial.ts's pullMovement for the implementation this
// exercises.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, addCombatant, selectTarget, pullSetOf, decideEngagement, serializeBattle, deserializeBattle,
  type BattleState, type TeamPlan,
} from '@/engine'
import { eu, attackSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('M2 — no-drift: pullSetOf matches realized aggro', () => {
  it('the predicted pull set equals the set that actually ends up provoked/locked', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'hero', str: 24, moveSpeed: 0 })],
      enemyUnits: [
        // Pack-tactics chain: a (seed, hit by the hero) → b (roused by a) → c
        // (roused by b, out of a's own vision — exercises the transitive BFS).
        eu({
          id: 'a', name: 'Boar', team: 'enemy', moveSpeed: 0, visionRange: 5,
          tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
        }),
        eu({
          id: 'b', name: 'Boar', team: 'enemy', moveSpeed: 0, visionRange: 5,
          tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
        }),
        // Vision wide enough to actually LOCK the hero once roused (it's the
        // rousing CALLER's vision, not the ally's, that governs whether the
        // call reaches — this only affects whether c keeps the lock).
        eu({
          id: 'c', name: 'Boar', team: 'enemy', moveSpeed: 0, visionRange: 10,
          tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
        }),
        // Passive acquisition: aggressive-on-sight (not skittish), no pack-tactics,
        // but its own vision reaches the fight point — should join on its own.
        eu({ id: 'e', name: 'Sentry', team: 'enemy', moveSpeed: 0, visionRange: 8 }),
        // The stray: different name (no pack call) and too far to see the fight —
        // must NOT be predicted, and must NOT actually join.
        eu({
          id: 'd', name: 'Elsewhere', team: 'enemy', moveSpeed: 0, visionRange: 5,
          tactics: [{ id: 'skittish', rank: 1 }],
        }),
      ],
      mode: 'encounter', cols: 60, rows: 60,
    })
    find(b, 'hero').pos = { x: 10, y: 10 }
    find(b, 'a').pos = { x: 10, y: 10.9 }   // adjacent → the hero hits this one
    find(b, 'b').pos = { x: 14, y: 10 }     // within a's vision (5)
    find(b, 'c').pos = { x: 18, y: 10 }     // within b's vision (5) but NOT a's (8 away)
    find(b, 'e').pos = { x: 10, y: 15 }     // ~4.1 from a; within e's own vision (8)
    find(b, 'd').pos = { x: 10, y: 50 }     // far outside everyone's vision

    const predicted = pullSetOf(b, find(b, 'a'), find(b, 'a').pos).map((c) => c.id).sort()
    expect(predicted).toEqual(['a', 'b', 'c', 'e'])

    for (let r = 0; r < 14; r++) advanceRound(b)

    const joined = b.combatants
      .filter((c) => c.team === 'enemy' && c.provoked && c.lockedTargetId)
      .map((c) => c.id)
      .sort()
    expect(joined).toEqual(predicted)
    expect(find(b, 'd').provoked).toBe(false)
    expect(find(b, 'd').lockedTargetId).toBeNull()
  })
})

// A brawn-vs-scholar party pair used by several tests below: three heroes,
// the middle one optionally carrying enough INT to clear ACUMEN.pull (50).
const scholarParty = (withScholar: boolean) => [
  eu({ id: 'p1', str: 10, hp: 50, maxHp: 50, int: withScholar ? 60 : 0, moveSpeed: 0 }),
  eu({ id: 'p2', str: 10, hp: 50, maxHp: 50, moveSpeed: 0 }),
  eu({ id: 'p3', str: 10, hp: 50, maxHp: 50, moveSpeed: 0 }),
]

// A fat, unaffordable camp: 8 tanky same-named monsters clustered tightly.
const fatCamp = () => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => eu({
  id: `g${i}`, name: 'Grunt', team: 'enemy', str: 10, hp: 5000, maxHp: 5000,
  moveSpeed: 0, visionRange: 3,
  tactics: [{ id: 'pack-tactics', rank: 1 }],
}))
const placeFatCamp = (b: BattleState, cx: number, cy: number) => {
  const offsets = [[-1.2, -1.2], [-1.2, 0], [-1.2, 1.2], [0, -1.2], [0, 1.2], [1.2, -1.2], [1.2, 0], [1.2, 1.2]]
  offsets.forEach((o, i) => { find(b, `g${i}`).pos = { x: cx + o[0], y: cy + o[1] } })
}

describe('M2 — affordable single vs unaffordable blob', () => {
  it('commits to the lone affordable straggler; the blob lands on avoidTargetIds and is never aggroed', () => {
    const b = createBattle({
      playerUnits: scholarParty(true),
      enemyUnits: [
        ...fatCamp(),
        eu({ id: 'loner', name: 'Loner', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 3 }),
      ],
      mode: 'encounter', cols: 80, rows: 80,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'p3').pos = { x: 10, y: 9 }
    placeFatCamp(b, 50, 50)             // far away — well outside the loner's own vision
    find(b, 'loner').pos = { x: 10, y: 20 }

    for (let r = 0; r < 15; r++) {
      advanceRound(b)
      const plan = b.plans.player!
      expect(plan.engagement!.targetIds).toEqual(['loner'])
      for (let i = 0; i < 8; i++) expect(plan.avoidTargetIds).toContain(`g${i}`)
      for (const id of ['p1', 'p2', 'p3']) {
        const locked = find(b, id).lockedTargetId
        expect(locked === null || locked === 'loner').toBe(true)
      }
    }
    for (let i = 0; i < 8; i++) expect(find(b, `g${i}`).hp).toBe(5000)   // never touched
  })
})

describe('M2 — puller cycle', () => {
  it('the Puller-tactic unit gets the pull assignment (declared intent beats capability), tags the target, and drags it to the anchor', () => {
    const b = createBattle({
      playerUnits: [
        // Long capability.reach — would win a pure capability pick...
        eu({ id: 'reach', str: 10, int: 60, hp: 60, maxHp: 60, moveSpeed: 0, skills: [attackSkill({ id: 'longshot', range: 6 })] }),
        eu({ id: 'other', str: 10, hp: 60, maxHp: 60, moveSpeed: 0 }),
        // ...but this unit DECLARES the intent, so it wins instead.
        eu({ id: 'puller', str: 10, hp: 60, maxHp: 60, moveSpeed: 0.9, tactics: [{ id: 'puller', rank: 1 }] }),
      ],
      enemyUnits: [
        ...fatCamp(),
        eu({ id: 'fringe', name: 'Fringe', team: 'enemy', str: 5, hp: 200, maxHp: 200, moveSpeed: 0.9, visionRange: 8, tactics: [{ id: 'skittish', rank: 1 }] }),
      ],
      mode: 'encounter', cols: 80, rows: 80,
    })
    find(b, 'reach').pos = { x: 10, y: 5 }
    find(b, 'other').pos = { x: 10, y: 6 }
    find(b, 'puller').pos = { x: 10, y: 16 }
    placeFatCamp(b, 15.5, 20)          // nearest Grunt corner ~4.3 from the fringe: adjacent (<CAMP_RADIUS) but out of its 3-vision
    find(b, 'fringe').pos = { x: 10, y: 20 }

    advanceRound(b)
    const plan = b.plans.player!
    expect(plan.engagement!.targetIds).toEqual(['fringe'])
    expect(plan.assignments).toBeDefined()
    expect(plan.assignments!['puller']).toMatchObject({ role: 'pull', targetId: 'fringe' })
    expect(plan.assignments!['reach']).toBeUndefined()
    const anchor = (plan.assignments!['puller'] as { to: { x: number; y: number } }).to

    let tagRound = -1
    for (let r = 1; r <= 40 && tagRound < 0; r++) {
      advanceRound(b)
      if ((find(b, 'fringe').threat['puller'] ?? 0) > 0) tagRound = r
    }
    expect(tagRound).toBeGreaterThan(0)   // the puller actually landed a hit (tagged it)
    // Right at the tag, the target turned on its tagger — not the rest of the
    // line (checked immediately: once it's dragged within range of the other
    // two, their own fire naturally pulls its aggro too — that's convergence
    // working as intended, just not what THIS assertion is isolating).
    expect(find(b, 'fringe').lockedTargetId).toBe('puller')

    // After tagging, the puller heads back toward the anchor rather than
    // camping next to the target.
    const dPullerAnchorAtTag = Math.hypot(find(b, 'puller').pos.x - anchor.x, find(b, 'puller').pos.y - anchor.y)
    for (let r = 0; r < 10; r++) advanceRound(b)
    const dPullerAnchorLater = Math.hypot(find(b, 'puller').pos.x - anchor.x, find(b, 'puller').pos.y - anchor.y)
    expect(dPullerAnchorLater).toBeLessThan(dPullerAnchorAtTag + 0.01)
    // The target followed — it's now much closer to the anchor than its start.
    const startDist = Math.hypot(20 - anchor.x, 20 - anchor.y)
    const dFringeAnchorLater = Math.hypot(find(b, 'fringe').pos.x - anchor.x, find(b, 'fringe').pos.y - anchor.y)
    expect(dFringeAnchorLater).toBeLessThan(startDist)
  })
})

describe('M2 — selectTarget prefers the assignment target over the team primary', () => {
  it('a pull assignment overrides engagement.primaryId for that unit only', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'puller', moveSpeed: 0 })],
      enemyUnits: [
        eu({ id: 'main', team: 'enemy', hp: 100, maxHp: 100 }),
        eu({ id: 'fringe', team: 'enemy', hp: 100, maxHp: 100 }),
      ],
    })
    find(b, 'puller').pos = { x: 10, y: 10 }
    find(b, 'main').pos = { x: 10, y: 30 }     // far — only the plan bonus could favor it
    find(b, 'fringe').pos = { x: 10, y: 30.5 } // right next to 'main', same distance from puller
    const plan: TeamPlan = {
      waypoint: null, focusTargetId: null, threat: {},
      engagement: { targetIds: ['main'], primaryId: 'main', anchor: null, stance: 'collapse', sinceRound: 0 },
      assignments: { puller: { role: 'pull', targetId: 'fringe', to: { x: 0, y: 0 } } },
    }
    b.plans.player = plan
    selectTarget(b, find(b, 'puller'))
    expect(find(b, 'puller').lockedTargetId).toBe('fringe')
  })
})

describe('M2 — abandon on race flip', () => {
  it('a committed engagement is dropped once the live re-price loses beyond the ENGAGE_EXIT hysteresis', () => {
    const b = createBattle({
      playerUnits: scholarParty(true),
      enemyUnits: [eu({ id: 'target', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 10 })],
      mode: 'encounter', cols: 60, rows: 60,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'p3').pos = { x: 10, y: 9 }
    find(b, 'target').pos = { x: 10, y: 20 }

    advanceRound(b)
    expect(b.plans.player!.engagement!.targetIds).toEqual(['target'])

    // Reinforcements teleport in near the primary, already fighting a member
    // (threat simulates a landed hit — the same signal M1's avoid test uses).
    for (let i = 0; i < 6; i++) {
      const reinforcement = addCombatant(
        b,
        { ...eu({ id: `r${i}`, name: 'Grunt', team: 'enemy', str: 10, hp: 400, maxHp: 400, moveSpeed: 0, visionRange: 10 }), team: 'enemy' },
        'enemy',
        undefined,
        { x: 10 + i * 0.3, y: 20.5 },
      )
      find(b, 'p1').threat[reinforcement.id] = 5
    }
    advanceRound(b)
    expect('engagement' in b.plans.player!).toBe(false)
  })
})

describe('M2 — over-pull re-anchor', () => {
  it('an uninvited joiner grows targetIds when the re-priced camp stays affordable', () => {
    const b = createBattle({
      playerUnits: scholarParty(true),
      enemyUnits: [
        eu({ id: 'e1', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 10 }),
        // Skittish: excluded from the INITIAL camp (not yet provoked, so
        // passiveAcquires can't sweep it in) — it only turns hostile "on its
        // own" when we simulate the uninvited join below.
        eu({ id: 'e2', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 10, tactics: [{ id: 'skittish', rank: 1 }] }),
      ],
      mode: 'encounter', cols: 60, rows: 60,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'p3').pos = { x: 10, y: 9 }
    find(b, 'e1').pos = { x: 10, y: 20 }
    find(b, 'e2').pos = { x: 11, y: 20 }   // right next to e1 — will be swept in on re-anchor

    advanceRound(b)
    expect(b.plans.player!.engagement!.targetIds).toEqual(['e1'])

    // e2 "joins uninvited" — it turned hostile and has landed a hit on a
    // member on its own (the same threat signal M1's avoid test uses).
    find(b, 'e2').provoked = true
    find(b, 'p1').threat['e2'] = 5
    advanceRound(b)
    expect(b.plans.player!.engagement!.targetIds).toEqual(['e1', 'e2'])
  })
})

describe('M2 — acumen gate', () => {
  it('a brawn-only party plays v0 (CAMP_RADIUS, no affordability); a scholar party does not', () => {
    const scenario = (withScholar: boolean) => {
      const b = createBattle({
        playerUnits: scholarParty(withScholar),
        enemyUnits: [
          ...fatCamp(),
          eu({ id: 'loner', name: 'Loner', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 3 }),
        ],
        mode: 'encounter', cols: 80, rows: 80,
      })
      find(b, 'p1').pos = { x: 10, y: 10 }
      find(b, 'p2').pos = { x: 10, y: 11 }
      find(b, 'p3').pos = { x: 10, y: 9 }
      // Close enough for v0's pure-proximity CAMP_RADIUS(6) to sweep the
      // Grunts in around 'loner' (the kill-order primary either way), but
      // beyond the Grunts' OWN vision(3) — so M2's real pullSetOf prediction
      // correctly excludes them from loner's solo camp.
      placeFatCamp(b, 15.5, 20)
      find(b, 'loner').pos = { x: 10, y: 20 }
      advanceRound(b)
      return b
    }
    const brawn = scenario(false)
    const scholar = scenario(true)
    // v0: no affordability test — the camp members near the primary all ride
    // along in targetIds (a brawn party over-pulls, diegetically).
    expect(brawn.plans.player!.engagement!.targetIds.length).toBeGreaterThan(1)
    // M2 (gated): affordability rejects the whole 8-Grunt blob outright.
    expect(scholar.plans.player!.engagement!.targetIds).toEqual(['loner'])
  })

  it("re-reads the gate every round: killing the enemy team's INT carrier degrades ITS plan mid-fight", () => {
    // Direct decideEngagement-level assertion (the prompt's own allowance for
    // this case): a modest enemy pack (3 Grunts + a Shaman) appraising
    // whether to pile onto a much tougher, tightly clustered 5-hero party.
    // `decideEngagement`'s `enemies` param is generic — for team 'enemy' it's
    // the OPPOSING (player) side, so this exercises the exact same code the
    // engine runs, just without a full advanceRound loop.
    const b = createBattle({
      playerUnits: [0, 1, 2, 3, 4].map((i) => eu({ id: `h${i}`, str: 15, hp: 300, maxHp: 300, moveSpeed: 0, visionRange: 20 })),
      enemyUnits: [
        eu({ id: 'g0', name: 'Grunt', team: 'enemy', str: 10, hp: 500, maxHp: 500, moveSpeed: 0 }),
        eu({ id: 'g1', name: 'Grunt', team: 'enemy', str: 10, hp: 500, maxHp: 500, moveSpeed: 0 }),
        eu({ id: 'g2', name: 'Grunt', team: 'enemy', str: 10, hp: 500, maxHp: 500, moveSpeed: 0 }),
        eu({ id: 'shaman', name: 'Shaman', team: 'enemy', str: 1, int: 60, hp: 20, maxHp: 20, moveSpeed: 0 }),
      ],
      mode: 'encounter', cols: 60, rows: 60,
    })
    ;[0, 1, 2, 3, 4].forEach((i) => { find(b, `h${i}`).pos = { x: 10 + i * 0.6, y: 10 } })   // tightly clustered
    find(b, 'g0').pos = { x: 10, y: 20 }
    find(b, 'g1').pos = { x: 11, y: 20 }
    find(b, 'g2').pos = { x: 9, y: 20 }
    find(b, 'shaman').pos = { x: 10, y: 21 }

    const enemyMembers = () => b.combatants.filter((c) => c.alive && c.team === 'enemy')
    const heroes = () => b.combatants.filter((c) => c.alive && c.team === 'player')
    const threat = Object.fromEntries(heroes().map((h) => [h.id, h.str + h.int]))

    // With the shaman alive, the enemy team clears ACUMEN.pull: pullSetOf
    // sweeps every clustered hero into any candidate's camp, which is a
    // losing trade for 3 Grunts + a Shaman — no engagement.
    const withShaman = decideEngagement(b, 'enemy', enemyMembers(), heroes(), threat, null)
    expect(withShaman.engagement).toBeNull()

    find(b, 'shaman').hp = 0
    find(b, 'shaman').alive = false
    // Gate re-read with the shaman gone: acumen drops under ACUMEN.pull and
    // v0 (CAMP_RADIUS, no affordability) takes back over — the pack commits
    // to the primary hero plus whoever's within CAMP_RADIUS of it, blind to
    // how the trade actually prices out.
    const withoutShaman = decideEngagement(b, 'enemy', enemyMembers(), heroes(), threat, null)
    expect(withoutShaman.engagement).not.toBeNull()
    expect(withoutShaman.engagement!.targetIds.length).toBeGreaterThan(1)
  })
})

describe('M2 — hysteresis at the engage boundary', () => {
  it('a camp priced right at the edge does not flap committed/uncommitted across rounds', () => {
    const b = createBattle({
      playerUnits: scholarParty(true),
      enemyUnits: [eu({ id: 'edge', team: 'enemy', str: 5, hp: 30, maxHp: 30, moveSpeed: 0, visionRange: 10 })],
      mode: 'encounter', cols: 60, rows: 60,
    })
    find(b, 'p1').pos = { x: 10, y: 10 }
    find(b, 'p2').pos = { x: 10, y: 11 }
    find(b, 'p3').pos = { x: 10, y: 9 }
    find(b, 'edge').pos = { x: 10, y: 20 }

    let drops = 0
    let wasEngaged = false
    for (let r = 0; r < 12; r++) {
      // Small oscillation well inside the ENGAGE_EXIT band — shouldn't flip
      // committed/uncommitted even though it crosses the plain entry bar.
      find(b, 'edge').hp = r % 2 === 0 ? 28 : 34
      advanceRound(b)
      const engaged = !!b.plans.player!.engagement
      if (wasEngaged && !engaged) drops++
      wasEngaged = engaged
    }
    expect(drops).toBe(0)
  })
})

describe('M2 — serialize→replay 1:1 with a live pull assignment + committed engagement', () => {
  it('replays byte-identical after 15 more rounds on both sides', () => {
    const b = createBattle({
      playerUnits: [
        eu({ id: 'reach', str: 10, int: 60, hp: 60, maxHp: 60, moveSpeed: 0, skills: [attackSkill({ id: 'longshot', range: 6 })] }),
        eu({ id: 'other', str: 10, hp: 60, maxHp: 60, moveSpeed: 0 }),
        eu({ id: 'puller', str: 10, hp: 60, maxHp: 60, moveSpeed: 0.9, tactics: [{ id: 'puller', rank: 1 }] }),
      ],
      enemyUnits: [
        ...fatCamp(),
        eu({ id: 'fringe', name: 'Fringe', team: 'enemy', str: 5, hp: 200, maxHp: 200, moveSpeed: 0.9, visionRange: 8, tactics: [{ id: 'skittish', rank: 1 }] }),
      ],
      mode: 'open', cols: 80, rows: 80,
    })
    find(b, 'reach').pos = { x: 10, y: 5 }
    find(b, 'other').pos = { x: 10, y: 6 }
    find(b, 'puller').pos = { x: 10, y: 16 }
    placeFatCamp(b, 15.5, 20)
    find(b, 'fringe').pos = { x: 10, y: 20 }

    for (let r = 0; r < 8; r++) advanceRound(b)
    expect(b.plans.player!.assignments?.['puller']).toBeTruthy()   // sanity: a live pull assignment exists
    expect(b.plans.player!.engagement).toBeTruthy()

    const token = serializeBattle(b)
    const reloaded = deserializeBattle(token)
    expect(reloaded.plans.player).toEqual(b.plans.player)

    for (let r = 0; r < 15; r++) { advanceRound(b); advanceRound(reloaded) }
    expect(reloaded.round).toBe(b.round)
    for (const c of b.combatants) {
      const rc = reloaded.combatants.find((x) => x.id === c.id)
      if (!rc) continue   // a fresh open-world spawn on one side only would break this — not expected here
      expect(rc.pos).toEqual(c.pos)
      expect(rc.hp).toBe(c.hp)
      expect(rc.alive).toBe(c.alive)
      expect(rc.lockedTargetId).toBe(c.lockedTargetId)
    }
    expect(reloaded.plans.player).toEqual(b.plans.player)
    expect(reloaded.plans.enemy).toEqual(b.plans.enemy)
  })
})

// Review finding: a pull set that FILLS the prediction cap is a truncated
// undercount (reality doesn't cap) — it must read as unaffordable, never as a
// cheap 12-monster camp that's secretly a 13+ chain.
describe('M2 — cap-hit pull sets are unaffordable', () => {
  it('a horde past PULL_SET_CAP is refused even when the truncated price looks cheap', () => {
    const horde = Array.from({ length: 14 }, (_, i) =>
      eu({
        id: `w${String(i).padStart(2, '0')}`, name: 'Wolf', team: 'enemy',
        str: 1, maxHp: 10, hp: 10, visionRange: 10,
        tactics: [{ id: 'pack-tactics', rank: 1 }],
      }))
    const b = createBattle({
      // int 30 ×2 clears ACUMEN.pull (50) so the M2 race — not the v0 path — decides.
      playerUnits: [eu({ id: 'p1', str: 25, int: 30 }), eu({ id: 'p2', str: 25, int: 30 })],
      enemyUnits: horde,
      mode: 'open', cols: 100, rows: 100,
    })
    const find = (id: string) => b.combatants.find((c) => c.id === id)!
    for (const id of ['p1', 'p2']) find(id).visionRange = 12
    find('p1').pos = { x: 20, y: 20 }
    find('p2').pos = { x: 21, y: 20 }
    horde.forEach((w, i) => { find(w.id).pos = { x: 28 + (i % 5), y: 18 + Math.floor(i / 5) * 2 } })

    advanceRound(b)
    const plan = b.plans.player!
    // Truncated prediction ⇒ no engagement; the visible horde lands on the
    // avoid list instead of being engaged on a false price.
    expect(plan.engagement ?? null).toBeNull()
    expect(plan.avoidTargetIds?.length ?? 0).toBeGreaterThan(0)
  })
})

// Regression test for the "kills the stray, then walks into the pack it was
// supposed to leave alone" bug (dont-over-pull showcase, tactical-coordination
// review): defaultPlanner used to call pickHuntTarget BEFORE decideEngagement
// computed avoidTargetIds, so once the affordable straggler died the shared
// hunt/roam waypoint had nothing telling it to leave the unaffordable camp
// alone. The fix reorders defaultPlanner (decideEngagement first) and makes
// pickHuntTarget + selectTarget's "nothing else visible" fallback both skip
// avoid-listed foes. Real moveSpeed (not 0) so the party actually marches —
// mirrors dont-over-pull's shape but as a from-scratch engine test.
describe('M2-deferred (d) — avoid-aware hunt: kill the affordable straggler, never approach the unaffordable camp', () => {
  it('a party with real moveSpeed kills the stray then roams away, never provoking the fat pack over 40+ rounds', () => {
    const stray = eu({ id: 'stray', name: 'Stray', team: 'enemy', str: 5, hp: 140, maxHp: 140, moveSpeed: 0 })
    const pack = Array.from({ length: 8 }, (_, i) => eu({
      id: `w${i}`, name: 'Wolf', team: 'enemy', str: 10, hp: 5000, maxHp: 5000,
      moveSpeed: 0, visionRange: 3, tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
    }))
    const playerUnits = [
      // int alone clears ACUMEN.pull (50) — the M2 race, not v0's blind
      // CAMP_RADIUS sweep, decides whether the pack is affordable.
      eu({ id: 'p1', str: 10, int: 55, hp: 100, maxHp: 100, moveSpeed: 0.9, visionRange: 20 }),
      eu({ id: 'p2', str: 10, hp: 100, maxHp: 100, moveSpeed: 0.9, visionRange: 20 }),
      eu({ id: 'p3', str: 10, hp: 100, maxHp: 100, moveSpeed: 0.9, visionRange: 20 }),
    ]
    const b = createBattle({ playerUnits, enemyUnits: [stray, ...pack], mode: 'open', cols: 100, rows: 100 })
    find(b, 'p1').pos = { x: 10, y: 14 }
    find(b, 'p2').pos = { x: 11, y: 14 }
    find(b, 'p3').pos = { x: 12, y: 14 }
    find(b, 'stray').pos = { x: 10, y: 20 }
    // The fat pack camped beside the stray (within CAMP_RADIUS proximity) but
    // never in pullSetOf's real predicted set — the pack never rallies for it.
    const offsets: [number, number][] = [[-1.2, -1.2], [-1.2, 0], [-1.2, 1.2], [0, -1.2], [0, 1.2], [1.2, -1.2], [1.2, 0], [1.2, 1.2]]
    offsets.forEach((o, i) => { find(b, `w${i}`).pos = { x: 22 + o[0], y: 20 + o[1] } })

    for (let r = 0; r < 30; r++) advanceRound(b)
    expect(find(b, 'stray').alive).toBe(false)   // the affordable target actually dies

    let everProvoked = false
    let everWiped = false
    for (let r = 0; r < 40; r++) {
      advanceRound(b)
      for (let i = 0; i < 8; i++) if (find(b, `w${i}`).provoked) everProvoked = true
      if (['p1', 'p2', 'p3'].every((id) => !find(b, id).alive)) everWiped = true
    }
    expect(everProvoked).toBe(false)   // the pack never wakes
    expect(everWiped).toBe(false)      // the party never marches into it and dies
    for (let i = 0; i < 8; i++) expect(find(b, `w${i}`).hp).toBe(5000)   // never touched
    for (const id of ['p1', 'p2', 'p3']) expect(find(b, id).alive).toBe(true)
  })
})
