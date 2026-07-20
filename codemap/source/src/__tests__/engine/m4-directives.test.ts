// Directives (tactical-coordination.md §3.5, M4). The party-scope planner
// lever: DIRECTIVE_REGISTRY (the launch five), the per-team battle slot
// (`BattleState.directives`, serialized like objectives), planner consumption
// (stanceBias/anchorPolicy in decideStanceAnchor, pullDiscipline on the
// mutual-TTK margin, targetPolicy on the kill order, protect on the standing
// guard, mandatory pull under an ambush anchor), the cloak-hold ambush
// orchestration (cloakStalk + engine.ts's action hold, ACUMEN.ambush-gated),
// and the hard snapshot invariant: directive-less battles stay byte-identical.
import { describe, it, expect } from 'vitest'
import { unzlibSync, strFromU8 } from 'fflate'
import {
  createBattle, advanceRound, decideEngagement, serializeBattle, deserializeBattle,
  DIRECTIVE_REGISTRY, DEFAULT_DIRECTIVE_ID, withDirectiveTactics, setTeamDirective,
  TACTIC_REGISTRY, buildEngineSkill, sightlineClear,
  type BattleState, type Assignment, type BattleEvent, type CombatSetup,
} from '@/engine'
import { eu, attackSkill, healSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const tokenJson = (token: string): string => {
  const body = token.split('.')[1]
  const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  return strFromU8(unzlibSync(bytes))
}

describe('M4 — registry & injection seam', () => {
  it('ships the launch five, with valid party-scope tactic injections', () => {
    for (const id of ['skirmish', 'hold-the-line', 'pull-to-camp', 'protect', 'assassinate']) {
      expect(DIRECTIVE_REGISTRY[id], id).toBeTruthy()
    }
    expect(DIRECTIVE_REGISTRY[DEFAULT_DIRECTIVE_ID]).toBeTruthy()
    // Skirmish IS the shipped planner: no fields, no injections.
    const skirmish = DIRECTIVE_REGISTRY['skirmish']
    expect(skirmish.stanceBias ?? skirmish.anchorPolicy ?? skirmish.pullDiscipline
      ?? skirmish.targetPolicy ?? skirmish.protect ?? skirmish.tactics).toBeUndefined()
    // Every injected tactic must resolve and be party-scope (it rides the
    // partyTactics seam into every member).
    for (const def of Object.values(DIRECTIVE_REGISTRY)) {
      for (const t of def.tactics ?? []) {
        expect(TACTIC_REGISTRY[t.id], `${def.id} injects ${t.id}`).toBeTruthy()
        expect(TACTIC_REGISTRY[t.id].scope).toBe('party')
      }
    }
  })

  it('withDirectiveTactics appends injections and dedupes against explicit equips', () => {
    expect(withDirectiveTactics([], 'hold-the-line')).toEqual([{ id: 'focus-fire', rank: 1 }])
    // An explicitly-equipped copy keeps its slot and rank.
    expect(withDirectiveTactics([{ id: 'focus-fire', rank: 2 }], 'hold-the-line')).toEqual([{ id: 'focus-fire', rank: 2 }])
    const base = [{ id: 'finish-them', rank: 1 }]
    expect(withDirectiveTactics(base, 'assassinate')).toBe(base)   // no injections → same array
    expect(withDirectiveTactics(base, undefined)).toBe(base)
    // Assassinate deliberately injects nothing (review fix): a targeting-channel
    // injection would read as a fired player lever to the cloak-stalk's own
    // guard, disengaging the directive's orchestration — and Focus Fire aims at
    // the lowest-HP focus, not the assassination primary.
    expect(DIRECTIVE_REGISTRY['assassinate'].tactics).toBeUndefined()
  })

  it('setTeamDirective sets, clears, and treats the default id as absent', () => {
    const b = createBattle({ playerUnits: [eu({ id: 'a' })], enemyUnits: [eu({ id: 'e', team: 'enemy' })] })
    expect(b.directives).toBeUndefined()
    setTeamDirective(b, 'player', 'skirmish')          // the default = absent
    expect(b.directives).toBeUndefined()
    setTeamDirective(b, 'player', 'protect')
    expect(b.directives).toEqual({ player: 'protect' })
    setTeamDirective(b, 'enemy', 'assassinate')
    expect(b.directives).toEqual({ player: 'protect', enemy: 'assassinate' })
    setTeamDirective(b, 'enemy', null)
    setTeamDirective(b, 'player', DEFAULT_DIRECTIVE_ID)
    expect(b.directives).toBeUndefined()               // object dropped when empty
  })
})

// A kite-capable comp near a wall: skirmish kites, Hold the Line stands the line.
describe('M4 — hold-the-line: stanceBias overrides a viable kite', () => {
  const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1.5', cooldown: 1 })
  const setup = (directive?: string) => {
    const playerUnits = [
      eu({ id: 'p0', str: 5, int: 100, hp: 60, maxHp: 60, moveSpeed: 1.4, rangedRange: 6, skills: [{ ...bolt, id: 'bolt0' }] }),
      eu({ id: 'p1', str: 5, int: 20, hp: 60, maxHp: 60, moveSpeed: 1.4, rangedRange: 6, skills: [{ ...bolt, id: 'bolt1' }] }),
      eu({ id: 'p2', str: 5, int: 20, hp: 60, maxHp: 60, moveSpeed: 1.4, rangedRange: 6, skills: [{ ...bolt, id: 'bolt2' }] }),
    ]
    const enemyUnits = [0, 1, 2].map((i) => eu({
      id: `e${i}`, team: 'enemy', str: 10, hp: 80, maxHp: 80, moveSpeed: 0.3, meleeRange: 1.2, rangedRange: 0, visionRange: 20,
    }))
    const wall = { x: 8, y: 18, w: 4, h: 0.6, kind: 'wall' as const }
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, barriers: [wall], playerDirective: directive })
    find(b, 'p0').pos = { x: 10, y: 20 }; find(b, 'p1').pos = { x: 11, y: 20 }; find(b, 'p2').pos = { x: 9, y: 20 }
    find(b, 'e0').pos = { x: 10, y: 10 }; find(b, 'e1').pos = { x: 11, y: 10 }; find(b, 'e2').pos = { x: 9, y: 10 }
    advanceRound(b)
    return b
  }

  it('without a directive the comp kites; under Hold the Line it anchors and holds', () => {
    expect(setup().plans.player!.engagement!.stance).toBe('kite')
    const held = setup('hold-the-line')
    const eng = held.plans.player!.engagement!
    expect(eng.stance).toBe('hold')
    expect(eng.anchor).not.toBeNull()
  })
})

