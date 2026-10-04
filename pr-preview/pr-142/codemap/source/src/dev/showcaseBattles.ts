// Showcase battles — curated, deterministic scenes that each isolate ONE
// plan-layer behaviour (movement-action-coupling.md) so it can be watched live
// in the Battle Sandbox. Reached by `?sandbox=1&showcase=<id>` (short link) and
// listed in the sandbox's Showcase source dropdown. Pure builders over the
// public engine API — no store, no RNG — so a given id always yields the same
// fight (and the same shareable BSNAP).
//
// Each returns a fresh BattleState at round 0; the sandbox replays it forward
// one engine round per tick. Positions/locks/orders are hand-placed to stage
// the moment; the AI does the rest.

import {
  createBattle, issueMoveOrder, buildEngineSkill,
  type BattleState, type EngineUnitInput, type Barrier, type Combatant, type Posture, type Planner,
} from '@/engine'

// Compact EngineUnitInput builder — hero/monster archetypes for the scenes.
function mk(o: Partial<EngineUnitInput> & Pick<EngineUnitInput, 'id' | 'team'>): EngineUnitInput {
  return {
    name: o.id, str: 8, def: 4, int: 0, spd: 10, magicDef: 0, maxHp: 120, hp: 120,
    preferredRank: 'front', meleeRange: 1.4, rangedRange: 0, moveSpeed: 0.9,
    skills: [], ...o,
  }
}
const at = (b: BattleState, id: string, x: number, y: number) => {
  const c = b.combatants.find((k) => k.id === id)!
  c.pos = { x, y }
  return c
}
const frostBolt = buildEngineSkill('frost-bolt', 3)!
const bash = buildEngineSkill('bash', 3)!
const cloak = buildEngineSkill('cloak', 1)!
const backStab = buildEngineSkill('back-stab', 3)!
// A melee-only heavy swing (§intel scenes below): short cooldown relative to
// its multiplier so its PER-ROUND amortized damage clears the basic attack —
// masking the skill (kit unrevealed) genuinely hides the real threat instead
// of a masked-vs-true wash. No ranged reach at all (range 1.4 = melee).
const crush = { ...bash, id: 'crush', name: 'Crush', range: 1.4, cooldown: 3, channelTime: 0, damageFormula: 'str * 6' }
const BLINK = { kind: 'teleport' as const, range: 8, cooldown: 25, needsLoS: true }

export interface Showcase {
  id: string
  title: string
  blurb: string          // one line — shown as the sandbox caption
  watch: string          // what to look for
  build: () => BattleState
}

// ── 1. Preferred-range anchor (M1/M2): right tool per target ─────────────────
function kiteAnchor(): BattleState {
  // Two identical battlemages (Bash + Frost Bolt). Left faces a magic-IMMUNE
  // golem → anchors MELEE (bolts land 0, so it closes to Bash range). Right
  // faces a squishy caster → holds at bolt range. Same kit, opposite
  // positioning, decided by what actually hits THIS foe. No kite tactic — the
  // default caster hold stops at preferredRangeVs, which IS the point; the foes
  // stand still so each mage settles cleanly at its anchor.
  const mage = (id: string): EngineUnitInput => mk({
    id, team: 'player', name: id, int: 24, str: 12, rangedRange: 6, maxHp: 200, hp: 200,
    meleeRange: 1.4, skills: [{ ...frostBolt }, { ...bash }],
  })
  const b = createBattle({
    playerUnits: [mage('vs-golem'), mage('vs-mage')],
    enemyUnits: [
      mk({ id: 'golem', team: 'enemy', name: 'Stone Golem', str: 10, def: 8, magicDef: 999, maxHp: 500, hp: 500, moveSpeed: 0 }),
      mk({ id: 'sorcerer', team: 'enemy', name: 'Sorcerer', int: 16, str: 2, magicDef: 0, maxHp: 130, hp: 130, moveSpeed: 0 }),
    ],
    mode: 'open', cols: 44, rows: 30,
  })
  at(b, 'vs-golem', 10, 24); at(b, 'golem', 10, 10)
  at(b, 'vs-mage', 34, 24); at(b, 'sorcerer', 34, 10)
  b.combatants.find((c) => c.id === 'vs-golem')!.lockedTargetId = 'golem'
  b.combatants.find((c) => c.id === 'vs-mage')!.lockedTargetId = 'sorcerer'
  return b
}

// ── 2. Blink escape (M4): out of the corner ──────────────────────────────────
function blinkEscape(): BattleState {
  // A blink mage backed into a three-sided cliff pocket by a fast bruiser. When
  // walking can no longer open the gap (cornered), it teleports clear — cliffs
  // don't block the jump — and resumes kiting.
  const barriers: Barrier[] = [
    { x: 15, y: 20, w: 1, h: 9, kind: 'cliff' },   // left arm
    { x: 24, y: 20, w: 1, h: 9, kind: 'cliff' },   // right arm
    { x: 15, y: 28, w: 10, h: 1, kind: 'cliff' },  // back wall
  ]
  const b = createBattle({
    playerUnits: [mk({
      id: 'mage', team: 'player', name: 'Blink Mage', int: 26, str: 2, rangedRange: 6, maxHp: 220, hp: 220,
      moveSpeed: 0.9, skills: [{ ...frostBolt }], tactics: [{ id: 'kiter', rank: 1 }], moveAbilities: [{ ...BLINK }],
    })],
    enemyUnits: [mk({ id: 'bruiser', team: 'enemy', name: 'Bruiser', str: 14, def: 5, maxHp: 600, hp: 600, moveSpeed: 1.15, meleeRange: 1.4 })],
    barriers, mode: 'open', cols: 40, rows: 40,
  })
  at(b, 'mage', 20, 26)      // deep in the pocket
  at(b, 'bruiser', 20, 15)   // charging the mouth
  b.combatants.find((c) => c.id === 'mage')!.lockedTargetId = 'bruiser'
  return b
}

// ── 3. Shoot over the moat (LoS-aware kite): hold, don't path around ──────────
function moatKite(): BattleState {
  // A cliff moat splits mage from mob. The mob can't cross without a long
  // detour, so the mage HOLDS on its side and fires across the gap (LoS over a
  // cliff) instead of walking around into melee.
  const barriers: Barrier[] = [{ x: 0, y: 18, w: 34, h: 3, kind: 'cliff' }]  // horizontal moat, open at the right
  const b = createBattle({
    playerUnits: [mk({
      id: 'mage', team: 'player', name: 'Moat Mage', int: 24, str: 2, rangedRange: 6, maxHp: 200, hp: 200,
      skills: [{ ...frostBolt }], tactics: [{ id: 'kiter', rank: 1 }],
    })],
    enemyUnits: [
      mk({ id: 'grunt-a', team: 'enemy', name: 'Grunt', str: 12, def: 4, maxHp: 160, hp: 160, moveSpeed: 0.9, meleeRange: 1.4 }),
      mk({ id: 'grunt-b', team: 'enemy', name: 'Grunt', str: 12, def: 4, maxHp: 160, hp: 160, moveSpeed: 0.9, meleeRange: 1.4 }),
    ],
    barriers, mode: 'open', cols: 40, rows: 36,
  })
  at(b, 'mage', 14, 26)      // below the moat
  at(b, 'grunt-a', 12, 12); at(b, 'grunt-b', 16, 12)   // above it, no clear walk to the mage
  return b
}

