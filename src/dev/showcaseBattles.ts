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
  // Four melee heroes clustered near a Sorcerer (high threat, low hp —
  // killable fast) and three tanky Ogres (high hp, low threat). Each hero
  // starts nearest a DIFFERENT ogre — naive nearest-target would split the
  // party four ways — but the plan's dangerous-first, killability-weighted
  // kill order converges everyone on the sorcerer instead.
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
    mode: 'open', cols: 44, rows: 30,
  })
  at(b, 'sorcerer', 12, 12)
  at(b, 'ogre-a', 9, 12); at(b, 'ogre-b', 15, 12); at(b, 'ogre-c', 12, 9)
  // Each hero starts nearest its own ogre, not the sorcerer.
  at(b, 'h1', 9, 13); at(b, 'h2', 15, 13); at(b, 'h3', 13, 9); at(b, 'h4', 12, 13)
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
      // Carries enough INT alone to clear ACUMEN.pull (50).
      mk({ id: 'p1', team: 'player', name: 'Scholar', str: 10, int: 55, maxHp: 50, hp: 50 }),
      mk({ id: 'p2', team: 'player', name: 'Fighter', str: 10, maxHp: 50, hp: 50 }),
      mk({ id: 'p3', team: 'player', name: 'Fighter', str: 10, maxHp: 50, hp: 50 }),
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
    enemyUnits: Array.from({ length: 6 }, (_, i) => mk({
      id: `swarm-${i}`, team: 'enemy', name: 'Raider', str: 5, maxHp: 40, hp: 40, meleeRange: 1.4, visionRange: 30,
    })),
    barriers, mode: 'open', cols: 44, rows: 40,
  })
  at(b, 'tank-a', 20, 24); at(b, 'tank-b', 21, 24); at(b, 'mid', 20, 25); at(b, 'caster', 21, 25)
  const swarmX = [16, 18, 20, 22, 24, 26]
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
    blurb: 'Four heroes each start nearest a different tanky ogre — the party ignores them and converges on the squishy sorcerer instead.',
    watch: 'All four heroes lock the sorcerer within a round or two and drop it before any ogre takes a scratch. (Debug tab → Plan → engagement.primaryId.)',
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
    blurb: 'The party fights an affordable straggler and pointedly ignores the fat, unaffordable Dire Wolf pack sleeping beside it.',
    watch: 'The party engages only the straggler; the wolf pack sits on the avoid list the whole time. (Debug tab → Plan → acumen ≥ 50, avoidTargetIds.)',
    build: dontOverPull,
  },
  {
    id: 'hold-the-line',
    title: 'Hold the line',
    blurb: 'A mixed party forms up on a wall gap — tanks in front, the fragile caster tucked in the rear.',
    watch: 'The party commits `stance: hold` and settles into a two-rank fan on the gap, toughest members forward. (Debug tab → Plan → stance / anchor.)',
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
]

export const showcaseById = (id: string): Showcase | undefined => SHOWCASES.find((s) => s.id === id)