describe('M4 — pullDiscipline scales the mutual-TTK margin', () => {
  // Party sustained 30, hp 150; ogre hp 300, sustained 10: RTK 10, RTD 15.
  // steady pullMargin 0.8 → engage at 10 < 12; strict ×0.7 → refuse at 10 > 8.4.
  const setup = (directive?: string) => {
    const playerUnits = [
      eu({ id: 'p0', str: 10, int: 60, hp: 50, maxHp: 50 }),
      eu({ id: 'p1', str: 10, hp: 50, maxHp: 50 }),
      eu({ id: 'p2', str: 10, hp: 50, maxHp: 50 }),
    ]
    const enemyUnits = [eu({ id: 'ogre', team: 'enemy', str: 10, hp: 300, maxHp: 300, visionRange: 20 })]
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, playerDirective: directive })
    find(b, 'p0').pos = { x: 10, y: 20 }; find(b, 'p1').pos = { x: 11, y: 20 }; find(b, 'p2').pos = { x: 9, y: 20 }
    find(b, 'ogre').pos = { x: 10, y: 10 }
    return b
  }
  const decide = (b: BattleState) => decideEngagement(
    b, 'player', ['p0', 'p1', 'p2'].map((id) => find(b, id)), [find(b, 'ogre')], { ogre: 10 }, null,
  )

  it('a camp affordable at the steady margin is refused under strict discipline', () => {
    const loose = decide(setup())
    expect(loose.engagement?.targetIds).toEqual(['ogre'])
    const strict = decide(setup('hold-the-line'))
    expect(strict.engagement).toBeNull()
    expect(strict.avoidTargetIds).toContain('ogre')
  })
})