// ── 4. Three stances, one gauntlet (M3 + posture): the toll ring ─────────────
function postureRoutes(): BattleState {
  // Three ARCHER heroes — bold / steady / wary — each ordered ('avoid') to a
  // point FAR on the other side of an identical picket of enemy archers blocking
  // the lane. The heroes out-range the picket (r5 vs r4), so clearing is safe and
  // favourable — which is the whole point: bold prices the crossing affordable
  // and plows straight through (eats the picket's fire, arrives hurt, but keeps
  // going); wary prices it too costly, halts to shoot the picket down from
  // outside its range (takes little), THEN completes the route. steady is
  // between. The destination sits well past the picket so the routing effect —
  // the hero carrying on afterwards — is actually visible.
  const lanes: { id: string; posture: Posture; cx: number }[] = [
    { id: 'bold',   posture: 'bold',   cx: 9 },
    { id: 'steady', posture: 'steady', cx: 25 },
    { id: 'wary',   posture: 'wary',   cx: 41 },
  ]
  const players: EngineUnitInput[] = lanes.map((l) => mk({
    id: l.id, team: 'player', name: l.id.toUpperCase(), str: 20, def: 6, rangedRange: 5, maxHp: 240, hp: 240,
    // Vision below the 16-cell lane spacing so a hero only ever engages its OWN
    // lane's picket (no wandering off to fight a neighbour's).
    moveSpeed: 0.95, meleeRange: 1.4, posture: l.posture, visionRange: 11, tactics: [{ id: 'kiter', rank: 1 }],
  }))
  // A 5-wide picket across each lane at mid-route — a wall the 'avoid' steer
  // can't skirt within the lane, so the hero must plow or clear. Tuned so the
  // straight-corridor price lands between wary's budget (20% hp) and bold's (50%).
  const picket = [-6, -3, 0, 3, 6]
  const enemies: EngineUnitInput[] = []
  for (const l of lanes) for (const _ of picket) {
    enemies.push(mk({ id: `${l.id}-e${enemies.length}`, team: 'enemy', name: 'Archer', str: 8, def: 3, rangedRange: 4, maxHp: 60, hp: 60, moveSpeed: 0 }))
  }
  const b = createBattle({ playerUnits: players, enemyUnits: enemies, mode: 'open', cols: 52, rows: 52 })
  let ei = 0
  for (const l of lanes) {
    at(b, l.id, l.cx, 46)               // start near the bottom edge
    for (const dx of picket) at(b, `${l.id}-e${ei++}`, l.cx + dx, 26)   // picket across the lane, mid-route
    issueMoveOrder(b, l.id, { x: l.cx, y: 6 }, 'avoid')   // destination FAR past the picket
  }
  return b
}

// ── 5. Focus fire (M1): dangerous-first, not nearest-first ──────────────────
function focusFire(): BattleState {
  // Four melee heroes, each standing ADJACENT to its own tanky Ogre (high hp,
  // low threat, skittish — never even swings back), with the Sorcerer (high
  // threat, low hp — killable fast) planted well FARTHER from the party than
  // any ogre. Naive nearest-target would keep every hero on the ogre it's
  // already touching; the plan's dangerous-first, killability-weighted kill
  // order instead pulls everyone PAST their own ogre onto the distant
  // sorcerer — proving the pull is about danger, not proximity (picking the
  // sorcerer here is never the nearest-first answer).
  const hero = (id: string): EngineUnitInput => mk({ id, team: 'player', name: 'Hero', str: 15, maxHp: 200, hp: 200 })
  const b = createBattle({
    playerUnits: ['h1', 'h2', 'h3', 'h4'].map(hero),
    enemyUnits: [
      mk({ id: 'sorcerer', team: 'enemy', name: 'Sorcerer', int: 22, str: 2, def: 0, maxHp: 70, hp: 70, moveSpeed: 0 }),
      // Skittish: won't throw a punch back while ignored, so a hero standing
      // right next to one doesn't get dragged off the kill order by
      // retaliation threat — the scene isolates the plan's OWN convergence
      // pull, not a fight over aggro.
      mk({ id: 'ogre-a', team: 'enemy', name: 'Ogre', str: 10, int: 0, maxHp: 450, hp: 450, moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }] }),
      mk({ id: 'ogre-b', team: 'enemy', name: 'Ogre', str: 10, int: 0, maxHp: 450, hp: 450, moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }] }),
      mk({ id: 'ogre-c', team: 'enemy', name: 'Ogre', str: 10, int: 0, maxHp: 450, hp: 450, moveSpeed: 0, tactics: [{ id: 'skittish', rank: 1 }] }),
    ],
    mode: 'open', cols: 44, rows: 34,
  })
  // Heroes in a tight 2x2 cluster, each starting adjacent to its own ogre
  // (dist ~1) — nearest-first would never leave these. The sorcerer sits well
  // south, clearly farther from the party centroid (11,11) than any ogre —
  // but still within CAMP_RADIUS of every ogre (constants.ts, =6) so the v0
  // kill-order camp sweeps all three ogres in alongside it (this party has no
  // INT, well under ACUMEN.pull) rather than landing any of them on the avoid
  // list — the scene isolates dangerous-first CONVERGENCE, not the separate
  // avoid-list mechanic (that's dont-over-pull's job).
  at(b, 'h1', 10, 10); at(b, 'h2', 12, 10); at(b, 'h3', 10, 12); at(b, 'h4', 12, 12)
  at(b, 'ogre-a', 9, 10); at(b, 'ogre-b', 13, 10); at(b, 'ogre-c', 9, 12)
  at(b, 'sorcerer', 10.5, 15.2)
  return b
}

// ── 6. The puller (M2): tag-and-drag a fringe target, leave the pack asleep ──
function thePuller(): BattleState {
  // A lone Puller darts out and tags an affordable fringe straggler, dragging
  // it back to the waiting line — instead of the whole party closing in and
  // waking the sleeping Dire Wolf pack camped right beside it.
  const b = createBattle({
    playerUnits: [
      mk({
        id: 'puller', team: 'player', name: 'Puller', str: 10, maxHp: 70, hp: 70,
        rangedRange: 5, moveSpeed: 1.2, tactics: [{ id: 'puller', rank: 1 }],
      }),
      mk({ id: 'line-a', team: 'player', name: 'Line', str: 12, maxHp: 150, hp: 150, moveSpeed: 0 }),
      // Carries enough INT alone to clear ACUMEN.pull (50).
      mk({ id: 'line-b', team: 'player', name: 'Line', str: 12, int: 55, maxHp: 150, hp: 150, moveSpeed: 0 }),
    ],
    enemyUnits: [
      mk({
        id: 'fringe', team: 'enemy', name: 'Fringe Straggler', str: 5, maxHp: 100, hp: 100,
        moveSpeed: 0.9, visionRange: 8, tactics: [{ id: 'skittish', rank: 1 }],
      }),
      ...Array.from({ length: 4 }, (_, i) => mk({
        id: `wolf-${i}`, team: 'enemy', name: 'Dire Wolf', str: 8, maxHp: 600, hp: 600, moveSpeed: 0, visionRange: 3,
        tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
      })),
    ],
    mode: 'open', cols: 44, rows: 44,
  })
  at(b, 'line-a', 23, 10); at(b, 'line-b', 25, 10); at(b, 'puller', 24, 18)
  at(b, 'fringe', 24, 34)
  // Wolves camped right beside the fringe target (within pull-assignment
  // range of it) but each carries `skittish` — they never wake on their own.
  const wolfOffsets: [number, number][] = [[-1.2, -1.2], [-1.2, 1.2], [1.2, -1.2], [1.2, 1.2]]
  wolfOffsets.forEach((o, i) => at(b, `wolf-${i}`, 29.5 + o[0], 34 + o[1]))
  return b
}

