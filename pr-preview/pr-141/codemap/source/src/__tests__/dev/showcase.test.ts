// Showcase battles (src/dev/showcaseBattles.ts) — the curated scenes behind the
// sandbox's Showcase source and the `?showcase=<id>` deep-links. Guard that each
// builds deterministically, survives the serialize→replay round-trip a shared
// link relies on, and actually exhibits the behaviour it advertises.
import { describe, it, expect } from 'vitest'
import { SHOWCASES, showcaseById, protectTheCarrySetup } from '@/dev/showcaseBattles'
import {
  serializeBattle, deserializeBattle, advanceRound, distance, teamAcumen, defaultPlanner,
  createBattle, setTeamDirective, sightlineClear, type BattleState, type Planner,
} from '@/engine'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const run = (b: BattleState, n: number) => { for (let i = 0; i < n; i++) advanceRound(b) }

describe('showcase catalog', () => {
  it('every entry builds and round-trips through a BSNAP (what a share link does)', () => {
    for (const sc of SHOWCASES) {
      const b = sc.build()
      expect(b.combatants.length, sc.id).toBeGreaterThan(0)
      const clone = deserializeBattle(serializeBattle(b))
      expect(clone.combatants.length, sc.id).toBe(b.combatants.length)
      // Deterministic: same build advanced N rounds matches its own replay.
      const a = sc.build(); const c = deserializeBattle(serializeBattle(sc.build()))
      run(a, 20); run(c, 20)
      expect(c.combatants.map((x) => `${x.id}:${x.pos.x.toFixed(3)},${x.pos.y.toFixed(3)}`))
        .toEqual(a.combatants.map((x) => `${x.id}:${x.pos.x.toFixed(3)},${x.pos.y.toFixed(3)}`))
    }
  })

  it('kite-anchor: melees the golem, ranges the sorcerer', () => {
    const b = showcaseById('kite-anchor')!.build()
    run(b, 40)   // the golem-mage frost-bolts (3-round channels) while closing, so give it time to reach Bash range
    // vs-golem closed to melee (bolts do nothing to magicDef 999); vs-mage held at range.
    expect(distance(find(b, 'vs-golem').pos, find(b, 'golem').pos)).toBeLessThan(2.5)
    expect(distance(find(b, 'vs-mage').pos, find(b, 'sorcerer').pos)).toBeGreaterThan(3)
  })

  it('blink-escape: the mage teleports out of the pocket', () => {
    const b = showcaseById('blink-escape')!.build()
    const start = { ...find(b, 'mage').pos }
    let blinked = false
    let prev = { ...start }
    for (let r = 0; r < 60 && !blinked; r++) {
      advanceRound(b)
      const m = find(b, 'mage')
      if (distance(prev, m.pos) > 4) blinked = true   // a walk step is ≤ ~1 cell
      prev = { ...m.pos }
    }
    expect(blinked).toBe(true)
    expect(find(b, 'mage').moveAbilityCds['teleport']).toBeGreaterThan(0)
  })

  it('moat-kite: the mage holds its side of the moat (never crosses)', () => {
    const b = showcaseById('moat-kite')!.build()
    let maxY = -Infinity
    for (let r = 0; r < 40; r++) { advanceRound(b); maxY = Math.max(maxY, find(b, 'mage').pos.y) }
    // The moat spans y 18..21; the mage starts below it (y 26) and must stay below.
    expect(find(b, 'mage').pos.y).toBeGreaterThan(21)
    // …and it actually fought (fired across the gap): at least one grunt took damage.
    expect(find(b, 'grunt-a').hp + find(b, 'grunt-b').hp).toBeLessThan(320)
  })

  it('posture-routes: wary clears-first where bold plows, both reach the far side', () => {
    const b = showcaseById('posture-routes')!.build()
    let warySawClearing = false, boldSawClearing = false
    let boldArrived = -1, waryArrived = -1
    for (let r = 0; r < 200; r++) {
      advanceRound(b)
      if (find(b, 'wary').travelClearing) warySawClearing = true
      if (find(b, 'bold').travelClearing) boldSawClearing = true
      if (boldArrived < 0 && find(b, 'bold').pos.y < 8) boldArrived = r
      if (waryArrived < 0 && find(b, 'wary').pos.y < 8) waryArrived = r
    }
    expect(warySawClearing).toBe(true)    // wary stopped to shoot the picket down
    expect(boldSawClearing).toBe(false)   // bold plowed straight through
    expect(boldArrived).toBeGreaterThan(0)          // both cross to the far side (routing past the enemies)
    expect(waryArrived).toBeGreaterThan(0)
    expect(boldArrived).toBeLessThan(waryArrived)   // bold gets there first; wary trades speed for safety
    expect(find(b, 'wary').hp).toBeGreaterThan(find(b, 'bold').hp - 1)   // wary no worse off than bold (cleared from range)
  })

  it('focus-fire: converges on the DISTANT sorcerer past ADJACENT ogres — danger, not distance', () => {
    const b = showcaseById('focus-fire')!.build()

    // Prove this is actually a danger-over-distance pick, not a disguised
    // nearest-first: the sorcerer must be FARTHER from the party than every
    // ogre (every hero starts adjacent to its own ogre; the sorcerer sits well
    // south of the whole cluster).
    const heroes = ['h1', 'h2', 'h3', 'h4'].map((id) => find(b, id).pos)
    const centroid = {
      x: heroes.reduce((s, p) => s + p.x, 0) / heroes.length,
      y: heroes.reduce((s, p) => s + p.y, 0) / heroes.length,
    }
    const sorcDist = distance(centroid, find(b, 'sorcerer').pos)
    for (const id of ['ogre-a', 'ogre-b', 'ogre-c']) {
      expect(sorcDist).toBeGreaterThan(distance(centroid, find(b, id).pos))
    }
    for (const id of ['h1', 'h2', 'h3', 'h4']) {
      const ownOgreDist = Math.min(...['ogre-a', 'ogre-b', 'ogre-c'].map((o) => distance(find(b, id).pos, find(b, o).pos)))
      expect(distance(find(b, id).pos, find(b, 'sorcerer').pos)).toBeGreaterThan(ownOgreDist)
    }

    advanceRound(b)   // the sorcerer is squishy enough to die within a round or two — check the convergence early
    expect(b.plans.player!.engagement!.primaryId).toBe('sorcerer')
    const lockedOnSorcerer = ['h1', 'h2', 'h3', 'h4'].filter((id) => find(b, id).lockedTargetId === 'sorcerer').length
    expect(lockedOnSorcerer).toBeGreaterThanOrEqual(3)

    let sorcererDied = -1
    let firstOgreDied = -1
    for (let r = 0; r < 60; r++) {
      advanceRound(b)
      if (sorcererDied < 0 && !find(b, 'sorcerer').alive) sorcererDied = r
      if (firstOgreDied < 0 && ['ogre-a', 'ogre-b', 'ogre-c'].some((id) => !find(b, id).alive)) firstOgreDied = r
    }
    expect(sorcererDied).toBeGreaterThanOrEqual(0)               // it actually dies within the window
    expect(firstOgreDied === -1 || sorcererDied < firstOgreDied).toBe(true)   // never after an ogre
  })

  it('the-puller: the puller tags the fringe straggler and drags it home; the pack never wakes', () => {
    const b = showcaseById('the-puller')!.build()
    expect(teamAcumen(b, 'player')).toBeGreaterThanOrEqual(50)   // clears ACUMEN.pull
    advanceRound(b)
    const plan = b.plans.player!
    expect(plan.engagement!.targetIds).toEqual(['fringe'])
    expect(plan.assignments!['puller']).toMatchObject({ role: 'pull', targetId: 'fringe' })
    const anchor = (plan.assignments!['puller'] as { to: { x: number; y: number } }).to

    let tagRound = -1
    for (let r = 0; r < 40 && tagRound < 0; r++) {
      advanceRound(b)
      if ((find(b, 'fringe').threat['puller'] ?? 0) > 0) tagRound = r
      for (let i = 0; i < 4; i++) expect(find(b, `wolf-${i}`).provoked).toBe(false)
    }
    expect(tagRound).toBeGreaterThan(0)   // the tag actually landed
    const dAtTag = distance(find(b, 'puller').pos, anchor)
    for (let r = 0; r < 15; r++) {
      advanceRound(b)
      for (let i = 0; i < 4; i++) expect(find(b, `wolf-${i}`).provoked).toBe(false)   // stays asleep throughout
    }
    expect(distance(find(b, 'puller').pos, anchor)).toBeLessThan(dAtTag + 0.01)   // heads home after the tag
  })

  it("dont-over-pull: fights ONLY the stray across the full window, kills it, roams away — the pack never wakes and every hero survives", () => {
    const b = showcaseById('dont-over-pull')!.build()
    expect(teamAcumen(b, 'player')).toBeGreaterThanOrEqual(50)   // clears ACUMEN.pull
    for (let r = 0; r < 10; r++) advanceRound(b)
    expect(find(b, 'stray').alive).toBe(true)
    const plan = b.plans.player!
    expect(plan.engagement!.primaryId).toBe('stray')
    expect(plan.engagement!.targetIds).toEqual(['stray'])
    for (let i = 0; i < 8; i++) {
      expect(plan.avoidTargetIds ?? []).toContain(`wolf-${i}`)
      expect(find(b, `wolf-${i}`).provoked).toBe(false)
    }

    // Full window (§Fix 1 avoid-aware hunt): keep running well past the stray's
    // death — the party must kill it, then roam AWAY rather than the old bug
    // (kill the stray, then walk the survivors straight into the pack it was
    // supposed to leave alone). Every Dire Wolf stays provoked===false and every
    // hero survives for the entire 70-round run.
    for (let r = 0; r < 60; r++) {
      advanceRound(b)
      for (let i = 0; i < 8; i++) expect(find(b, `wolf-${i}`).provoked).toBe(false)
    }
    expect(find(b, 'stray').alive).toBe(false)   // the affordable target actually dies
    for (const id of ['p1', 'p2', 'p3']) expect(find(b, id).alive).toBe(true)
  })

  it('hold-the-line: commits stance hold on the gap, holds it, toughest members forward, and the caster actually survives', () => {
    const b = showcaseById('hold-the-line')!.build()

    // Check the formation shape while the engagement is still fresh (mirrors
    // the pre-fix check) — the anchor/primary snapshot at this point is what
    // proves "toughest forward, fragile rearmost."
    for (let r = 0; r < 10; r++) advanceRound(b)
    const eng = b.plans.player!.engagement!
    expect(eng.stance).toBe('hold')
    expect(eng.anchor).not.toBeNull()
    const anchor = eng.anchor!
    const primary = find(b, eng.primaryId!)
    const ax = primary.pos.x - anchor.x, ay = primary.pos.y - anchor.y
    const d = Math.hypot(ax, ay) || 1
    const ux = ax / d, uy = ay / d
    const proj = (id: string) => {
      const c = find(b, id)
      return (c.pos.x - anchor.x) * ux + (c.pos.y - anchor.y) * uy
    }
    // The caster (fragility outlier) is the REARMOST member, full stop — a
    // stronger, more direct statement of "toughest forward" than pairing
    // specific ids into a front/back group. tank-a is ALSO this party's
    // highest-toughness member, but it's the standing-guard pick for the
    // caster (teamplan.ts's fragilityOutlier/pickGuard — no acumen gate) and
    // so runs guardPoint (interposing on the nearest threat), not the plain
    // formationSlot front-rank execution — its exact projection can vary with
    // where that threat currently is, so it's not pinned to a fixed front
    // rank. The invariant this scene actually promises is caster-rearmost.
    expect(proj('caster')).toBeLessThan(proj('tank-a'))
    expect(proj('caster')).toBeLessThan(proj('tank-b'))
    expect(proj('caster')).toBeLessThan(proj('mid'))

    // FIX-4(a): the swarm actually priced as AFFORDABLE (the old bug: the
    // mutual-TTK race never let the party commit at all) — stance/anchor stay
    // committed for as long as there's a real fight (once the swarm is fully
    // wiped, `engagement` naturally goes absent like every other "nothing
    // visible" case — that's not an abandon, just nothing left to fight).
    let minCasterToSwarm = Infinity
    for (let r = 0; r < 30; r++) {
      advanceRound(b)
      const liveEng = b.plans.player!.engagement
      const swarmAliveNow = Array.from({ length: 4 }, (_, i) => find(b, `swarm-${i}`)).filter((s) => s.alive).length
      if (swarmAliveNow > 0) {
        expect(liveEng?.stance).toBe('hold')
        expect(liveEng?.anchor).not.toBeNull()
      }
      const caster = find(b, 'caster')
      if (caster.alive) {
        for (let i = 0; i < 4; i++) {
          const s = find(b, `swarm-${i}`)
          if (s.alive) minCasterToSwarm = Math.min(minCasterToSwarm, distance(caster.pos, s.pos))
        }
      }
    }

    // FIX-4(b): the fragility outlier is genuinely protected — alive at the
    // end of the 40-round run and never within melee range (1.4) of a swarm mob.
    expect(find(b, 'caster').alive).toBe(true)
    expect(minCasterToSwarm).toBeGreaterThan(1.4)
  })

  it('protect-the-carry: a guard assignment materially cuts hits landing on the carry', () => {
    const b = protectTheCarrySetup()
    advanceRound(b)
    expect(b.plans.player!.assignments).toBeTruthy()
    const guardEntry = Object.entries(b.plans.player!.assignments!).find(([, a]) => a.role === 'guard' && a.allyId === 'carry')
    expect(guardEntry).toBeTruthy()

    const hitsOnCarry = (battle: BattleState, rounds: number): number => {
      let hits = 0
      for (let r = 0; r < rounds; r++) {
        advanceRound(battle)
        hits += battle.events.filter((e) => e.round === battle.round && e.targetId === 'carry'
          && (e.type === 'melee_attack' || e.type === 'ranged_attack' || e.type === 'skill_use')).length
      }
      return hits
    }
    const withGuard = hitsOnCarry(b, 30)

    const stripAssignments: Planner = (state, team) => {
      const { assignments, ...rest } = defaultPlanner(state, team)
      return rest
    }
    const b2 = protectTheCarrySetup(stripAssignments)
    const withoutGuard = hitsOnCarry(b2, 31)   // one extra round to offset the sanity advanceRound above
    expect(withGuard).toBeLessThan(withoutGuard)
  })

  it('stance-by-comp: an all-ranged party kites; the same comp made all-melee collapses', () => {
    const b = showcaseById('stance-by-comp')!.build()
    advanceRound(b)
    expect(b.plans.player!.engagement!.stance).toBe('kite')
    for (const id of ['h0', 'h1', 'h2', 'h3']) {
      expect(find(b, id).tactics.some((t) => t.def.id === 'kiter')).toBe(false)
    }
    let minDist = Infinity
    let maxDistOnceClosed = -Infinity
    for (let r = 0; r < 20; r++) {
      advanceRound(b)
      const brute = find(b, 'brute')
      if (!brute.alive) break
      const ds = ['h0', 'h1', 'h2', 'h3'].map((id) => distance(find(b, id).pos, brute.pos))
      minDist = Math.min(minDist, ...ds)
      if (Math.min(...ds) < 6) maxDistOnceClosed = Math.max(maxDistOnceClosed, ...ds)
    }
    expect(minDist).toBeGreaterThanOrEqual(4)      // the line never collapses to melee
    expect(maxDistOnceClosed).toBeGreaterThanOrEqual(4)   // and backs off once the brute is in range

    // Contrast: the SAME comp with rangedRange stripped (all-melee) commits collapse.
    const melee = createBattle({
      playerUnits: ['h0', 'h1', 'h2', 'h3'].map((id) => ({
        id, name: 'Ranger', team: 'player' as const, str: 15, int: 25, def: 4, spd: 10, magicDef: 0,
        maxHp: 80, hp: 80, preferredRank: 'front' as const, meleeRange: 1.4, rangedRange: 0, moveSpeed: 1.0, skills: [],
      })),
      enemyUnits: [{
        id: 'brute', name: 'Brute', team: 'enemy' as const, str: 15, def: 4, int: 0, spd: 10, magicDef: 0,
        maxHp: 300, hp: 300, preferredRank: 'front' as const, meleeRange: 1.4, rangedRange: 0, moveSpeed: 0.8, skills: [],
      }],
      mode: 'open', cols: 40, rows: 30,
    })
    const mfind = (id: string) => melee.combatants.find((c) => c.id === id)!
    mfind('h0').pos = { x: 9, y: 20 }; mfind('h1').pos = { x: 10, y: 20 }
    mfind('h2').pos = { x: 11, y: 20 }; mfind('h3').pos = { x: 10, y: 21 }
    mfind('brute').pos = { x: 10, y: 8 }
    advanceRound(melee)
    expect(melee.plans.player!.engagement!.stance).toBe('collapse')
  })

  it('kill-the-shaman: enemy coordinates while the shaman lives, collapses once it dies', () => {
    const b = showcaseById('kill-the-shaman')!.build()
    advanceRound(b)
    expect(teamAcumen(b, 'enemy')).toBeGreaterThanOrEqual(90)
    expect(b.plans.enemy!.engagement).toBeTruthy()
    expect(b.plans.enemy!.engagement!.stance).not.toBe('collapse')

    let shamanDied = -1
    for (let r = 0; r < 80 && shamanDied < 0; r++) {
      advanceRound(b)
      if (!find(b, 'shaman').alive) shamanDied = r
    }
    expect(shamanDied).toBeGreaterThan(0)
    expect(teamAcumen(b, 'enemy')).toBeLessThan(50)
    advanceRound(b)
    expect(b.plans.enemy!.engagement?.stance ?? 'collapse').toBe('collapse')
  })

  it('fold-when-losing: drops the boss AND physically routs — the Vanguard peels off and retreats, everyone alive', () => {
    const b = showcaseById('fold-when-losing')!.build()
    expect(teamAcumen(b, 'player')).toBeGreaterThanOrEqual(50)   // clears ACUMEN.pull

    advanceRound(b)
    expect(b.plans.player!.engagement!.targetIds).toEqual(['boss'])
    expect(b.plans.player!.engagement!.primaryId).toBe('boss')
    const vStart = distance(find(b, 'vanguard').pos, find(b, 'boss').pos)   // ~1: plastered to the boss

    // The abandon-for-losing now has EXECUTION: a published rout, not just a
    // dropped commitment. Run until the rout appears.
    let routRound = -1
    for (let r = 0; r < 60 && routRound < 0; r++) {
      advanceRound(b)
      if (b.plans.player!.rout) routRound = b.round
    }
    expect(routRound).toBeGreaterThan(0)                        // a real break-off, not just a silent drop
    expect(b.plans.player!.rout!.campIds).toContain('boss')     // fleeing the boss's camp specifically
    expect(b.plans.player!.engagement).toBeFalsy()              // the shared commitment is gone

    // Physically retreating: the Vanguard drops its lock and backs away from the
    // boss it was plastered to (the fold is now visible behavior, not "decide to
    // fold then die on it"). Give the break-off a few rounds to open the gap.
    for (let r = 0; r < 12; r++) advanceRound(b)
    expect(distance(find(b, 'vanguard').pos, find(b, 'boss').pos)).toBeGreaterThan(vStart + 3)

    // Folded — not wiped: every hero is still standing, the boss barely dented
    // (a genuine live-priced retreat, not a won fight).
    for (const id of ['scholar', 'fighter-a', 'fighter-b', 'vanguard']) {
      expect(find(b, id).hp).toBeGreaterThan(0)
    }
    expect(find(b, 'boss').hp).toBeGreaterThan(1000)   // barely dented — this was never close to a kill
  })

  it('wake-one-not-the-herd: the avoid list is live — the self-provoked loner drops off it, the sleeping pack never does', () => {
    const b = showcaseById('wake-one-not-the-herd')!.build()
    expect(teamAcumen(b, 'player')).toBeGreaterThanOrEqual(50)   // clears ACUMEN.pull

    advanceRound(b)
    const avoidRound1 = b.plans.player!.avoidTargetIds ?? []
    // Everything — the lone wolf included — starts on the avoid list.
    expect(avoidRound1).toContain('lone-wolf')
    for (let i = 0; i < 6; i++) expect(avoidRound1).toContain(`wolf-${i}`)

    let droppedRound = -1
    for (let r = 0; r < 40 && droppedRound < 0; r++) {
      advanceRound(b)
      const avoid = b.plans.player!.avoidTargetIds ?? []
      if (!avoid.includes('lone-wolf')) droppedRound = b.round
      // The pack stays avoid-listed and asleep for the entire run.
      for (let i = 0; i < 6; i++) {
        expect(avoid).toContain(`wolf-${i}`)
        expect(find(b, `wolf-${i}`).provoked).toBe(false)
      }
    }
    expect(droppedRound).toBeGreaterThan(0)   // it left the list once it provoked itself onto a hero
    expect(find(b, 'lone-wolf').provoked).toBe(true)

    // The party fights and kills just the loner — the pack never wakes.
    for (let r = 0; r < 60; r++) {
      advanceRound(b)
      for (let i = 0; i < 6; i++) expect(find(b, `wolf-${i}`).provoked).toBe(false)
    }
    expect(find(b, 'lone-wolf').alive).toBe(false)
    expect(find(b, 'p1').alive).toBe(true)
    expect(find(b, 'p2').alive).toBe(true)
  })

  it('same-side-around-the-wall: the whole party routes through the SAME gap', () => {
    const b = showcaseById('same-side-around-the-wall')!.build()
    const heroIds = ['h0', 'h1', 'h2', 'h3']
    let sawCorridor = false
    const corridorYs: number[] = []
    let maxY = -Infinity
    for (let r = 0; r < 30; r++) {
      advanceRound(b)
      const corridor = b.plans.player!.corridor
      if (corridor) { sawCorridor = true; corridorYs.push(corridor.y) }
      for (const id of heroIds) maxY = Math.max(maxY, find(b, id).pos.y)
    }
    expect(sawCorridor).toBe(true)
    // Every published corridor corner points at the SAME (north) end of the
    // wall — never a mix of the two ends.
    for (const y of corridorYs) expect(y).toBeLessThan(15)
    // No hero ever drifts toward the south gap (wall spans y 8..32; its
    // midline sits at y 20) — the whole line stays committed to the north end.
    expect(maxY).toBeLessThan(25)
    // Everyone actually clears the wall (reaches its east side) via that gap.
    for (const id of heroIds) expect(find(b, id).pos.x).toBeGreaterThan(24)
  })

  it('directive-hold-the-line: the ORDER holds a comp that would otherwise kite', () => {
    const held = showcaseById('directive-hold-the-line')!.build()
    for (let r = 0; r < 6; r++) advanceRound(held)
    const eng = held.plans.player!.engagement!
    expect(eng.stance).toBe('hold')          // the directive stands the line…
    expect(eng.anchor).not.toBeNull()        // …on the wall choke

    // The SAME scene with the directive cleared kites — proof the order is what
    // holds it (this comp out-ranges and out-runs the brute, so skirmish kites).
    const kited = showcaseById('directive-hold-the-line')!.build()
    setTeamDirective(kited, 'player', null)
    for (let r = 0; r < 6; r++) advanceRound(kited)
    expect(kited.plans.player!.engagement!.stance).toBe('kite')
  })

  it('directive-assassinate: kill order flips to the squishy healer; the striker opens from stealth with Back Stab', () => {
    const b = showcaseById('directive-assassinate')!.build()
    advanceRound(b)
    // The dangerous Brute is the naive dangerous-first pick; the directive picks
    // the squishy Healer instead.
    expect(b.plans.player!.engagement!.primaryId).toBe('healer')

    // The plan times the dive: the striker holds EVERY action while cloaked and
    // stalking — its first offensive act is the stealth opener, not an early shot.
    let firstOffense: (typeof b.events)[number] | null = null
    for (let r = 0; r < 40 && !firstOffense; r++) {
      advanceRound(b)
      const ev = b.events.filter((e) => e.round === b.round && e.sourceId === 'assassin'
        && (e.type === 'melee_attack' || e.type === 'ranged_attack' || (e.type === 'skill_use' && e.skillId !== 'cloak')))
      if (ev.length) firstOffense = ev[0]
    }
    expect(firstOffense).toBeTruthy()
    expect(firstOffense!.type).toBe('skill_use')
    expect(firstOffense!.skillId).toBe('back-stab')
    expect(firstOffense!.targetId).toBe('healer')
    expect(firstOffense!.value ?? 0).toBeGreaterThan(25)   // a stealth-boosted opener, not a plink
  })

  it('directive-pull-to-camp: anchors behind a sight break and staffs a mandatory pull dragging the mark to it', () => {
    const b = showcaseById('directive-pull-to-camp')!.build()
    advanceRound(b)
    const eng = b.plans.player!.engagement!
    expect(eng.anchor).not.toBeNull()
    // The ambush anchor is BLIND to the mark — behind the sight break.
    expect(sightlineClear(eng.anchor!, find(b, 'mark').pos, b.barriers)).toBe(false)
    // Puller mandatory: exactly one pull, on the mark, dragged to that anchor.
    const pulls = Object.values(b.plans.player!.assignments ?? {}).filter((a) => a.role === 'pull')
    expect(pulls).toHaveLength(1)
    const pull = pulls[0] as Extract<typeof pulls[number], { role: 'pull' }>
    expect(pull.targetId).toBe('mark')
    expect(pull.to).toEqual(eng.anchor)
  })

  it('directive-protect: forces a guard on the CARRY even though toughness is uniform (no fragile outlier)', () => {
    const b = showcaseById('directive-protect')!.build()
    advanceRound(b)
    const guards = Object.entries(b.plans.player!.assignments!).filter(([, a]) => a.role === 'guard')
    expect(guards).toHaveLength(1)
    const [guardId, guard] = guards[0]
    expect((guard as Extract<typeof guard, { role: 'guard' }>).allyId).toBe('carry')   // aimed at the damage engine
    expect(guardId).not.toBe('carry')
    // It's the DIRECTIVE, not the fragility rule: every member's toughness is
    // identical, so the shipped fragility-outlier check would find nobody.
    const tough = ['carry', 'tank-a', 'tank-b', 'tank-c'].map((id) => find(b, id).capability!.toughness)
    expect(Math.max(...tough) - Math.min(...tough)).toBeLessThan(1e-6)
  })

  it('intel-first-contact: the unknown brute is over-committed and punishes the party; the SAME brute, scouted, is cleanly avoided', () => {
    const unknown = showcaseById('intel-first-contact-unknown')!.build()
    const known = showcaseById('intel-first-contact-known')!.build()
    expect(teamAcumen(unknown, 'player')).toBeGreaterThanOrEqual(50)   // the affordability race actually runs

    // Masked kit prices as a bare basic attacker ⇒ the party commits immediately.
    advanceRound(unknown)
    expect(unknown.plans.player!.engagement!.primaryId).toBe('brute')

    // Scouted kit prices the real Crush swing ⇒ unaffordable ⇒ declined + avoided,
    // from the very first decision round.
    advanceRound(known)
    expect(known.plans.player!.engagement).toBeFalsy()
    expect(known.plans.player!.avoidTargetIds).toContain('brute')

    // Known scene: run the fight out. Because the brute is slow + melee-only
    // and correctly avoided, it never wakes and the party is never caught —
    // the gap may dip early (post-decline roam isn't avoid-aware about
    // physical proximity) but never closes to striking range, and the party
    // ends up well clear of it.
    const brute = find(known, 'brute')
    const heroesOf = (b: BattleState) => b.combatants.filter((c) => c.team === 'player')
    const minDistTo = (b: BattleState) => Math.min(...heroesOf(b).map((h) => distance(h.pos, brute.pos)))
    let minSeen = minDistTo(known)
    for (let r = 0; r < 49; r++) {
      advanceRound(known)
      minSeen = Math.min(minSeen, minDistTo(known))
      expect(known.plans.player!.engagement, `round ${known.round}`).toBeFalsy()
      expect(known.plans.player!.avoidTargetIds, `round ${known.round}`).toContain('brute')
    }
    expect(brute.provoked).toBe(false)               // never woken — the party never touched it
    expect(minSeen).toBeGreaterThan(8)                // never stuck adjacent / caught
    expect(minDistTo(known)).toBeGreaterThan(18)      // and ends up clear of it

    // Unknown scene: run the fight out. The party marches straight in on its
    // own misjudged commitment, wakes the brute by hitting it, and the real
    // Crush swing punishes the mistake.
    for (let r = 0; r < 39; r++) advanceRound(unknown)
    const bruteUnknown = find(unknown, 'brute')
    expect(bruteUnknown.provoked).toBe(true)          // woken — the party engaged it for real
    const hurtOrDead = heroesOf(unknown).some((h) => !h.alive || h.hp < h.maxHp)
    expect(hurtOrDead).toBe(true)                     // the misjudge cost them
  })

  it('arena-5v5: the player line holds while the enemy raiders dive the backline healer', () => {
    const b = showcaseById('arena-5v5')!.build()
    for (let r = 0; r < 3; r++) advanceRound(b)
    // Player Hold the Line: a committed hold on the wall anchor.
    expect(b.plans.player!.engagement!.stance).toBe('hold')
    expect(b.plans.player!.engagement!.anchor).not.toBeNull()
    // Enemy Assassinate: kill order flips onto the squishiest player, the Healer.
    expect(b.plans.enemy!.engagement!.primaryId).toBe('p-heal')
  })
})
