// Mapgen Lab → real battle seeder: stands up a live open-world battle on a
// lab-generated map, so a ?mapgen=1 bake can be PLAYED, not just previewed.
// Pure seeding logic (no UI) — the lab imports this cheaply and wires its own
// "drop in" button around it.
//
// Built on seedSimBattle (src/dev/simBattle.ts), the shared save-safe scene
// seeder: the synthetic location carries the FULL lab config in `mapGen`
// (recipe/seed/themes/gates/maxBarriers/tuning), so the store's normal
// stand-up path (createOpenBattleFor → generateForLocationCached) bakes
// exactly the spec the lab showed. `onFail: 'accept'` pins that — even a
// validation-failing bake plays as previewed instead of rerolling into a
// different map.
//
// Save safety: seeding OVERWRITES the in-memory scene (units/battles/
// locations). That is only safe because App.tsx runs ?mapgen under its
// `noPersist` gate (no autosave, no catch-up) — same contract as ?monsterlab.
//
// Gates caveat: the battle resolves proficiency locks against the SEEDED
// roster's real kit (partyProficiencyTags at stand-up), not the lab's
// simulated party-kit toggles — the lab preview and the battle can differ if
// its toggles don't match the default hero templates.
//
// The CALLER owns the tick loop (App's is disabled under noPersist): run a
// paused setInterval that calls store.tick(), exactly like the Monster Lab's
// Battle Sim (src/dev/MonsterLab.tsx ~:730) — seed, then play/pause drives it.

import { INITIAL_UNITS } from '@/data/units'
import type { MapgenTuning, ThemeTag } from '@/mapgen'
import type { Unit } from '@/stores/useGameStore'
import type { Location } from '@/types'
import { seedSimBattle } from '@/dev/simBattle'

export const MAPGEN_LAB_SIM_LOC = 'mapgen-lab-sim'

// A modest mixed default composition: melee chaser / slow blob / tanky
// crustacean / ranged skeleton — enough behavioural spread to see a generated
// map's chokepoints and lanes actually matter.
const DEFAULT_MONSTER_IDS = ['wolf', 'slime', 'rock-crab', 'skeleton-archer']

export interface MapgenLabBattleOpts {
  recipe: string
  seed: number
  size: number
  themes: ThemeTag[]
  gates?: boolean
  maxBarriers?: number
  tuning?: Partial<MapgenTuning>
  monsterCount?: number   // default size-scaled (~size/10, clamped 6–18)
  monsterIds?: string[]   // default: DEFAULT_MONSTER_IDS
}

// Location traits from the lab themes — traits drive the RENDER's biome tile
// pick (appearance.ts biomeForLocation), while the generated spec's own
// regionTags drive ground tint + scatter theming. Two adjustments:
//  • 'volcanic' adds 'mountain' so lava fields sit on the stone biome
//    (dungeon/cave/mountain/ruins already read stone via their own tag names);
//  • 'city' maps to 'arena' (stone) instead of riding along, because a
//    'city' TRAIT flips createOpenBattleFor's peaceful flag — and the whole
//    point here is a battle. The spec still bakes with the city theme.
function traitsForThemes(themes: ThemeTag[]): string[] {
  const traits = new Set<string>(themes.filter((t) => t !== 'city'))
  if (themes.includes('volcanic')) traits.add('mountain')
  if (themes.includes('city')) traits.add('arena')
  if (traits.size === 0) traits.add('plains')
  return [...traits]
}

// Seeds the store scene (roster + synthetic mapGen location + monsters), enters
// battle view, and returns MAPGEN_LAB_SIM_LOC. See the header for the caller's
// tick-loop responsibility.
export function seedMapgenLabBattle(opts: MapgenLabBattleOpts): string {
  const monsterIds = opts.monsterIds?.length ? opts.monsterIds : DEFAULT_MONSTER_IDS
  const count = opts.monsterCount ?? Math.max(6, Math.min(18, Math.round(opts.size / 10)))

  // Fresh class-template heroes, re-id'd shallow clones (the seedSimBattle
  // contract) — same roster shape as the perf harness and the Monster Lab.
  const roster: Unit[] = INITIAL_UNITS.filter((u) => u.class).slice(0, 4)
    .map((u, i) => ({ ...structuredClone(u), id: `mgl-hero-${i}` }))

  // The synthetic location IS the seam: `mapGen` pins the whole lab config, so
  // the store's stand-up bakes the previewed spec (accept = what you saw is
  // what you play). seedSimBattle re-ids/caps it and never persists it.
  const base: Location = {
    id: MAPGEN_LAB_SIM_LOC,
    name: 'Mapgen Lab Sim',
    region: 'world',
    description: 'Lab-generated battlefield',
    traits: traitsForThemes(opts.themes),
    monsterIds,
    familiarityMax: 100,
    connections: [],
    openWorld: true,
    openWorldSize: opts.size,
    mapGen: {
      recipe: opts.recipe,
      seed: opts.seed,
      themes: opts.themes,
      gates: opts.gates,
      maxBarriers: opts.maxBarriers,
      tuning: opts.tuning,
      onFail: 'accept',
    },
  }

  // Round-robin the count across the composition (first ids get the remainder).
  const monsters = monsterIds.map((id, i) => ({
    id,
    count: Math.floor(count / monsterIds.length) + (i < count % monsterIds.length ? 1 : 0),
  }))

  seedSimBattle({ locationId: MAPGEN_LAB_SIM_LOC, roster, monsters, base, customSize: opts.size })
  return MAPGEN_LAB_SIM_LOC
}