// ── 7. Don't over-pull (M2): fight the straggler, avoid the sleeping pack ────
function dontOverPull(): BattleState {
  // A cheap, affordable Stray sits between the party and a fat, unaffordable
  // Dire Wolf pack. The pull-set price test keeps the party's fight scoped to
  // the stray alone — the pack lands on the avoid list and never wakes.
  const b = createBattle({
    playerUnits: [
      // Carries enough INT alone to clear ACUMEN.pull (50). hp raised from an
      // original 50 — at 50 the stray (a genuinely "affordable" target, priced
      // that way relative to the fat pack) could still whittle down whichever
      // single hero it locked onto before the party finished it off; the scene
      // is about the AVOID decision, not a coin-flip survival check against the
      // stray itself.
      mk({ id: 'p1', team: 'player', name: 'Scholar', str: 10, int: 55, maxHp: 100, hp: 100 }),
      mk({ id: 'p2', team: 'player', name: 'Fighter', str: 10, maxHp: 100, hp: 100 }),
      mk({ id: 'p3', team: 'player', name: 'Fighter', str: 10, maxHp: 100, hp: 100 }),
    ],
    enemyUnits: [
      mk({ id: 'stray', team: 'enemy', name: 'Stray', str: 5, maxHp: 140, hp: 140, moveSpeed: 0 }),
      ...Array.from({ length: 8 }, (_, i) => mk({
        id: `wolf-${i}`, team: 'enemy', name: 'Dire Wolf', str: 10, maxHp: 5000, hp: 5000, moveSpeed: 0, visionRange: 3,
        tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
      })),
    ],
    mode: 'open', cols: 44, rows: 36,
  })
  at(b, 'p1', 9, 14); at(b, 'p2', 10, 14); at(b, 'p3', 11, 14)
  at(b, 'stray', 10, 20)
  // Fat pack camped beside the stray (~13 cells from the party), never engaged.
  const offsets: [number, number][] = [[-1.2, -1.2], [-1.2, 0], [-1.2, 1.2], [0, -1.2], [0, 1.2], [1.2, -1.2], [1.2, 0], [1.2, 1.2]]
  offsets.forEach((o, i) => at(b, `wolf-${i}`, 22 + o[0], 20 + o[1]))
  return b
}

// ── 8. Hold the line (M3): stance hold + toughest-forward formation ─────────
function holdTheLine(): BattleState {
  // Two wall bars leave a single central gap (the `pg-bottleneck` shape,
  // scaled up). A four-hero party — two tanks, a mid, a fragile caster —
  // holds the gap: the plan commits `stance: 'hold'` and the formation fan
  // seats the toughest members forward, the fragile caster rearmost.
  const barriers: Barrier[] = [
    { x: 0, y: 20, w: 19, h: 1.5, kind: 'wall' },   // left bar (gap 19..22)
    { x: 22, y: 20, w: 22, h: 1.5, kind: 'wall' },  // right bar
  ]
  const b = createBattle({
    playerUnits: [
      mk({ id: 'tank-a', team: 'player', name: 'Tank', str: 15, def: 12, maxHp: 300, hp: 300, meleeRange: 1.4 }),
      mk({ id: 'tank-b', team: 'player', name: 'Tank', str: 15, def: 12, maxHp: 280, hp: 280, meleeRange: 1.4 }),
      mk({ id: 'mid', team: 'player', name: 'Mid', str: 12, def: 6, maxHp: 150, hp: 150, meleeRange: 1.4 }),
      // High INT clears ACUMEN.stance (90) on its own; low hp/def is the
      // formation's fragility outlier.
      mk({ id: 'caster', team: 'player', name: 'Caster', str: 2, def: 0, int: 95, maxHp: 50, hp: 50, rangedRange: 5 }),
    ],
    // 4 (was 6), slower (was the default 0.9), a little frailer (was 40 hp) —
    // a 6-wide swarm crossing at full speed could still route around the
    // two-tank line through the open field beyond the gap and reach the rear
    // slot before the front line finished them off. This is a genuine funnel:
    // few/slow enough that the line kills them before any gets far enough
    // south to flank the caster's FORMATION_REAR-pinned position.
    enemyUnits: Array.from({ length: 4 }, (_, i) => mk({
      id: `swarm-${i}`, team: 'enemy', name: 'Raider', str: 5, maxHp: 25, hp: 25, meleeRange: 1.4, visionRange: 30, moveSpeed: 0.5,
    })),
    barriers, mode: 'open', cols: 44, rows: 40,
  })
  at(b, 'tank-a', 20, 24); at(b, 'tank-b', 21, 24); at(b, 'mid', 20, 25); at(b, 'caster', 21, 25)
  const swarmX = [18, 20, 22, 24]
  swarmX.forEach((x, i) => at(b, `swarm-${i}`, x, 10))
  return b
}

// ── 9. Protect the carry (M3): standing guard on the fragility outlier ──────
// Exported (not just used by the showcase) so the test can build the SAME
// scene with a stripped-assignment planner stub for the damage-reduction
// comparison, without duplicating the setup.
export function protectTheCarrySetup(planner?: Planner): BattleState {
  const guard = (id: string): EngineUnitInput => mk({
    id, team: 'player', name: 'Guardian', str: 15, def: 10, maxHp: 200, hp: 200, meleeRange: 1.2,
  })
  const raider = (id: string): EngineUnitInput => mk({
    id, team: 'enemy', name: 'Raider', str: 8, maxHp: 120, hp: 120, meleeRange: 1.2, visionRange: 20,
  })
  const b = createBattle({
    playerUnits: [
      mk({
        id: 'carry', team: 'player', name: 'Carry', str: 2, int: 20, def: 0, maxHp: 30, hp: 30,
        rangedRange: 5, skills: [{ ...frostBolt }],
      }),
      guard('tank-a'), guard('tank-b'), guard('tank-c'),
    ],
    enemyUnits: [raider('raider-0'), raider('raider-1'), raider('raider-2')],
    mode: 'open', cols: 40, rows: 40, planner,
  })
  at(b, 'carry', 10, 20)
  at(b, 'tank-a', 9, 18); at(b, 'tank-b', 10, 18); at(b, 'tank-c', 11, 18)
  at(b, 'raider-0', 10, 10); at(b, 'raider-1', 11, 10); at(b, 'raider-2', 9, 10)
  return b
}
function protectTheCarry(): BattleState { return protectTheCarrySetup() }