describe('M4 — pull-to-camp: ambush anchor + mandatory pull', () => {
  // Wall A stands between the party and the mark; wall B sits behind the party,
  // its corners blind to the mark (wall A blocks the line) — the ambush spot.
  const wallA = { x: 16, y: 10, w: 8, h: 1, kind: 'wall' as const }
  const wallB = { x: 18, y: 18, w: 4, h: 1, kind: 'wall' as const }
  const setup = (directive?: string, int = 160) => {
    const playerUnits = [
      eu({ id: 'p0', str: 10, int, hp: 50, maxHp: 50 }),
      eu({ id: 'p1', str: 10, hp: 50, maxHp: 50 }),
      eu({ id: 'p2', str: 10, hp: 50, maxHp: 50 }),
    ]
    const enemyUnits = [eu({ id: 'mark', team: 'enemy', str: 2, hp: 40, maxHp: 40, visionRange: 3 })]
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, barriers: [wallA, wallB], playerDirective: directive })
    find(b, 'p0').pos = { x: 19, y: 16 }; find(b, 'p1').pos = { x: 20, y: 16 }; find(b, 'p2').pos = { x: 21, y: 16 }
    find(b, 'mark').pos = { x: 20, y: 5 }
    return b
  }
  const decide = (b: BattleState) => decideEngagement(
    b, 'player', ['p0', 'p1', 'p2'].map((id) => find(b, id)), [find(b, 'mark')], { mark: 2 }, null,
  )

  it('anchors behind a LoS break and always staffs a pull dragging the primary to it', () => {
    const b = setup('pull-to-camp')
    const { engagement, assignments } = decide(b)
    expect(engagement).toBeTruthy()
    expect(engagement!.anchor).not.toBeNull()
    // The ambush anchor is BLIND to the primary — behind the sight break.
    expect(sightlineClear(engagement!.anchor!, find(b, 'mark').pos, b.barriers)).toBe(false)
    // Puller mandatory: a pull assignment on the primary, dragged to the anchor.
    const pulls = Object.values(assignments ?? {}).filter((a): a is Extract<Assignment, { role: 'pull' }> => a.role === 'pull')
    expect(pulls).toHaveLength(1)
    expect(pulls[0].targetId).toBe('mark')
    expect(pulls[0].to).toEqual(engagement!.anchor)
  })

  it('the same scene under skirmish holds a SEEING chokepoint and issues no pull', () => {
    const b = setup()
    const { engagement, assignments } = decide(b)
    expect(engagement).toBeTruthy()
    expect(engagement!.stance).toBe('hold')
    expect(sightlineClear(engagement!.anchor!, find(b, 'mark').pos, b.barriers)).toBe(true)
    const pulls = Object.values(assignments ?? {}).filter((a) => a.role === 'pull')
    expect(pulls).toHaveLength(0)
  })

  // Review fix: the mandatory pull only fires when the ambush was ACHIEVED.
  // Below the gates the directive must degrade to shipped behavior — never a
  // pull dragging the primary to the party's own centroid (below ACUMEN.stance)
  // or to a SEEING chokepoint (below ACUMEN.ambush).
  it('mid-acumen (below ACUMEN.stance): engagement is normal, no mandatory pull', () => {
    const b = setup('pull-to-camp', 60)   // ≥ ACUMEN.pull, < ACUMEN.stance
    const { engagement, assignments } = decide(b)
    expect(engagement).toBeTruthy()
    expect(engagement!.stance).toBe('collapse')
    expect(engagement!.anchor).toBeNull()
    const pulls = Object.values(assignments ?? {}).filter((a) => a.role === 'pull')
    expect(pulls).toHaveLength(0)
  })

  it('stance-but-not-ambush acumen: falls back to a seeing choke hold, still no pull', () => {
    const b = setup('pull-to-camp', 100)   // ≥ ACUMEN.stance, < ACUMEN.ambush
    const { engagement, assignments } = decide(b)
    expect(engagement).toBeTruthy()
    expect(engagement!.stance).toBe('hold')
    expect(sightlineClear(engagement!.anchor!, find(b, 'mark').pos, b.barriers)).toBe(true)
    const pulls = Object.values(assignments ?? {}).filter((a) => a.role === 'pull')
    expect(pulls).toHaveLength(0)
  })
})

