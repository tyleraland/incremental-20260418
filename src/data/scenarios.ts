// Test scenarios: each scenario overrides a location's combat setup so the
// dev-player can pin specific behaviors at known cells on the map (LoS kiting,
// cross-wall pathing, etc.). Mirrors the engine tests one-for-one — a tweak
// here should be reflected by a tweak there, and vice versa. Locations point
// at a scenario via `testScenarioId`; locations without one play their default
// open-field wave.

import { arenaBarriers } from '@/engine'
import type { Barrier } from '@/engine'

export interface ScenarioDef {
  id: string
  name: string
  description: string
  wave?: string[]              // monster ids; if absent, the location's own monsterIds × party size is used
  barriers?: () => Barrier[]   // engine-grid terrain; if absent, open field
}

export const SCENARIO_REGISTRY: Record<string, ScenarioDef> = {
  'open-field': {
    id: 'open-field',
    name: 'Open Field',
    description: 'No terrain. Smallest sandbox — line your party against the location’s default wave and see who lasts.',
  },
  'geffen-f2-cross': {
    id: 'geffen-f2-cross',
    name: 'Cross Wall',
    description: 'Three tough slimes flanked by two bats; central + splits the field. Tests party pathing around an obstacle (mirrors engine `barriers` test).',
    wave: ['tough-slime', 'tough-slime', 'tough-slime', 'bat', 'bat'],
    barriers: arenaBarriers,
  },
  'los-kiting-perimeter': {
    id: 'los-kiting-perimeter',
    name: 'LoS Kiting Perimeter',
    description: 'Solid block in the centre, narrow halls around the perimeter. Drop a fast ranged unit with the Kiter tactic vs. a slow tanky chaser — mirrors the LoS-aware kiting engine test.',
    barriers: () => [{ x: 3, y: 3, w: 9, h: 9, kind: 'wall' as const }],
  },
  'geffen-f4-slime-field': {
    id: 'geffen-f4-slime-field',
    name: 'Slime Field',
    description: 'Open ground, no terrain — six Tough Slimes (200 HP, heavy DEF) swarm in. A grind/attrition check: can the party chew through a wall of high-defense sponges before it gets overwhelmed?',
    wave: ['tough-slime', 'tough-slime', 'tough-slime', 'tough-slime', 'tough-slime', 'tough-slime'],
  },

  // ── Proving Grounds: sandbox arenas to watch one tactic / terrain idea ───────
  // Each pins a monster combo (+ optional terrain) that makes a specific
  // behaviour legible. Bring the suggested tactic and watch it fire. These
  // mirror the engine tests in src/__tests__/engine/movement-*.test.ts.
  'pg-guardian-stand': {
    id: 'pg-guardian-stand',
    name: 'The Last Line',
    description: 'One hard-hitting bruiser (Garrick) + a wolf, open field. Field a Guardian tank in front of a squishy back-liner and watch it body-block — the bruiser should eat the tank, not your mage.',
    wave: ['elite-fighter', 'wolf'],
  },
  'pg-threat-trial': {
    id: 'pg-threat-trial',
    name: 'The Threat Trial',
    description: 'Three Stone Sentinels — slow slabs with huge HP/DEF but a feeble Slam. Bring the tank (Davan: Defensive Stance + Taunt) and a ranged kiter (Miri/Theron). Watch the §threat wobble: the kiter out-damages the tank and the sentinels peel toward it, then Taunt yanks them back for ~3s. The tank holds; the back line lives.',
    wave: ['stone-sentinel', 'stone-sentinel', 'stone-sentinel'],
  },
  'pg-veiled-approach': {
    id: 'pg-veiled-approach',
    name: 'Veiled Approach',
    description: 'A Stone Golem screening a Harpy caster. Bring a Rogue with Cloak + Back Stab (Ambusher comes free): stalk the golem\'s flank while hidden and open on the Harpy for a stealth-multiplied hit.',
    wave: ['stone-golem', 'harpy'],
  },
  'pg-wolf-pack': {
    id: 'pg-wolf-pack',
    name: 'Wolf Pack',
    description: 'Three fast Wolves, open field. A juicy test for ranged/casters: Kiter holds the gap, and Wary Caster backs off further each time a cast gets interrupted by the rush.',
    wave: ['wolf', 'wolf', 'wolf'],
  },
  'pg-divided-hall': {
    id: 'pg-divided-hall',
    name: 'The Divided Hall',
    description: 'A wall bisects the field with a Cleric + Animated Armor behind it. Flankers must route around the ends; casters can\'t fire through the wall, so positioning is everything.',
    wave: ['elite-cleric', 'animated-armor'],
    barriers: () => [{ x: 4, y: 6, w: 7, h: 1.5, kind: 'wall' as const }],
  },
  'pg-ravine': {
    id: 'pg-ravine',
    name: 'The Ravine',
    description: 'A cliff splits the field — it blocks movement but not line of sight. Two Harpies hold the far rim: your casters can snipe over the cliff while melee has to route around it.',
    wave: ['harpy', 'harpy'],
    barriers: () => [{ x: 2, y: 7, w: 11, h: 2, kind: 'cliff' as const }],
  },
  'pg-slime-huddle': {
    id: 'pg-slime-huddle',
    name: 'Slime Huddle',
    description: 'Five Rock Crabs packed tight, open field — a clean target for AoE. A mage with Lightning Storm (Storm Caller inherited) should drop the cloud on the densest knot and zap them all.',
    wave: ['rock-crab', 'rock-crab', 'rock-crab', 'rock-crab', 'rock-crab'],
  },
  'pg-menagerie': {
    id: 'pg-menagerie',
    name: 'The Menagerie',
    description: 'One of each restyled creature on an open floor — snail, adderwalla, wolf, slime, boar, harpy — a live gallery of the paper token families (snail/serpent/canine/blob/beast/flyer). Watch the head/shell/core plates lean as they move.',
    wave: ['snail', 'adderwalla', 'wolf', 'slime', 'wild-boar', 'harpy'],
  },

  // ── Pathing & terrain testbeds (15×15 deploy model: players form up in the
  // top half, enemies the bottom; mid-field terrain is what they route around) ─
  'pg-bottleneck': {
    id: 'pg-bottleneck',
    name: 'The Bottleneck',
    description: 'Two long mid-field walls leave a single narrow gap dead centre — the only way across. The whole fight is forced to funnel through one chokepoint: a body-block, pathing, and line-of-sight pressure cooker. Bring a Guardian to hold the gap.',
    wave: ['stone-golem', 'harpy', 'harpy'],
    barriers: () => [
      { x: 0,    y: 7, w: 6, h: 1.5, kind: 'wall' as const },   // left bar (gap 6..9)
      { x: 9,    y: 7, w: 6, h: 1.5, kind: 'wall' as const },   // right bar
    ],
  },
  'pg-serpentine': {
    id: 'pg-serpentine',
    name: 'The Serpentine',
    description: 'Three offset wall stubs force a zig-zag S between you and the far side. A route-and-flank test: melee must weave the switchbacks to reach a back-line Living Nightshade that spits down the lane.',
    wave: ['living-nightshade', 'rock-crab', 'rock-crab'],
    barriers: () => [
      { x: 0,  y: 5,  w: 10, h: 1.2, kind: 'wall' as const },   // stub from the left
      { x: 5,  y: 7.5, w: 10, h: 1.2, kind: 'wall' as const },  // stub from the right
      { x: 0,  y: 10, w: 10, h: 1.2, kind: 'wall' as const },   // stub from the left
    ],
  },
  'pg-pillared-hall': {
    id: 'pg-pillared-hall',
    name: 'The Pillared Hall',
    description: 'Four stone pillars dot an open hall. A body-block + line-of-sight weave: melee threads between the pillars while casters on both sides lose and regain their shot as targets duck behind cover.',
    wave: ['harpy', 'harpy', 'skeleton-archer'],
    barriers: () => [
      { x: 3.5,  y: 5.5, w: 2, h: 2, kind: 'wall' as const },
      { x: 9.5,  y: 5.5, w: 2, h: 2, kind: 'wall' as const },
      { x: 3.5,  y: 8.5, w: 2, h: 2, kind: 'wall' as const },
      { x: 9.5,  y: 8.5, w: 2, h: 2, kind: 'wall' as const },
    ],
  },
  'pg-moat': {
    id: 'pg-moat',
    name: 'The Moat',
    description: 'A wide cliff-band cuts across mid-field: it blocks movement but NOT line of sight, and the far side is a back-line of ranged poachers. Your casters/archers can snipe across the gap while your melee has to detour around the ends — a ranged-vs-melee asymmetry test.',
    wave: ['poacher', 'poacher', 'skeleton-archer'],
    barriers: () => [{ x: 1.5, y: 7, w: 12, h: 1.6, kind: 'cliff' as const }],
  },

  // ── Open-world terrain testbed (the only barrier scenario fought in *open*
  // mode: persistent, vision-limited, wandering — rubble to route around) ──────
  'pg-overgrown-maze': {
    id: 'pg-overgrown-maze',
    name: 'The Overgrown Ruins',
    description: 'A persistent open-world ruin (60×60) studded with toppled walls. Vision is limited, so the party hunts and wanders between the rubble — a live testbed for reachable-waypoint roaming and threading terrain to whatever wanders into sight.',
    barriers: () => [
      { x: 18, y: 14, w: 3, h: 14, kind: 'wall' as const },
      { x: 34, y: 22, w: 3, h: 16, kind: 'wall' as const },
      { x: 14, y: 38, w: 18, h: 3, kind: 'wall' as const },
      { x: 40, y: 8,  w: 12, h: 3, kind: 'wall' as const },
      { x: 24, y: 44, w: 3, h: 12, kind: 'wall' as const },
    ],
  },
}

export function getScenario(id?: string | null): ScenarioDef | null {
  return id ? SCENARIO_REGISTRY[id] ?? null : null
}