// ── 10. Stance by comp (M3): the whole line kites, nobody equipped Kiter ────
function stanceByComp(): BattleState {
  // An all-ranged, fast party outranges and outruns a single slow melee
  // brute — the plan reads that from composition alone and commits
  // `stance: 'kite'`, so the default hold execution kites for every archer
  // even though none of them carries the Kiter tactic.
  const archer = (id: string): EngineUnitInput => mk({
    id, team: 'player', name: 'Ranger', str: 15, int: 25, maxHp: 80, hp: 80, moveSpeed: 1.0, rangedRange: 6,
  })
  const b = createBattle({
    playerUnits: ['h0', 'h1', 'h2', 'h3'].map(archer),
    enemyUnits: [mk({ id: 'brute', team: 'enemy', name: 'Brute', str: 15, maxHp: 300, hp: 300, moveSpeed: 0.8, meleeRange: 1.4 })],
    mode: 'open', cols: 40, rows: 30,
  })
  at(b, 'h0', 9, 20); at(b, 'h1', 10, 20); at(b, 'h2', 11, 20); at(b, 'h3', 10, 21)
  at(b, 'brute', 10, 8)
  return b
}

// ── 11. Kill the shaman (marquee): enemy coordination collapses with its int ─
function killTheShaman(): BattleState {
  // A wolf pack + Shaman (int 95 — alone clears both the pull and stance
  // gates for the whole pack while it lives) fights the party smart: a real
  // engagement, coordinated stance. Heroes naturally dangerous-first the
  // shaman (huge threat, low hp) — kill it and the pack's team acumen craters
  // under both gates, visibly reverting to v0's blind camp-radius sweep.
  const barriers: Barrier[] = [{ x: 15, y: 10, w: 10, h: 1, kind: 'wall' }]
  const heroUnit = (id: string): EngineUnitInput => mk({
    id, team: 'player', name: 'Hero', str: 12, def: 2, maxHp: 120, hp: 120, meleeRange: 1.4,
  })
  const wolf = (id: string): EngineUnitInput => mk({
    id, team: 'enemy', name: 'Wolf', str: 10, maxHp: 150, hp: 150, moveSpeed: 0.9, meleeRange: 1.4,
  })
  const b = createBattle({
    playerUnits: ['h0', 'h1', 'h2', 'h3'].map(heroUnit),
    enemyUnits: [
      mk({ id: 'shaman', team: 'enemy', name: 'Shaman', str: 2, int: 95, maxHp: 50, hp: 50, moveSpeed: 0.9, meleeRange: 1.4 }),
      ...['w0', 'w1', 'w2', 'w3', 'w4', 'w5'].map(wolf),
    ],
    barriers, mode: 'open', cols: 44, rows: 40,
  })
  at(b, 'h0', 19, 32); at(b, 'h1', 20, 32); at(b, 'h2', 21, 32); at(b, 'h3', 20, 33)
  at(b, 'shaman', 20, 22)
  const wolfPos: [number, number][] = [[17, 18], [19, 18], [21, 18], [23, 18], [18, 19], [22, 19]]
  wolfPos.forEach((p, i) => at(b, `w${i}`, p[0], p[1]))
  return b
}

// ── 12. Fold when losing (M2): the party knows when to cut losses ───────────
function foldWhenLosing(): BattleState {
  // A tanky Vanguard plants on a Camp Boss the party can just barely afford
  // (a genuine mutual-TTK race, not a landslide) while three teammates stand
  // clear. The boss's raw STR prices as real danger (RTD), but its huge DEF
  // means only the Vanguard — the one hero actually in melee — ever lands or
  // takes a hit; the coarse pull-price (a flat sum over capabilities, no
  // per-matchup mitigation — tactical-coordination.md §3.3) can't see that, so
  // the fight looks evenly costed on paper while draining one hero for real.
  // As HP drains, the LIVE re-price (decideEngagement's fast path) keeps
  // recomputing RTD off the shrinking pool; once it crosses the ENGAGE_EXIT
  // hysteresis the party's shared commitment breaks — `engagement` drops —
  // while the Vanguard and all three teammates are still standing. Pre-M2 the
  // party had no notion of "this is now a losing trade": it would have just
  // kept swinging until someone died.
  const b = createBattle({
    playerUnits: [
      mk({ id: 'scholar', team: 'player', name: 'Scholar', str: 12, def: 4, int: 55, maxHp: 150, hp: 150 }),
      mk({ id: 'fighter-a', team: 'player', name: 'Fighter', str: 12, def: 4, maxHp: 150, hp: 150 }),
      mk({ id: 'fighter-b', team: 'player', name: 'Fighter', str: 12, def: 4, maxHp: 150, hp: 150 }),
      // Deliberately huge hp: with only one hero ever physically in melee range
      // of a solo boss, ALL of its damage concentrates on whoever's touching
      // it — the Vanguard needs a pool big enough to still be standing when
      // the TEAM's price (summed over all four) crosses the exit bar.
      mk({ id: 'vanguard', team: 'player', name: 'Vanguard', str: 12, def: 4, maxHp: 900, hp: 900 }),
    ],
    enemyUnits: [
      mk({
        id: 'boss', team: 'enemy', name: 'Camp Boss', str: 40, def: 100, maxHp: 1200, hp: 1200, moveSpeed: 0, meleeRange: 1.4,
      }),
    ],
    mode: 'open', cols: 44, rows: 36,
  })
  // The Vanguard starts already adjacent (locks + trades from round one) so
  // it — not whichever teammate the id/tiebreak order happens to favour —
  // is deterministically the one the boss ever touches.
  at(b, 'scholar', 9, 10); at(b, 'fighter-a', 10, 10); at(b, 'fighter-b', 11, 10); at(b, 'vanguard', 10, 19)
  at(b, 'boss', 10, 20)
  return b
}