describe('M4 — protect: forces + aims the standing guard', () => {
  // Uniform toughness (no fragility outlier) — only the directive can create a
  // guard here, and it aims at the CARRY (top sustained damage), not a squishy.
  const setup = (directive?: string) => {
    const playerUnits = [
      eu({ id: 'carry', str: 30, hp: 100, maxHp: 100 }),
      eu({ id: 't1', str: 10, hp: 100, maxHp: 100 }),
      eu({ id: 't2', str: 10, hp: 100, maxHp: 100 }),
      eu({ id: 't3', str: 10, hp: 100, maxHp: 100 }),
    ]
    const enemyUnits = [eu({ id: 'e0', team: 'enemy', str: 5, hp: 50, maxHp: 50, visionRange: 20 })]
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, playerDirective: directive })
    find(b, 'e0').pos = { x: 20, y: 5 }
    return b
  }
  const decide = (b: BattleState) => decideEngagement(
    b, 'player', ['carry', 't1', 't2', 't3'].map((id) => find(b, id)), [find(b, 'e0')], { e0: 5 }, null,
  )

  it('no directive + no outlier ⇒ no guard; Protect ⇒ guard on the carry', () => {
    expect(decide(setup()).assignments).toBeUndefined()
    const { assignments } = decide(setup('protect'))
    expect(assignments).toBeTruthy()
    const guards = Object.entries(assignments!).filter(([, a]) => a.role === 'guard')
    expect(guards).toHaveLength(1)
    const [guardId, guard] = guards[0]
    expect((guard as Extract<Assignment, { role: 'guard' }>).allyId).toBe('carry')
    expect(guardId).not.toBe('carry')
  })
})

describe('M4 — assassinate: targetPolicy squishy flips the kill order', () => {
  const setup = (directive?: string) => {
    const playerUnits = [
      eu({ id: 'p0', str: 10, hp: 60, maxHp: 60 }),
      eu({ id: 'p1', str: 10, hp: 60, maxHp: 60 }),
      eu({ id: 'p2', str: 10, hp: 60, maxHp: 60 }),
    ]
    const enemyUnits = [
      eu({ id: 'brute', team: 'enemy', str: 40, hp: 100, maxHp: 100, visionRange: 20 }),
      eu({ id: 'healer', team: 'enemy', str: 2, int: 8, hp: 80, maxHp: 80, visionRange: 20, skills: [healSkill()] }),
    ]
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, playerDirective: directive })
    find(b, 'p0').pos = { x: 10, y: 20 }; find(b, 'p1').pos = { x: 11, y: 20 }; find(b, 'p2').pos = { x: 9, y: 20 }
    find(b, 'brute').pos = { x: 10, y: 10 }; find(b, 'healer').pos = { x: 11, y: 10 }
    return b
  }
  const primaryOf = (b: BattleState) => decideEngagement(
    b, 'player', ['p0', 'p1', 'p2'].map((id) => find(b, id)),
    [find(b, 'brute'), find(b, 'healer')], { brute: 40, healer: 10 }, null,
  ).engagement?.primaryId

  it('dangerous-first picks the brute; assassinate picks the healer', () => {
    expect(primaryOf(setup())).toBe('brute')
    expect(primaryOf(setup('assassinate'))).toBe('healer')
  })
})

