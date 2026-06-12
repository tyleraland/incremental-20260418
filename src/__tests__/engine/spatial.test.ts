// Spatial movement primitives (§spatial): flank to a target's weak side, kite to
// keep range, guard a squishy ally, regroup when isolated. Helpers are pure;
// the movement behaviours are checked through a real round.
import { describe, it, expect } from 'vitest'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { distance } from '@/engine/grid'
import { flankPoint, guardPoint, squishiestAlly, centroid, isCaster, kiteDistanceFor } from '@/engine/spatial'
import { eu, combatant, attackSkill } from './helpers'

const stateOf = (cs: ReturnType<typeof combatant>[]) => ({ combatants: cs } as unknown as BattleState)
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('spatial queries', () => {
  it('flankPoint aims at the side of the target away from its allies', () => {
    const self = combatant({ id: 'p', team: 'player', pos: { x: 2.5, y: 1 } })
    const back = combatant({ id: 'back', team: 'enemy', pos: { x: 2.5, y: 9 } })   // enemy backliner
    const front = combatant({ id: 'front', team: 'enemy', pos: { x: 2.5, y: 7 } }) // its frontline ally
    const fp = flankPoint(self, back, stateOf([self, back, front]), 1)
    expect(fp.y).toBeGreaterThan(back.pos.y)   // behind the backliner, toward the enemy edge
    expect(fp.x).toBeCloseTo(2.5)
  })

  it('guardPoint sits between the ally and the threat', () => {
    const ally = combatant({ id: 'a', pos: { x: 2.5, y: 2 } })
    const threat = combatant({ id: 't', team: 'enemy', pos: { x: 2.5, y: 8 } })
    const gp = guardPoint(ally, threat, 1)
    expect(gp.y).toBeGreaterThan(ally.pos.y)
    expect(gp.y).toBeLessThan(threat.pos.y)
  })

  it('squishiestAlly picks the lowest-defense teammate (not self)', () => {
    const self = combatant({ id: 'p', def: 10 })
    const tank = combatant({ id: 'tank', def: 20 })
    const mage = combatant({ id: 'mage', def: 2 })
    expect(squishiestAlly(self, stateOf([self, tank, mage]))!.id).toBe('mage')
  })

  it('centroid averages positions', () => {
    const c = centroid([combatant({ id: 'a', pos: { x: 0, y: 0 } }), combatant({ id: 'b', pos: { x: 4, y: 2 } })])
    expect(c).toEqual({ x: 2, y: 1 })
  })

  it('isCaster: channel-time spell ⇒ caster; magic-statted with skills ⇒ caster; plain melee ⇒ not', () => {
    const channelSpell = attackSkill({ id: 'chan', channelTime: 2, range: 6 })
    const instantSpell = attackSkill({ id: 'inst', channelTime: 0, range: 6 })
    expect(isCaster(combatant({ skills: [channelSpell] }))).toBe(true)             // has channel spell
    expect(isCaster(combatant({ int: 9, str: 3, skills: [instantSpell] }))).toBe(true)  // magic-statted
    expect(isCaster(combatant({ int: 3, str: 9, skills: [instantSpell] }))).toBe(false) // physical-statted, instant skill
    expect(isCaster(combatant({ skills: [] }))).toBe(false)                        // no skills
  })

  it('kiteDistanceFor: a faster threat pushes the kite hold wider than a slower one', () => {
    // Channel time large enough that the threat-speed term actually dominates
    // (otherwise both fall back to "just inside spell range").
    const caster = combatant({ skills: [attackSkill({ id: 's', channelTime: 3, range: 6 })] })
    const slow = combatant({ id: 'slow', team: 'enemy', moveSpeed: 0.72, meleeRange: 1.2 })
    const fast = combatant({ id: 'fast', team: 'enemy', moveSpeed: 1.26, meleeRange: 1.2 })
    expect(kiteDistanceFor(caster, fast)).toBeGreaterThan(kiteDistanceFor(caster, slow))
  })

  it('kiteDistanceFor: a longer channel spell forces a wider hold than an instant one', () => {
    // Channel difference vs. the same threat — only the long-channel case
    // pushes minSafe past maxRange.
    const inst = combatant({ skills: [attackSkill({ id: 'i', channelTime: 0, range: 6 })] })
    const chan = combatant({ skills: [attackSkill({ id: 'c', channelTime: 4, range: 6 })] })
    const threat = combatant({ id: 'e', team: 'enemy', moveSpeed: 1.26, meleeRange: 1.2 })
    expect(kiteDistanceFor(chan, threat)).toBeGreaterThan(kiteDistanceFor(inst, threat))
  })

  it('kiteDistanceFor anchors on the single-target attack range, not a longer gated AoE', () => {
    // A mage with a range-6 bolt and a range-8 cluster AoE (Lightning Storm) must
    // kite to *bolt* range so its bolts land. Anchoring on the longer AoE range
    // stranded it at AoE range — out of reach of its bolts — while the AoE itself
    // won't fire on a lone foe, so it cast nothing (the "won't take a shot" bug).
    // A stationary threat keeps the safe-distance term out of the way so the test
    // isolates the range anchor.
    const mage = combatant({ int: 24, str: 4, rangedRange: 6, meleeRange: 1.1, skills: [
      attackSkill({ id: 'bolt', channelTime: 0, range: 6 }),
      buildEngineSkill('lightning-storm', 1)!,   // type 'aoe', range 8
    ] })
    const sitting = combatant({ id: 'e', team: 'enemy', moveSpeed: 0, meleeRange: 1.2 })
    expect(kiteDistanceFor(mage, sitting)).toBeCloseTo(5.5)   // 6 (bolt) − 0.5, NOT 7.5 (AoE)
  })
})