// ── 13. Wake one, not the herd (M2): the avoid list is live, not a snapshot ─
function wakeOneNotTheHerd(): BattleState {
  // A lone AGGRESSIVE wolf (no skittish — hostile from spawn) stands beside a
  // sleeping Dire Wolf pack (skittish + pack-tactics — never wakes on its
  // own). Both are visible to the party from round 0; the lone wolf's own
  // pull-price reads as too costly in isolation to commit to on paper (a
  // deliberately padded HP pool — see `foldWhenLosing`'s note on the coarse
  // price ignoring the party's own DEF), so at the FIRST decision round
  // EVERYTHING — the lone wolf AND all six pack wolves — lands on
  // avoidTargetIds. But the lone wolf doesn't care what the plan priced: it's
  // provoked from spawn, closes the gap on its own, and locks a hero within
  // that same round. From the very next decision round on, `alreadyFighting`
  // (teamplan.ts) reads that self-provoked lock/threat and the SAME id drops
  // off avoidTargetIds automatically — "a foe that provokes itself onto the
  // party leaves the list automatically because it enters the fight"
  // (tactical-coordination.md §3.3) — while the pack, never provoked, never
  // moves off it. avoidTargetIds is recomputed fresh every decision round
  // from LIVE state, not a fixed snapshot from the round the fight started:
  // that's what lets one id leave the list while its neighbours stay on it.
  const b = createBattle({
    playerUnits: [
      mk({ id: 'p1', team: 'player', name: 'Scholar', str: 14, def: 130, int: 55, maxHp: 250, hp: 250 }),
      mk({ id: 'p2', team: 'player', name: 'Fighter', str: 14, def: 130, maxHp: 250, hp: 250 }),
    ],
    enemyUnits: [
      mk({
        id: 'lone-wolf', team: 'enemy', name: 'Lone Wolf', str: 70, maxHp: 210, hp: 210,
        moveSpeed: 1.1, meleeRange: 1.4, visionRange: 30,
      }),
      ...Array.from({ length: 6 }, (_, i) => mk({
        id: `wolf-${i}`, team: 'enemy', name: 'Dire Wolf', str: 10, maxHp: 5000, hp: 5000, moveSpeed: 0, visionRange: 3,
        tactics: [{ id: 'skittish', rank: 1 }, { id: 'pack-tactics', rank: 1 }],
      })),
    ],
    mode: 'open', cols: 44, rows: 36,
  })
  at(b, 'p1', 9, 14); at(b, 'p2', 11, 14)
  at(b, 'lone-wolf', 10, 24)
  const offsets: [number, number][] = [[-1.2, -1.2], [-1.2, 0], [-1.2, 1.2], [0, -1.2], [0, 1.2], [1.2, -1.2]]
  offsets.forEach((o, i) => at(b, `wolf-${i}`, 22 + o[0], 20 + o[1]))
  return b
}

// ── 14. Same side around the wall (M3): the party routes as one ─────────────
function sameSideAroundTheWall(): BattleState {
  // A vertical wall bar (open at both the north and south ends) splits the
  // party from prey clear on the other side of the map. Nothing forces which
  // end to use — this is exactly the "route the same way" question
  // HERD_BIAS used to fudge with a global left tax. Instead the planner
  // publishes ONE shared `corridor` (the first steerAround corner from the
  // party's own centroid to the shared waypoint — tactical-coordination.md
  // §3.4) and every member's own roam-toward-waypoint step aims at that same
  // point, so the whole party commits to the same gap instead of some of them
  // peeling off toward the closer-looking end. Heroes get finite vision (the
  // default is infinite, which would fold "engaged" over the whole map before
  // they ever set out) so the crossing is a real hunt-and-route, not an
  // instant lock from across the level.
  const barriers: Barrier[] = [{ x: 20, y: 8, w: 2, h: 24, kind: 'wall' }]   // spans y 8..32; open above/below
  const hero = (id: string): EngineUnitInput => mk({
    id, team: 'player', name: 'Hero', str: 12, def: 4, maxHp: 150, hp: 150, moveSpeed: 0.9, meleeRange: 1.4, visionRange: 14,
  })
  const b = createBattle({
    playerUnits: ['h0', 'h1', 'h2', 'h3'].map(hero),
    enemyUnits: [
      // A distant, tanky lure the party hunts toward but can't reach within
      // the routing window — the scene isolates the APPROACH, not the fight.
      mk({ id: 'prey', team: 'enemy', name: 'Prey', str: 5, def: 2, maxHp: 8000, hp: 8000, moveSpeed: 0, visionRange: 0 }),
    ],
    barriers, mode: 'open', cols: 60, rows: 40,
  })
  at(b, 'h0', 8, 18); at(b, 'h1', 9, 20); at(b, 'h2', 8, 22); at(b, 'h3', 10, 20)
  at(b, 'prey', 50, 20)
  return b
}

// ── 15. Directive — Hold the Line (M4): the ORDER forces the anchor ─────────
function directiveHoldTheLine(): BattleState {
  // The same kind of all-ranged, out-runs-and-out-ranges comp that
  // `stance-by-comp` reads as a KITE from composition alone — but here the
  // player has set the `hold-the-line` directive, whose `stanceBias: 'hold'`
  // overrides the viable kite and stands the line on the nearest chokepoint.
  // Contrast the two scenes back-to-back: identical instinct (the planner
  // WOULD kite), opposite behaviour, because the order says hold.
  const barriers: Barrier[] = [{ x: 6, y: 20, w: 6, h: 1.2, kind: 'wall' }]   // a bar beside the party = the choke to anchor
  const archer = (id: string, int: number): EngineUnitInput => mk({
    id, team: 'player', name: 'Ranger', str: 12, int, maxHp: 90, hp: 90, moveSpeed: 1.1, rangedRange: 6,
    skills: [{ ...frostBolt }],
  })
  const b = createBattle({
    playerUnits: [archer('r-anchor', 100), archer('r-2', 20), archer('r-3', 20)],
    // A slow melee brute the archers out-range (6 vs melee) and out-run — the
    // kite gate would clear, so skirmish kites; the directive holds instead.
    enemyUnits: [mk({ id: 'brute', team: 'enemy', name: 'Brute', str: 15, def: 4, maxHp: 400, hp: 400, moveSpeed: 0.45, meleeRange: 1.4, visionRange: 30 })],
    barriers, mode: 'open', cols: 40, rows: 30, playerDirective: 'hold-the-line',
  })
  at(b, 'r-anchor', 10, 22); at(b, 'r-2', 11, 22); at(b, 'r-3', 9, 23)
  at(b, 'brute', 10, 8)
  return b
}

// ── 16. Directive — Assassinate + ambush timing (M4): the orchestrated dive ──
function directiveAssassinate(): BattleState {
  // Under the `assassinate` directive the kill order flips to the squishiest
  // target — the enemy HEALER over the beefy Brute — and a cloak-capable
  // striker is timed by the PLAN: it vanishes, stalks the healer, and holds
  // EVERY action (no early bow shots) until Back Stab range, then opens from
  // stealth. The party's INT (the lone Sage) clears ACUMEN.ambush so the
  // timing engages; below it the striker would reveal early.
  const b = createBattle({
    playerUnits: [
      mk({
        id: 'assassin', team: 'player', name: 'Assassin', str: 14, maxHp: 90, hp: 90,
        rangedRange: 6, moveSpeed: 1.05, skills: [{ ...cloak }, { ...backStab }], tactics: [{ id: 'ambusher', rank: 1 }],
      }),
      // The brains: enough INT alone to clear ACUMEN.ambush (150). Hangs back.
      mk({ id: 'sage', team: 'player', name: 'Sage', str: 8, int: 160, maxHp: 90, hp: 90, moveSpeed: 0 }),
    ],
    enemyUnits: [
      // Squishy + carries Heal ⇒ the flipped kill order's primary.
      mk({ id: 'healer', team: 'enemy', name: 'Healer', str: 2, int: 8, def: 0, maxHp: 70, hp: 70, moveSpeed: 0, visionRange: 20, skills: [buildEngineSkill('heal', 2)!] }),
      // Fat and dangerous — the dangerous-FIRST pick, pointedly NOT the target
      // under Assassinate. `skittish` keeps it dormant (non-provoked) so it never
      // joins the healer's pull-set — the party can price and take the healer
      // alone, isolating the kill-order flip + the timed dive.
      mk({ id: 'brute', team: 'enemy', name: 'Brute', str: 40, def: 6, maxHp: 260, hp: 260, moveSpeed: 0, visionRange: 6, tactics: [{ id: 'skittish', rank: 1 }] }),
    ],
    mode: 'open', cols: 40, rows: 30, playerDirective: 'assassinate',
  })
  // The striker starts clear of both foes (>6 cells) so it can Cloak on turn one.
  at(b, 'assassin', 10, 18); at(b, 'sage', 32, 26)
  at(b, 'healer', 10, 5); at(b, 'brute', 15, 5)
  return b
}