describe('M4 — assassinate: the cloak-hold ambush orchestration', () => {
  // A cloaked striker with a ranged basic: shipped behavior fires the bow at
  // range 6 (revealing early); under the directive — with the acumen gate
  // cleared — the plan times the dive: every action is held until Back Stab
  // range, so the FIRST offensive act is the stealth opener.
  const setup = (directive: string | undefined, sageInt: number) => {
    const cloak = buildEngineSkill('cloak', 1)!
    const backStab = buildEngineSkill('back-stab', 3)!
    const playerUnits = [
      // Ambusher rides along like the adapter's skill-inherited tactics would
      // (cloak grants it via SKILL_TACTICS) — it steers the cloaked approach.
      eu({ id: 'assassin', str: 12, hp: 60, maxHp: 60, rangedRange: 6, skills: [cloak, backStab], tactics: [{ id: 'ambusher', rank: 1 }] }),
      eu({ id: 'sage', str: 10, int: sageInt, hp: 60, maxHp: 60, moveSpeed: 0 }),
    ]
    const enemyUnits = [eu({ id: 'mark', team: 'enemy', str: 2, hp: 200, maxHp: 200, moveSpeed: 0, visionRange: 20 })]
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, playerDirective: directive })
    find(b, 'assassin').pos = { x: 10, y: 15 }
    find(b, 'sage').pos = { x: 30, y: 35 }
    find(b, 'mark').pos = { x: 10, y: 5 }
    return b
  }
  const offensiveEvents = (b: BattleState): BattleEvent[] => b.events.filter((e) =>
    e.sourceId === 'assassin'
    && (e.type === 'melee_attack' || e.type === 'ranged_attack' || (e.type === 'skill_use' && e.skillId !== 'cloak')))

  it('holds every action while cloaked and opens with Back Stab from stealth', () => {
    const b = setup('assassinate', 160)   // team acumen ≥ ACUMEN.ambush
    for (let r = 0; r < 40; r++) advanceRound(b)
    const offense = offensiveEvents(b)
    expect(offense.length).toBeGreaterThan(0)
    expect(offense[0].type).toBe('skill_use')
    expect(offense[0].skillId).toBe('back-stab')
    // The opener actually landed the ambush: the skill_use damage event carries
    // a stealth-boosted chunk (str 12 × 1.4 ≈ 17 raw, ×1.25 sneak ×2.5 Back
    // Stab — far above what an un-cloaked cast could deal).
    expect(offense[0].value ?? 0).toBeGreaterThan(25)
  })

  it('below ACUMEN.ambush (or without the directive) the striker reveals early with its bow', () => {
    for (const b of [setup('assassinate', 10), setup(undefined, 160)]) {
      for (let r = 0; r < 40; r++) advanceRound(b)
      const offense = offensiveEvents(b)
      expect(offense.length).toBeGreaterThan(0)
      expect(offense[0].skillId).not.toBe('back-stab')
      expect(offense[0].type).toBe('ranged_attack')
    }
  })

  // Review fix (§6 player lever wins): the stalk may only claim the DEFAULT
  // lock layer. A unit-level targeting tactic that fires — Tank Buster here —
  // keeps its own pick even while the unit is cloaked under Assassinate, and
  // the action hold disengages with it (the striker fights the tactic's
  // target instead of stalking the plan primary).
  it('an equipped targeting tactic keeps its pick while cloaked — the stalk never overrides it', () => {
    const cloak = buildEngineSkill('cloak', 1)!
    const backStab = buildEngineSkill('back-stab', 3)!
    const playerUnits = [
      eu({
        id: 'assassin', str: 12, hp: 60, maxHp: 60, rangedRange: 6, skills: [cloak, backStab],
        tactics: [{ id: 'tank-buster', rank: 1 }, { id: 'ambusher', rank: 1 }],
      }),
      eu({ id: 'sage', str: 10, int: 160, hp: 60, maxHp: 60, moveSpeed: 0 }),
    ]
    const enemyUnits = [
      // The plan primary under assassinate (lowest toughness + healer)…
      eu({ id: 'squishy', team: 'enemy', str: 2, def: 0, hp: 60, maxHp: 60, moveSpeed: 0, visionRange: 20, skills: [healSkill()] }),
      // …vs Tank Buster's own pick (highest defense).
      eu({ id: 'bulwark', team: 'enemy', str: 5, def: 30, hp: 120, maxHp: 120, moveSpeed: 0, visionRange: 20 }),
    ]
    const b = createBattle({ playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, playerDirective: 'assassinate' })
    find(b, 'assassin').pos = { x: 10, y: 15 }
    find(b, 'sage').pos = { x: 30, y: 35 }
    find(b, 'bulwark').pos = { x: 10, y: 5 }
    find(b, 'squishy').pos = { x: 14, y: 5 }

    // Sanity: the plan's kill order does point at the squishy — the lever has
    // something real to override.
    advanceRound(b)
    expect(b.plans.player!.engagement!.primaryId).toBe('squishy')
    // While cloaked and stalking-eligible, the lock stays Tank Buster's pick.
    for (let r = 0; r < 6; r++) {
      advanceRound(b)
      expect(find(b, 'assassin').lockedTargetId).toBe('bulwark')
    }
    // …and the first offensive act lands on the tactic's target, not the plan
    // primary (no starving action-hold pinned it in place).
    for (let r = 0; r < 30; r++) advanceRound(b)
    const offense = offensiveEvents(b)
    expect(offense.length).toBeGreaterThan(0)
    expect(offense[0].targetId).toBe('bulwark')
  })
})