describe('movement behaviours', () => {
  it('Kiter backs off when the target gets too close', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'r', rangedRange: 4, maxHp: 500, hp: 500, tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 5, maxHp: 500, hp: 500 })],
    })
    find(b, 'r').pos = { x: 2.5, y: 5 }
    find(b, 'e').pos = { x: 2.5, y: 5.8 }   // well inside the kite range
    advanceRound(b)
    expect(find(b, 'r').pos.y).toBeLessThan(5)   // retreated toward its own edge
  })

  it('Flanker routes toward the locked target\'s rear', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'p', str: 30, tactics: [{ id: 'flanker', rank: 1 }] })],
      enemyUnits: [eu({ id: 'front', team: 'enemy' }), eu({ id: 'back', team: 'enemy' })],
    })
    find(b, 'front').pos = { x: 2.5, y: 7 }
    find(b, 'back').pos = { x: 2.5, y: 9 }
    // The backliner has aggroed p (built threat on it), so the §threat fallback
    // locks 'back' over the nearer 'front' — then Flanker routes around to its rear.
    const p = find(b, 'p'); p.pos = { x: 2.5, y: 5 }; p.lockedTargetId = 'back'; p.threat = { back: 100 }
    advanceRound(b)
    expect(find(b, 'p').pos.y).toBeGreaterThan(5)   // circling toward the backliner's far side
  })

  it('a caster without a Kiter tactic holds and fires instead of kiting (kiting is opt-in)', () => {
    // No movement tactic equipped — the default caster closes to cast range and
    // HOLDS, letting the enemy approach (trust the front line). It does NOT back off;
    // active kiting is opt-in via the Kiter / Wary Caster tactics. It still stops at
    // cast range (not melee) so a melee-weapon mage never marches in mid-channel.
    const channel = buildEngineSkill('lightning-bolt', 1)!
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, str: 3, rangedRange: 6, maxHp: 200, hp: 200, skills: [channel] })],
      enemyUnits: [eu({ id: 'goon', team: 'enemy', spd: 10, str: 5, meleeRange: 1.2 })],
    })
    find(b, 'mage').pos = { x: 5, y: 5 }    // already within cast range of the goon
    find(b, 'goon').pos = { x: 5, y: 6.2 }
    const startY = find(b, 'mage').pos.y
    advanceRound(b)
    expect(find(b, 'mage').pos.y).toBeCloseTo(startY)   // held its ground (no kite back-off)
  })

  it('a caster without a Kiter tactic still closes to cast range if it is too far', () => {
    // The non-kiting default still ADVANCES to firing range — it just won't retreat.
    const channel = buildEngineSkill('lightning-bolt', 1)!
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, str: 3, rangedRange: 6, maxHp: 200, hp: 200, skills: [channel] })],
      enemyUnits: [eu({ id: 'goon', team: 'enemy', str: 5, moveSpeed: 0, meleeRange: 1.2 })],
    })
    find(b, 'mage').pos = { x: 2.5, y: 2 }
    find(b, 'goon').pos = { x: 2.5, y: 13 }   // far — well out of cast range
    const startD = distance(find(b, 'mage').pos, find(b, 'goon').pos)
    advanceRound(b)
    expect(distance(find(b, 'mage').pos, find(b, 'goon').pos)).toBeLessThan(startD)  // closed in
  })

  it('Guardian steps toward the threat side of its squishy ally', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'g', def: 20, tactics: [{ id: 'guardian', rank: 1 }] }), eu({ id: 'mage', def: 2 })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    find(b, 'g').pos = { x: 1, y: 2 }
    find(b, 'mage').pos = { x: 2.5, y: 2 }
    find(b, 'e').pos = { x: 2.5, y: 8 }
    advanceRound(b)
    expect(find(b, 'g').pos.y).toBeGreaterThan(2)   // moved up to interpose
  })

  it('a fast Kiter archer runs the perimeter of a hall maze, firing all the way', () => {
    // 15×15 arena with a central wall block, leaving narrow halls around the
    // perimeter. A fast ranged unit should circle the outside, peeking line of
    // sight around the corners and never stalling — landing dozens of shots on
    // a slow, defensive chaser.
    const fb = { ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0, cooldown: 2 }   // instant + short cd — this test measures kiting cadence, not skill balance
    const b = createBattle({
      playerUnits: [eu({
        id: 'a', spd: 20, int: 20, rangedRange: 4, maxHp: 9999, hp: 9999,
        moveSpeed: 1.3,
        skills: [fb], tactics: [{ id: 'kiter', rank: 1 }],
      })],
      enemyUnits: [eu({
        id: 'g', team: 'enemy', spd: 3, str: 5, def: 200, maxHp: 5000, hp: 5000, meleeRange: 1.2,
        moveSpeed: 0.65,
      })],
      barriers: [{ x: 3, y: 3, w: 9, h: 9, kind: 'wall' }],
      maxRounds: 250,
    })
    find(b, 'a').pos = { x: 1.5, y: 1.5 }
    find(b, 'g').pos = { x: 1.5, y: 2.5 }
    const startG = find(b, 'g').hp
    for (let i = 0; i < 200; i++) advanceRound(b)
    const a = find(b, 'a'), g = find(b, 'g')
    const shots = b.events.filter((e) => e.type === 'skill_use' && e.skillId === 'fire-bolt').length
    const minDist = Math.hypot(a.pos.x - g.pos.x, a.pos.y - g.pos.y)
    expect(a.alive).toBe(true)              // archer survived
    expect(shots).toBeGreaterThan(40)        // landed many shots through the loop
    expect(startG - g.hp).toBeGreaterThan(500) // monster ate sustained damage
    expect(minDist).toBeGreaterThan(1.5)    // never caught (kept its kite gap)
  })

  it('a Kiter pinned at the wall arcs along it instead of pinning into a corner', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'r', rangedRange: 4, maxHp: 999, hp: 999, tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 5, maxHp: 999, hp: 999 })],
    })
    find(b, 'r').pos = { x: 0.5, y: 7.5 }   // pressed against the left wall
    find(b, 'e').pos = { x: 3, y: 7.5 }     // threat to the right, well inside kite range
    const startY = find(b, 'r').pos.y
    for (let i = 0; i < 5; i++) advanceRound(b)
    const r = find(b, 'r')
    expect(Math.abs(r.pos.y - startY)).toBeGreaterThan(0.5)   // moved tangentially along the wall, didn't freeze
  })

  it('a Kiter jammed in a corner breaks out instead of pinning itself taking hits', () => {
    // Mage backed into the bottom-right corner, a slow foe right on top of it
    // (gap ≈ 1). "Away from the foe" points *into* the corner, so an away-biased
    // kiter backs deeper into the dead-end and sits there getting chewed. The
    // breakout should commit to the open lane (north up the east wall), opening
    // distance even though the first step doesn't gain the most clearance.
    const fb = { ...buildEngineSkill('frost-bolt', 3)!, channelTime: 0 }
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 24, str: 2, spd: 12, rangedRange: 6, maxHp: 200, hp: 200, moveSpeed: 0.9, skills: [fb], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 14, def: 8, spd: 4, maxHp: 600, hp: 600, meleeRange: 1.2, moveSpeed: 0.25 })],
    })
    find(b, 'mage').pos = { x: 14.6, y: 14.2 }   // jammed in the bottom-right corner
    find(b, 'e').pos = { x: 13.6, y: 13.9 }       // slow foe right on top of it (gap ≈ 1)
    for (let i = 0; i < 16; i++) advanceRound(b)
    const m = find(b, 'mage'), e = find(b, 'e')
    expect(m.pos.y).toBeLessThan(11)              // broke out of the corner (ran north up the wall)
    expect(Math.hypot(m.pos.x - e.pos.x, m.pos.y - e.pos.y)).toBeGreaterThan(2.5)  // opened real distance
  })

  it('a swarmed Kiter threads the open lane between advancing foes instead of backing into one', () => {
    // Mage dead-center, four melee bruisers closing from W/E/SW/SE — the NORTH
    // lane is open. "Directly away from the nearest" would zig-zag into a chaser;
    // escapeHeading should read the whole cluster and break north through the
    // gap, keeping the kiter alive. Instant-cast so movement isn't channel-bound.
    const fb = { ...buildEngineSkill('frost-bolt', 3)!, channelTime: 0 }
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 24, str: 2, spd: 14, rangedRange: 6, maxHp: 260, hp: 260, moveSpeed: 0.95, skills: [fb], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [0, 1, 2, 3].map((i) => eu({ id: `e${i}`, team: 'enemy', str: 14, def: 8, spd: 9, maxHp: 400, hp: 400, meleeRange: 1.2, moveSpeed: 0.7 })),
    })
    find(b, 'mage').pos = { x: 7.5, y: 7.5 }
    find(b, 'e0').pos = { x: 4.5, y: 9.5 }; find(b, 'e1').pos = { x: 10.5, y: 9.5 }
    find(b, 'e2').pos = { x: 4.5, y: 7.5 }; find(b, 'e3').pos = { x: 10.5, y: 7.5 }
    for (let i = 0; i < 40; i++) advanceRound(b)
    const m = find(b, 'mage')
    expect(m.alive).toBe(true)              // escaped the encirclement (the old "away from nearest" logic died here)
    expect(m.pos.y).toBeLessThan(6)         // broke north through the open lane
  })

  it('a faster Kiter ranged unit opens distance on a slower attacker', () => {
    // Mira-style: high spd + ranged + kiter. Pursuer is melee and slower.
    const fb = { ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }   // instant — we want shots/round, not cast tempo
    const b = createBattle({
      playerUnits: [eu({ id: 'r', spd: 18, int: 20, rangedRange: 4, maxHp: 999, hp: 999, moveSpeed: 1.2, skills: [fb], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', spd: 5, str: 10, maxHp: 999, hp: 999, moveSpeed: 0.72 })],
    })
    find(b, 'r').pos = { x: 7, y: 6 }
    find(b, 'e').pos = { x: 7, y: 8.5 }                // melee distance, threatening
    const startGap = Math.hypot(0, 8.5 - 6)
    for (let i = 0; i < 6; i++) advanceRound(b)
    const r = find(b, 'r'), e = find(b, 'e')
    const endGap = Math.hypot(r.pos.x - e.pos.x, r.pos.y - e.pos.y)
    expect(endGap).toBeGreaterThan(startGap)            // the kiter opened ground on the slower foe
    expect(b.events.some((ev) => ev.type === 'skill_use' && ev.skillId === 'fire-bolt')).toBe(true)
  })

  it('a Kiter caster holds at spell range and casts instead of closing to melee', () => {
    const fireBolt = { ...buildEngineSkill('fire-bolt', 1)!, channelTime: 0 }   // instant — range 6, we want shots/round
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', int: 20, rangedRange: 4, maxHp: 500, hp: 500, skills: [fireBolt], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', str: 10, maxHp: 500, hp: 500 })],
    })
    for (let i = 0; i < 8; i++) advanceRound(b)
    const mage = find(b, 'mage'), e = find(b, 'e')
    expect(Math.hypot(mage.pos.x - e.pos.x, mage.pos.y - e.pos.y)).toBeGreaterThan(3)   // never dragged into melee
    expect(b.events.some((ev) => ev.type === 'skill_use' && ev.skillId === 'fire-bolt')).toBe(true)   // it actually cast
  })

  it('cohesion bias curves a Kiter\'s retreat toward the party, not straight back', () => {
    // Solo kiter retreats due-south away from the threat. Add allies off to
    // the east: the cohesion bias should pull the retreat east-ish so the
    // healer doesn't strand themselves off the front-line flank.
    const fb = buildEngineSkill('fire-bolt', 1)!
    const solo = createBattle({
      playerUnits: [eu({ id: 'r', int: 20, str: 3, rangedRange: 6, maxHp: 500, hp: 500, skills: [fb], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits:  [eu({ id: 'e', team: 'enemy', spd: 20, str: 5, meleeRange: 1.2 })],
    })
    find(solo, 'r').pos = { x: 5, y: 5 }
    find(solo, 'e').pos = { x: 5, y: 6 }   // too close — kiter will back off straight down
    advanceRound(solo)

    const grouped = createBattle({
      playerUnits: [
        eu({ id: 'r',  int: 20, str: 3, rangedRange: 6, maxHp: 500, hp: 500, skills: [fb], tactics: [{ id: 'kiter', rank: 1 }] }),
        eu({ id: 'a1', maxHp: 500, hp: 500 }),
        eu({ id: 'a2', maxHp: 500, hp: 500 }),
      ],
      enemyUnits: [eu({ id: 'e', team: 'enemy', spd: 20, str: 5, meleeRange: 1.2 })],
    })
    find(grouped, 'r').pos  = { x: 5, y: 5 }
    find(grouped, 'a1').pos = { x: 9, y: 6 }   // allies parked east-ish
    find(grouped, 'a2').pos = { x: 9, y: 5 }
    find(grouped, 'e').pos  = { x: 5, y: 6 }
    advanceRound(grouped)

    // Solo retreats due-east-x ≈ 5. With cohesion bias, the same retreat
    // should curve toward the eastern allies.
    expect(find(grouped, 'r').pos.x).toBeGreaterThan(find(solo, 'r').pos.x)
  })
})