// ── 17. Directive — Pull to Camp (M4): mandatory, ambush-anchored ───────────
function directivePullToCamp(): BattleState {
  // The `pull-to-camp` directive makes the pull MANDATORY and anchors it behind
  // a sight break. Wall A stands between the party and the mark; Wall B sits
  // behind the party, its corners BLIND to the mark (A blocks the line) — the
  // ambush spot. The designated Puller tags the mark and drags it around the
  // corner to that blind anchor. Contrast `the-puller` (an opportunistic M2
  // fringe pull); here the order + the ground force an achieved ambush.
  const barriers: Barrier[] = [
    { x: 16, y: 10, w: 8, h: 1, kind: 'wall' },   // wall A — between party and mark
    { x: 18, y: 18, w: 4, h: 1, kind: 'wall' },   // wall B — behind the party (the blind anchor)
  ]
  const b = createBattle({
    playerUnits: [
      mk({ id: 'puller', team: 'player', name: 'Puller', str: 10, maxHp: 90, hp: 90, rangedRange: 5, moveSpeed: 1.2, visionRange: 22, tactics: [{ id: 'puller', rank: 1 }] }),
      // Enough INT alone to clear ACUMEN.ambush (150) so the ambush anchor engages.
      mk({ id: 'sage', team: 'player', name: 'Sage', str: 10, int: 160, maxHp: 90, hp: 90, moveSpeed: 0.9, visionRange: 22 }),
      mk({ id: 'line', team: 'player', name: 'Line', str: 12, maxHp: 120, hp: 120, moveSpeed: 0.9, visionRange: 22 }),
    ],
    enemyUnits: [mk({ id: 'mark', team: 'enemy', name: 'Mark', str: 4, maxHp: 60, hp: 60, moveSpeed: 0.9, visionRange: 3 })],
    barriers, mode: 'open', cols: 40, rows: 34, playerDirective: 'pull-to-camp',
  })
  at(b, 'puller', 19, 16); at(b, 'sage', 21, 16); at(b, 'line', 20, 16)
  at(b, 'mark', 20, 5)
  return b
}

// ── 18. Directive — Protect (M4): a guard on the carry, no outlier needed ────
function directiveProtect(): BattleState {
  // A UNIFORM-toughness party (no fragility outlier — so the shipped rule would
  // assign no guard at all) under the `protect` directive. The directive forces
  // a standing guard and aims it at the CARRY — the party's damage engine (top
  // sustained damage), here the ranged striker — not a squishy. One tank peels
  // to body-block the raiders diving the carry. Contrast `protect-the-carry`,
  // where the guard is planner-DERIVED from a fragile outlier.
  const tank = (id: string): EngineUnitInput => mk({
    id, team: 'player', name: 'Guardian', str: 10, def: 6, maxHp: 140, hp: 140, meleeRange: 1.4, visionRange: 20,
  })
  const b = createBattle({
    playerUnits: [
      // Same toughness as the tanks (maxHp/def) so it is NOT a fragility outlier;
      // top raw sustained (str 30, fires at range) ⇒ the 'carry' capability pick.
      mk({ id: 'carry', team: 'player', name: 'Carry', str: 30, def: 6, maxHp: 140, hp: 140, rangedRange: 6, moveSpeed: 1.0, visionRange: 20 }),
      tank('tank-a'), tank('tank-b'), tank('tank-c'),
    ],
    enemyUnits: [
      mk({ id: 'raider-0', team: 'enemy', name: 'Raider', str: 10, maxHp: 120, hp: 120, moveSpeed: 0.9, meleeRange: 1.4, visionRange: 24 }),
      mk({ id: 'raider-1', team: 'enemy', name: 'Raider', str: 10, maxHp: 120, hp: 120, moveSpeed: 0.9, meleeRange: 1.4, visionRange: 24 }),
      mk({ id: 'raider-2', team: 'enemy', name: 'Raider', str: 10, maxHp: 120, hp: 120, moveSpeed: 0.9, meleeRange: 1.4, visionRange: 24 }),
    ],
    mode: 'open', cols: 40, rows: 34, playerDirective: 'protect',
  })
  // Carry hangs back; tanks a step ahead; raiders charge from the north.
  at(b, 'carry', 20, 26); at(b, 'tank-a', 19, 23); at(b, 'tank-b', 20, 23); at(b, 'tank-c', 21, 23)
  at(b, 'raider-0', 19, 9); at(b, 'raider-1', 20, 9); at(b, 'raider-2', 21, 9)
  return b
}

// ── 19. Intel — first contact misjudges an unknown species (§3.7) ───────────
// A three-hero party facing ONE lone "brute" — a very strong, very SLOW,
// MELEE-ONLY beast (no ranged reach at all) whose real threat is a heavy Crush
// swing, but whose BASIC attack (all a masked kit reads as) is unremarkable.
// `masked` is the whole scene: an unknown first contact prices the hidden Crush
// as a harmless basic attacker and COMMITS (over-pulls into a fight it can't
// afford, and pays for it once the brute wakes and swings for real); the same
// brute fully scouted prices the real Crush, finds the trade unaffordable, and
// AVOIDS it. Because the brute is slow + melee-only (unlike an earlier draft
// of this pair built around a ranged one-shot wraith — see BACKLOG §AI &
// coordination for why that draft was scrapped), avoiding it isn't just a
// plan-state flag: the party actually walks away and the brute never lands a
// hit — a CLEAN escape, not a stalemate. It's tagged `skittish` (asleep until
// hit) so a correctly-avoided brute never wakes on its own; the unknown scene's
// party wakes it itself by walking up and swinging.
//
// The party clears ACUMEN.pull (the lone Scholar) so the affordability race
// actually runs — the ONLY thing that changes between the two scenes is what
// the party KNOWS. Staged, not learned: a pure builder can't run the store's
// reveal loop, so the two knowledge states ship as adjacent scenes to make the
// flip legible. Positions are placed far apart (~27 cells) in a big arena —
// tuned (see PR notes) so the known scene's post-decline roam, which isn't
// avoid-aware about physical proximity (BACKLOG §AI & coordination,
// "Roam-into-avoided-camp gets stuck"), never coincidentally wanders the party
// back into melee range of the sleeping brute.
function intelContact(masked: boolean): BattleState {
  const b = createBattle({
    playerUnits: [
      mk({ id: 'scholar', team: 'player', name: 'Scholar', str: 8, int: 60, maxHp: 90, hp: 90, moveSpeed: 0.9, meleeRange: 1.4 }),
      mk({ id: 'fighter-a', team: 'player', name: 'Fighter', str: 12, maxHp: 90, hp: 90, moveSpeed: 0.9, meleeRange: 1.4 }),
      mk({ id: 'fighter-b', team: 'player', name: 'Fighter', str: 12, maxHp: 90, hp: 90, moveSpeed: 0.9, meleeRange: 1.4 }),
    ],
    enemyUnits: [mk({
      id: 'brute', team: 'enemy', name: 'Brute', str: 14, def: 6, maxHp: 400, hp: 400, moveSpeed: 0.1,
      rangedRange: 0, meleeRange: 1.4, visionRange: 20, skills: [{ ...crush }],
      tactics: [{ id: 'skittish', rank: 1 }],
      ...(masked ? { intel: {} } : {}),
    })],
    mode: 'open', cols: 44, rows: 40,
  })
  at(b, 'scholar', 11, 33); at(b, 'fighter-a', 12, 33); at(b, 'fighter-b', 13, 33)
  at(b, 'brute', 12, 5)
  return b
}
function intelUnknown(): BattleState { return intelContact(true) }
function intelKnown(): BattleState { return intelContact(false) }

