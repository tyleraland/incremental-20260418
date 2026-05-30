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
}

export function getScenario(id?: string | null): ScenarioDef | null {
  return id ? SCENARIO_REGISTRY[id] ?? null : null
}
