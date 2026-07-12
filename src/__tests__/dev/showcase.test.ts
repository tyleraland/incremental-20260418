// Showcase battles (src/dev/showcaseBattles.ts) — the curated scenes behind the
// sandbox's Showcase source and the `?showcase=<id>` deep-links. Guard that each
// builds deterministically, survives the serialize→replay round-trip a shared
// link relies on, and actually exhibits the behaviour it advertises.
import { describe, it, expect } from 'vitest'
import { SHOWCASES, showcaseById, protectTheCarrySetup } from '@/dev/showcaseBattles'
import {
  serializeBattle, deserializeBattle, advanceRound, distance, teamAcumen, defaultPlanner,
  createBattle, type BattleState, type Planner,
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

  it('focus-fire: converges on the sorcerer, drops it before any ogre', () => {
    const b = showcaseById('focus-fire')!.build()
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

  it("dont-over-pull: fights the stray, avoids the sleeping pack (early window)", () => {
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
  })

  it('hold-the-line: commits stance hold on the gap, toughest members forward', () => {
    const b = showcaseById('hold-the-line')!.build()
    // Check the formation while the engagement is still fresh — the swarm
    // eventually breaches the two-tank line (a 6-v-4 chokepoint isn't a full
    // wall), which is a separate durability question from the formation
    // shape this scene isolates.
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
    const front = Math.min(proj('tank-a'), proj('tank-b'))
    const back = Math.max(proj('mid'), proj('caster'))
    expect(front).toBeGreaterThan(back)
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
})