// ── 20. 5v5 arena (M4 §3.6): two teams, two directives, one team fight ──────
function arena5v5(): BattleState {
  // The LoL-style capstone: both sides run a directive. The player line holds
  // (`hold-the-line`) — three tanks anchor a wall choke, the Sage fires from
  // range, the Healer tops them up from the rear. The enemy raiders run
  // `assassinate` — their kill order flips off the tanks and onto the squishiest
  // player, the Healer, and they dive it. Tanks anchor, carry pokes, the divers
  // knife for the backline.
  const barriers: Barrier[] = [{ x: 6, y: 14, w: 6, h: 1.2, kind: 'wall' }]
  const b = createBattle({
    playerUnits: [
      mk({ id: 'p-tank1', team: 'player', name: 'Tank', str: 15, def: 8, maxHp: 200, hp: 200, meleeRange: 1.4, visionRange: 30 }),
      mk({ id: 'p-tank2', team: 'player', name: 'Tank', str: 15, def: 8, maxHp: 200, hp: 200, meleeRange: 1.4, visionRange: 30 }),
      mk({ id: 'p-tank3', team: 'player', name: 'Tank', str: 15, def: 8, maxHp: 200, hp: 200, meleeRange: 1.4, visionRange: 30 }),
      // The Sage carries the party's stance acumen (ACUMEN.stance 90) on its own.
      mk({ id: 'p-sage', team: 'player', name: 'Sage', str: 5, int: 100, maxHp: 80, hp: 80, rangedRange: 6, moveSpeed: 0.9, visionRange: 30, skills: [{ ...frostBolt }] }),
      mk({ id: 'p-heal', team: 'player', name: 'Healer', str: 2, int: 12, def: 0, maxHp: 60, hp: 60, rangedRange: 5, moveSpeed: 0.9, visionRange: 30, skills: [buildEngineSkill('heal', 2)!] }),
    ],
    enemyUnits: Array.from({ length: 5 }, (_, i) => mk({
      id: `raider${i}`, team: 'enemy', name: 'Raider', str: 9, def: 3, maxHp: 90, hp: 90, moveSpeed: 0.7, meleeRange: 1.4, visionRange: 30,
    })),
    barriers, mode: 'open', cols: 40, rows: 34, playerDirective: 'hold-the-line', enemyDirective: 'assassinate',
  })
  at(b, 'p-tank1', 10, 18); at(b, 'p-tank2', 11, 18); at(b, 'p-tank3', 9, 18)
  at(b, 'p-sage', 10, 20); at(b, 'p-heal', 11, 20)
  const rx = [8, 9, 10, 11, 12]
  rx.forEach((x, i) => at(b, `raider${i}`, x, 8))
  return b
}

