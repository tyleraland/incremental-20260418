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
}

export function getScenario(id?: string | null): ScenarioDef | null {
  return id ? SCENARIO_REGISTRY[id] ?? null : null
}
