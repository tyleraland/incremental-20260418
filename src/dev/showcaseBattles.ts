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
  type BattleState, type EngineUnitInput, type Barrier, type Combatant, type Posture,
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
  // Three heroes — bold / steady / wary — each ordered ('avoid') to a point past
  // an identical ring of stationary archers. Same corridor, same HP; the posture
  // alone decides: bold plows through, wary stops to clear the ring first, steady
  // between. Watch the ⚔ clearing state in each hero's Plan panel (Debug tab).
  const lanes: { id: string; posture: Posture; cx: number }[] = [
    { id: 'bold',   posture: 'bold',   cx: 8 },
    { id: 'steady', posture: 'steady', cx: 24 },
    { id: 'wary',   posture: 'wary',   cx: 40 },
  ]
  const players: EngineUnitInput[] = lanes.map((l) => mk({
    id: l.id, team: 'player', name: l.id.toUpperCase(), str: 26, def: 6, maxHp: 260, hp: 260,
    moveSpeed: 0.95, meleeRange: 1.4, posture: l.posture, visionRange: 24,
  }))
  // A 4-archer arc RINGING the destination on the hero's approach side (the
  // hero comes from the south / high y, so the arc sits just south of the dest
  // at sin(a) > 0). The destination is inside the ring → 'avoid' can't skirt it;
  // the hero must plow or clear-first. Tuned so the straight-corridor price
  // lands between wary's budget (20%) and bold's (50%): bold plows, wary clears.
  const ringAngles = [45, 80, 100, 135]
  const enemies: EngineUnitInput[] = []
  for (const l of lanes) for (const _ of ringAngles) {
    enemies.push(mk({ id: `${l.id}-e${enemies.length}`, team: 'enemy', name: 'Archer', str: 10, def: 3, rangedRange: 4, maxHp: 44, hp: 44, moveSpeed: 0 }))
  }
  const b = createBattle({ playerUnits: players, enemyUnits: enemies, mode: 'open', cols: 50, rows: 44 })
  let ei = 0
  for (const l of lanes) {
    at(b, l.id, l.cx, 40)
    const dest = { x: l.cx, y: 14 }
    for (const deg of ringAngles) {
      const a = (deg * Math.PI) / 180
      at(b, `${l.id}-e${ei++}`, dest.x + 5 * Math.cos(a), dest.y + 5 * Math.sin(a))
    }
    issueMoveOrder(b, l.id, dest, 'avoid')
  }
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
    blurb: 'Bold / steady / wary heroes ordered through identical archer rings — posture alone decides plow vs clear-first.',
    watch: 'BOLD plows straight through; WARY stops to kill the ring first; STEADY is between. (Debug tab → Plan → route price / ⚔ clearing.)',
    build: postureRoutes,
  },
]

export const showcaseById = (id: string): Showcase | undefined => SHOWCASES.find((s) => s.id === id)