export const SHOWCASES: Showcase[] = [
  {
    id: 'kite-anchor',
    title: 'Right range per target',
    blurb: 'Same battlemage kit — melees the magic-immune golem, ranges the squishy sorcerer.',
    watch: 'The left mage closes to Bash (bolts do nothing to the golem); the right holds at bolt range.',
    build: kiteAnchor,
  },
  {
    id: 'blink-escape',
    title: 'Escape the corner',
    blurb: 'A blink mage cornered in a cliff pocket teleports clear instead of dying against the wall.',
    watch: 'It shuffles briefly, then blinks out over the cliff when walking can no longer open the gap.',
    build: blinkEscape,
  },
  {
    id: 'moat-kite',
    title: 'Shoot over the moat',
    blurb: 'A cliff splits the mage from the mob — it holds and fires across instead of pathing into melee.',
    watch: 'The mage never crosses; it stands on its side of the moat and keeps casting.',
    build: moatKite,
  },
  {
    id: 'posture-routes',
    title: 'Three stances, one gauntlet',
    blurb: 'Bold / steady / wary archers ordered past an identical picket — the posture dial alone decides how each crosses.',
    watch: 'BOLD drives straight through and reaches the far side first (takes some fire); WARY halts to shoot the picket down from outside its range, then follows — unhurt but last. Both routes continue well past the enemies. (Debug tab → Plan → route price / ⚔ clearing.)',
    build: postureRoutes,
  },
  {
    id: 'focus-fire',
    title: 'Dangerous first, not nearest first',
    blurb: 'Four heroes each start ADJACENT to their own tanky ogre, with the squishy sorcerer planted well FARTHER away — the party converges PAST the ogres onto the distant sorcerer instead.',
    watch: 'Every hero breaks off the ogre it starts touching and marches to the distant sorcerer instead — locks it within a round or two and drops it before any ogre takes a scratch. (Debug tab → Plan → engagement.primaryId.)',
    build: focusFire,
  },
  {
    id: 'the-puller',
    title: 'The puller',
    blurb: 'One hero darts out, tags a lone straggler, and drags it back to the waiting line — the Dire Wolf pack camped right beside it never wakes.',
    watch: 'The puller breaks off alone, lands the tag, then walks the straggler back toward the line while the wolves stay asleep. (Debug tab → Plan → assignments.)',
    build: thePuller,
  },
  {
    id: 'dont-over-pull',
    title: "Don't over-pull",
    blurb: 'The party fights an affordable straggler and pointedly ignores the fat, unaffordable Dire Wolf pack sleeping beside it — then roams away instead of marching into it.',
    watch: 'The party engages only the straggler, kills it, then roams off in another direction; the wolf pack sits on the avoid list and stays asleep the whole time. (Debug tab → Plan → acumen ≥ 50, avoidTargetIds.)',
    build: dontOverPull,
  },
  {
    id: 'hold-the-line',
    title: 'Hold the line',
    blurb: 'A mixed party forms up on a wall gap — tanks in front, the fragile caster tucked in the rear — and actually holds it while a swarm breaks on the line.',
    watch: 'The party commits `stance: hold` and settles into a two-rank fan on the gap, toughest members forward; the caster stays rearmost and never gets touched as the swarm dies on the tanks. (Debug tab → Plan → stance / anchor.)',
    build: holdTheLine,
  },
  {
    id: 'protect-the-carry',
    title: 'Protect the carry',
    blurb: 'A tough hero peels off to body-block between the fragile carry and the raiders diving it.',
    watch: 'One Guardian hangs back on a standing-guard assignment instead of piling into the fight. (Debug tab → Plan → assignments → role: guard.)',
    build: protectTheCarry,
  },
  {
    id: 'stance-by-comp',
    title: 'Stance from composition alone',
    blurb: 'An all-ranged, fast party kites a slow melee brute — nobody equipped Kiter; the plan chose it from the comp.',
    watch: 'The whole line holds range and backs off as the brute closes, never collapsing to melee. (Debug tab → Plan → stance: kite.)',
    build: stanceByComp,
  },
  {
    id: 'kill-the-shaman',
    title: 'Kill the shaman',
    blurb: "A wolf pack fights smart while its Shaman lives — kill the shaman and its coordination visibly collapses.",
    watch: "The enemy plan holds a real stance while the shaman's alive; watch enemy acumen cross the gate in Debug → Plan the instant it dies.",
    build: killTheShaman,
  },
  {
    id: 'fold-when-losing',
    title: 'Fold when losing — and flee',
    blurb: 'A party commits to a boss it can just barely afford — as the trade turns against it, it breaks off and physically RETREATS while everyone is still standing.',
    watch: 'Engagement locks onto the boss round one; watch it drop AND a `rout` appear in Debug → Plan as the live re-price crosses the exit bar — the Vanguard then peels off the boss and backs away instead of dying on it. (Debug tab → Plan → rout.)',
    build: foldWhenLosing,
  },
  {
    id: 'wake-one-not-the-herd',
    title: 'Wake one, not the herd',
    blurb: 'A lone aggressive wolf and a sleeping Dire Wolf pack both start on the avoid list — the moment the loner attacks on its own, it (and only it) drops off.',
    watch: 'Every wolf sits on avoidTargetIds at round one; the lone wolf locks a hero and leaves the list the next decision round while the pack — never provoked — stays on it for the whole fight. (Debug tab → Plan → avoidTargetIds.)',
    build: wakeOneNotTheHerd,
  },
  {
    id: 'same-side-around-the-wall',
    title: 'Same side around the wall',
    blurb: 'A wall open at both ends splits the party from its prey — the whole line commits to the SAME gap instead of splitting left and right.',
    watch: "The party's shared `corridor` points at one end of the wall the whole approach; every hero clears the wall on that same side. (Debug tab → Plan → corridor.)",
    build: sameSideAroundTheWall,
  },
  {
    id: 'directive-hold-the-line',
    title: 'Directive: Hold the Line',
    blurb: 'The same out-runs-everything comp that `stance-by-comp` reads as a KITE instead stands and holds — because the player set the Hold the Line directive. The order overrides the instinct.',
    watch: 'Skirmish would kite this brute; under the directive the plan commits `stance: hold` and anchors the wall choke, the line never backing off. Compare with `stance-by-comp` (same comp, no order → kite). (Debug tab → Plan → stance / anchor.)',
    build: directiveHoldTheLine,
  },
  {
    id: 'directive-assassinate',
    title: 'Directive: Assassinate',
    blurb: 'Under the Assassinate directive the kill order flips to the enemy healer, and a cloaked striker is timed by the plan — it holds every action until Back Stab range, then opens from stealth.',
    watch: 'engagement.primaryId is the squishy HEALER (not the dangerous Brute); the Assassin cloaks, stalks, and its FIRST offensive act is a stealth Back Stab on the healer — no early bow shots. (Debug tab → Plan → engagement.primaryId; watch the Assassin stay stealthed until the strike.)',
    build: directiveAssassinate,
  },
  {
    id: 'directive-pull-to-camp',
    title: 'Directive: Pull to Camp',
    blurb: 'The Pull to Camp directive makes the pull mandatory and anchors it behind a sight break: the Puller tags the mark and drags it around a corner blind to where it stood.',
    watch: 'The plan anchors on a corner with NO line to the mark (an ambush spot) and staffs a `pull` assignment dragging the mark to it — the Puller darts out, tags, and hauls it back behind the wall. Contrast `the-puller` (opportunistic, no ambush). (Debug tab → Plan → assignments → role: pull, and engagement.anchor.)',
    build: directivePullToCamp,
  },
  {
    id: 'directive-protect',
    title: 'Directive: Protect',
    blurb: 'A uniform-toughness party with no fragile outlier — so nobody would normally get a guard. The Protect directive forces one anyway and aims it at the CARRY (the damage engine), not a squishy.',
    watch: 'A guard assignment materialises on the Carry (top sustained damage) and one tank peels to body-block the raiders diving it, instead of all three piling in. Contrast `protect-the-carry` (guard derived from a fragile outlier). (Debug tab → Plan → assignments → role: guard, allyId: carry.)',
    build: directiveProtect,
  },
  {
    id: 'intel-first-contact-unknown',
    title: 'Intel: unknown species (misjudged)',
    blurb: "A first contact: the brute's kit is UNKNOWN, so the party prices its hidden Crush swing as a harmless basic attacker — and commits, marching right up to a very strong, very slow melee brute it can't actually afford.",
    watch: 'The party COMMITS: engagement locks onto the brute immediately (it reads the masked kit as a bare attacker) and closes the distance. Once in range it wakes the (skittish) brute by hitting it — the real Crush swing then punishes the misjudge. Flip to `intel-first-contact-known` — the SAME brute, fully scouted — to see the opposite call. (Debug tab → Plan → engagement. Staged: a builder can\'t run the store\'s learning loop, so knowledge is pre-stamped.)',
    build: intelUnknown,
  },
  {
    id: 'intel-first-contact-known',
    title: 'Intel: known species (clean escape)',
    blurb: 'The SAME brute, now fully scouted: the party prices its real Crush swing, finds the trade unaffordable, and puts it on the avoid list — and because the brute is slow and melee-only, that decision is enough to walk away clean.',
    watch: "The party DECLINES: no engagement, the brute sits on avoidTargetIds the whole time and (never hit) never wakes — watch the gap to the brute hold and then widen over the run, with no stalemate and no one-shot. Flip to `intel-first-contact-unknown` for the misjudged first-contact call on the identical foe. (Debug tab → Plan → avoidTargetIds.)",
    build: intelKnown,
  },
  {
    id: 'arena-5v5',
    title: '5v5 arena: two directives',
    blurb: 'A full team fight with a directive on each side — the player line Holds the Line while the enemy raiders Assassinate, diving the backline healer.',
    watch: 'The player plan commits `stance: hold` on the wall anchor (tanks forward, Sage poking, Healer rear); the enemy plan sets primaryId to the player HEALER and knifes for it. Two directives, one fight. (Debug tab → Plan on either team.)',
    build: arena5v5,
  },
]

export const showcaseById = (id: string): Showcase | undefined => SHOWCASES.find((s) => s.id === id)