describe('M4 — 5v5 arena: symmetric planners, two directives (§3.6)', () => {
  const arena = (): BattleState => {
    const wall = { x: 8, y: 16, w: 4, h: 0.8, kind: 'wall' as const }
    const playerUnits = [
      eu({ id: 'p-tank1', str: 15, hp: 120, maxHp: 120 }),
      eu({ id: 'p-tank2', str: 15, hp: 120, maxHp: 120 }),
      eu({ id: 'p-tank3', str: 15, hp: 120, maxHp: 120 }),
      eu({ id: 'p-heal', str: 2, int: 10, hp: 40, maxHp: 40, skills: [healSkill()] }),
      eu({ id: 'p-sage', str: 5, int: 100, hp: 60, maxHp: 60, rangedRange: 6, skills: [attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1.5', cooldown: 1 })] }),
    ]
    const enemyUnits = [0, 1, 2, 3, 4].map((i) => eu({
      id: `raider${i}`, team: 'enemy', str: 8, hp: 60, maxHp: 60, moveSpeed: 0.3, visionRange: 20,
    }))
    const b = createBattle({
      playerUnits, enemyUnits, mode: 'encounter', cols: 40, rows: 40, barriers: [wall],
      playerDirective: 'hold-the-line', enemyDirective: 'assassinate',
    } satisfies CombatSetup)
    const px = [10, 11, 9, 10, 11]
    playerUnits.forEach((u, i) => { find(b, u.id).pos = { x: px[i], y: 18 + (i > 2 ? 1 : 0) } })
    enemyUnits.forEach((u, i) => { find(b, u.id).pos = { x: 8 + i, y: 8 } })
    return b
  }

  it('both sides consume their directive, and a mid-fight snapshot replays 1:1', () => {
    const b = arena()
    for (let r = 0; r < 3; r++) advanceRound(b)
    // The line holds; the raiders hunt the healer.
    expect(b.plans.player!.engagement!.stance).toBe('hold')
    expect(b.plans.player!.engagement!.anchor).not.toBeNull()
    expect(b.plans.enemy!.engagement!.primaryId).toBe('p-heal')

    const token = serializeBattle(b)
    expect(tokenJson(token)).toContain('"directives"')
    const clone = deserializeBattle(token)
    expect(clone.directives).toEqual({ player: 'hold-the-line', enemy: 'assassinate' })
    for (let r = 0; r < 10; r++) { advanceRound(b); advanceRound(clone) }
    expect(clone.round).toBe(b.round)
    for (const c of b.combatants) {
      const rc = clone.combatants.find((x) => x.id === c.id)!
      expect(rc.pos, c.id).toEqual(c.pos)
      expect(rc.hp, c.id).toBe(c.hp)
    }
    expect(clone.plans).toEqual(b.plans)
  })
})

describe('M4 — snapshot byte-identity for directive-less battles', () => {
  const plain = () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', skills: [attackSkill()] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 30, rows: 30,
    })
    return b
  }

  it('no directive ⇒ the token never carries the key, and round-trips identically', () => {
    const b = plain()
    for (let i = 0; i < 5; i++) advanceRound(b)
    const token = serializeBattle(b)
    expect(tokenJson(token)).not.toContain('"directives"')
    expect(serializeBattle(deserializeBattle(token))).toBe(token)
  })

  it('an explicit Skirmish is byte-identical to no directive at all', () => {
    const a = plain()
    const s = createBattle({
      playerUnits: [eu({ id: 'a', skills: [attackSkill()] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 30, rows: 30,
      playerDirective: 'skirmish', enemyDirective: 'skirmish',
    })
    expect(s.directives).toBeUndefined()
    for (let i = 0; i < 5; i++) { advanceRound(a); advanceRound(s) }
    expect(serializeBattle(s)).toBe(serializeBattle(a))
  })
})
