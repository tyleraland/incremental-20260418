import type { Location } from '@/types'

// Cities are peaceful open-world fields: a hero posted to one wanders the town
// (milling about individually — see §town wander) even though no monster spawns
// there. A compact square so heroes (and the town's NPCs) stay close enough to
// cross paths. `openWorldCap: 0` keeps the field monster-free.
const CITY_FIELD_SIZE = 24

// World shape: a single chain of cells from Geffen → Prontera → Kanto, with
// Geffen Dungeon as a separate sub-area branching off Geffen City. We're
// deliberately sparse here while content is in flux — each cell exists to
// stage a specific combat scenario (see `testScenarioId` → `SCENARIO_REGISTRY`),
// not to depict the world in detail. Map coords live in `src/pages/Map.tsx`.

export const INITIAL_LOCATIONS: Location[] = [
  // ── World path (Geffen → Prontera → Kanto) ───────────────────────────────
  {
    id: 'geffen-city', region: 'world', name: 'Geffen City',
    description: 'A bustling mage city built atop ancient catacombs. Within its walls no monster stirs — but its arcane college will set a Novice on the Path of the Mage.',
    traits: ['city', 'arcane'], monsterIds: [],
    familiarityMax: 100, connections: [],
    dungeonEntryRegion: 'geffen-dungeon',
    openWorld: true, openWorldCap: 0, openWorldSize: CITY_FIELD_SIZE,
  },
  {
    id: 'elite-four', region: 'world', name: 'Elite Four',
    description: 'A walled arena north of Geffen where four champions — a Fighter, a Rogue, a Cleric, and a Ranger — test all comers.',
    traits: ['plains', 'dangerous'],
    monsterIds: ['elite-fighter', 'elite-rogue', 'elite-cleric', 'elite-ranger'],
    familiarityMax: 100, connections: [],
  },
  {
    id: 'geffen-field-1', region: 'world', name: 'Geffen Outskirts',
    description: 'A windswept plain east of Geffen — first proving ground on the road to Prontera.',
    traits: ['plains'], monsterIds: ['hornet', 'egg-sac'],
    familiarityMax: 100, connections: [],
    testScenarioId: 'open-field',
  },
  {
    id: 'prontera-field-1', region: 'world', name: 'Western Approach',
    description: 'Rolling hills west of Prontera ringed by ruined walls — a natural perimeter for kiting tests.',
    traits: ['plains'], monsterIds: ['tough-slime'],
    familiarityMax: 100, connections: [],
    testScenarioId: 'los-kiting-perimeter',
  },
  {
    id: 'prontera-city', region: 'world', name: 'Prontera City',
    description: 'Capital of the Prontera kingdom — a walled, peaceful city. Its guild halls train Novices on the Path of the Fighter and the Path of the Cleric, and its market square hosts Arnold the Armorsmith and Paul the Weaponsmith.',
    traits: ['city'], monsterIds: [],
    familiarityMax: 100, connections: [],
    openWorld: true, openWorldCap: 0, openWorldSize: CITY_FIELD_SIZE,
  },
  {
    id: 'payon-city', region: 'world', name: 'Payon Town',
    description: 'A forest town of archers and shadowy dealings — no monster walks its streets. Its hunters and thieves take Novices onto the Path of the Ranger or the Path of the Rogue.',
    traits: ['city', 'forest'], monsterIds: [],
    familiarityMax: 100, connections: [],
    openWorld: true, openWorldCap: 0, openWorldSize: CITY_FIELD_SIZE,
  },
  {
    id: 'prontera-field-3', region: 'world', name: 'Prontera Field',
    description: 'A grassy plain east of Prontera, dotted with patches of nightshade.',
    traits: ['plains'], monsterIds: ['living-nightshade'],
    familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 10, openWorldSize: 50,
  },
  {
    id: 'prontera-field-2', region: 'world', name: 'Southern Road',
    description: 'A coastal road descending south toward Kanto.',
    traits: ['plains'], monsterIds: ['skeleton-archer'],
    familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 12, openWorldSize: 50,
  },
  {
    id: 'beach-1', region: 'world', name: 'Kanto Beach',
    description: 'A sunny stretch of coastline dotted with rock pools.',
    traits: ['beach', 'water'], monsterIds: ['rock-crab', 'giant-frog'],
    familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 14, openWorldSize: 50,
  },
  {
    id: 'harpy-roost', region: 'world', name: 'Harpy Roost',
    description: 'A wind-scoured crag east of Prontera, its every ledge boiling with harpies — a sky black with claws and screeching. A swarm, not a skirmish. A switchback trail climbs from here into the Sky Aerie above.',
    traits: ['mountain', 'dangerous'], monsterIds: ['harpy'],
    // Deliberately dense: a small (25×25) field kept packed with 25 harpies —
    // a stress arena for AoE, body-blocking, and the open-world sim at scale.
    familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 25, openWorldSize: 25,
    // Gateway to the Sky Aerie — its own map page (region), reached like the
    // Geffen Dungeon is from Geffen City.
    dungeonEntryRegion: 'aerie',
  },

  // ── Sky Aerie (separate sub-area / map page, climbed from the Harpy Roost) ──
  {
    id: 'aerie-1', region: 'aerie', name: 'Windward Aerie',
    description: 'A ledge high in the updrafts where rat flies wheel and dart. They never hold still — hovering out of reach, then diving in to bite and peeling straight back out.',
    traits: ['mountain', 'dangerous'], monsterIds: ['rat-fly', 'rat-fly', 'rat-fly'],
    familiarityMax: 100, connections: [],
  },
  {
    id: 'boar-meadow', region: 'world', name: 'Boar Meadow',
    description: 'A quiet upland meadow where boar herds graze. They pay you no mind — until one is struck, and the whole herd wheels around to answer the squeal.',
    traits: ['plains'], monsterIds: ['wild-boar'],
    // §aggression showcase: a passive herd (skittish + pack-tactics + flee) —
    // ignores you until provoked, then aggros together and bolts when hurt.
    familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 12, openWorldSize: 30,
  },
  {
    id: 'wolf-den', region: 'world', name: 'Dire Wolf Den',
    description: 'A wooded hollow prowled by dire wolves that hunt in coordinated packs — they roam together and fall on intruders as one.',
    traits: ['forest'], monsterIds: ['dire-wolf'],
    // §aggression showcase: an aggressive hunting pack (pack-hunter + pack-tactics)
    // — wanders as a group and aggros together on sight.
    familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 10, openWorldSize: 30,
  },

  // ── Proving Grounds (sandbox arenas, east of the world path) ─────────────
  // Each stages one tactic / terrain idea so it can be watched in the browser;
  // see SCENARIO_REGISTRY (pg-*) and the movement-* engine tests.
  {
    id: 'pg-guardian-stand', region: 'world', name: 'The Last Line',
    description: 'A bare arena where a lone bruiser tests whether your Guardian can body-block for the back line.',
    traits: ['arena'], monsterIds: ['elite-fighter', 'wolf'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-guardian-stand',
  },
  {
    id: 'pg-threat-trial', region: 'world', name: 'The Threat Trial',
    description: 'A bare arena for practising aggro control: three slow, sponge-tough Stone Sentinels that barely hit but chase whoever angers them most. Field a tank with Defensive Stance + Taunt beside a ranged kiter and watch the threat tug-of-war.',
    traits: ['arena'], monsterIds: ['stone-sentinel'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-threat-trial',
  },
  {
    id: 'pg-veiled-approach', region: 'world', name: 'Veiled Approach',
    description: 'A screened caster begging to be ambushed — a stage for Cloak, Back Stab and the Ambusher flank.',
    traits: ['arena'], monsterIds: ['stone-golem', 'harpy'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-veiled-approach',
  },
  {
    id: 'pg-wolf-pack', region: 'world', name: 'Wolf Pack',
    description: 'Three fast wolves that punish a stationary caster — bring Kiter and Wary Caster.',
    traits: ['arena'], monsterIds: ['wolf'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-wolf-pack',
  },
  {
    id: 'pg-divided-hall', region: 'world', name: 'The Divided Hall',
    description: 'A wall splits the field with the enemy behind it — a flank-around-terrain and line-of-sight test.',
    traits: ['arena', 'ruins'], monsterIds: ['elite-cleric', 'animated-armor'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-divided-hall',
  },
  {
    id: 'pg-ravine', region: 'world', name: 'The Ravine',
    description: 'A cliff blocks movement but not sight — snipe over it while melee routes around.',
    traits: ['arena', 'cliff'], monsterIds: ['harpy'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-ravine',
  },
  {
    id: 'pg-slime-huddle', region: 'world', name: 'Slime Huddle',
    description: 'A tight knot of crabs — the cleanest target in the world for Lightning Storm.',
    traits: ['arena'], monsterIds: ['rock-crab'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-slime-huddle',
  },

  // ── Pathing Grounds (barrier / terrain testbeds, a second sandbox row) ───────
  // Stage the known-terrain pathing work. The last one is open-world
  // (persistent, vision-limited, wandering); the rest are discrete encounters.
  {
    id: 'pg-bottleneck', region: 'world', name: 'The Bottleneck',
    description: 'Two mid-field walls leave one narrow centre gap — the whole fight funnels through a single chokepoint.',
    traits: ['arena', 'ruins'], monsterIds: ['stone-golem', 'harpy'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-bottleneck',
  },
  {
    id: 'pg-serpentine', region: 'world', name: 'The Serpentine',
    description: 'A zig-zag S of offset wall stubs guarding a back-line caster — a route-and-flank weave.',
    traits: ['arena', 'ruins'], monsterIds: ['living-nightshade', 'rock-crab'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-serpentine',
  },
  {
    id: 'pg-pillared-hall', region: 'world', name: 'The Pillared Hall',
    description: 'Four pillars in an open hall — a body-block + line-of-sight weave.',
    traits: ['arena', 'ruins'], monsterIds: ['harpy', 'skeleton-archer'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-pillared-hall',
  },
  {
    id: 'pg-moat', region: 'world', name: 'The Moat',
    description: 'A wide cliff cuts mid-field — it blocks movement, not sight. Snipe across while melee detours.',
    traits: ['arena', 'cliff'], monsterIds: ['poacher', 'skeleton-archer'],
    familiarityMax: 100, connections: [], testScenarioId: 'pg-moat',
  },
  {
    id: 'pg-overgrown-maze', region: 'world', name: 'The Overgrown Ruins',
    description: 'A persistent open-world ruin studded with toppled walls — hunt-and-wander over terrain.',
    traits: ['arena', 'ruins'], monsterIds: ['shadow-wolf', 'dark-slime', 'forest-sprite'],
    familiarityMax: 100, connections: [],
    openWorld: true, openWorldCap: 8, openWorldSize: 60, testScenarioId: 'pg-overgrown-maze',
  },
  {
    // One monster of each element the bestiary covers (neutral, water, earth,
    // wind, poison, undead) formed up as a single wave — a clean testbed for
    // target-aware attack selection: an elemental caster locks each foe in turn
    // and leads with whatever bolt exploits that armor.
    id: 'pg-elemental-circle', region: 'world', name: 'The Elemental Circle',
    description: 'A ring of six wards, each binding a beast of a different element — wolf, frog, crab, harpy, hornet, and bat — a sampler arena for testing which attack bites hardest into which armor.',
    traits: ['arena'],
    monsterIds: ['wolf', 'giant-frog', 'rock-crab', 'harpy', 'hornet', 'bat'],
    familiarityMax: 100, connections: [],
  },

  // ── Elemental Frontier (a connected line south of the sandbox rows) ──────────
  // A chain west→east, one creature of a newly-introduced element per stop, so
  // the new fire / ghost / radiant fauna have a home — and a place to watch the
  // Mutant Lizard's radiant Consecration aura chew on the party.
  {
    id: 'ember-hollow', region: 'world', name: 'Emberpool Hollow',
    description: 'A steaming hollow where fire slimes bubble up from cracks in the scorched rock.',
    traits: ['mountain', 'volcanic'], monsterIds: ['fire-slime'],
    familiarityMax: 100, connections: ['cinder-dunes'],
  },
  {
    id: 'cinder-dunes', region: 'world', name: 'Cinder Dunes',
    description: 'Black-glass dunes where adderwallas slither — fast fire-snakes that pay you no mind until you draw blood, then dart in and strike like a whip.',
    traits: ['plains', 'desert'], monsterIds: ['adderwalla'],
    familiarityMax: 100, connections: ['ember-hollow', 'hollow-barrow'],
  },
  {
    id: 'hollow-barrow', region: 'world', name: 'Hollow Barrow',
    description: 'A sunken graveyard mound where wraiths drift between the toppled headstones.',
    traits: ['dungeon', 'haunted'], monsterIds: ['wraith'],
    familiarityMax: 100, connections: ['cinder-dunes', 'irradiated-marsh'],
  },
  {
    id: 'irradiated-marsh', region: 'world', name: 'Irradiated Marsh',
    description: 'A glowing fen where mutant lizards bask in hallowed light — step into the radiance and it sears, round after round.',
    traits: ['plains', 'arcane'], monsterIds: ['mutant-lizard'],
    familiarityMax: 100, connections: ['hollow-barrow'],
  },

  // ── Geffen Dungeon (separate sub-area, 5 floors) ─────────────────────────
  // Floor-specific encounters: F2 stages the cross-wall scenario, F3 puts the
  // dumb-tank Animated Armor on the floor (slow + heavy DEF — exercises kite
  // logic against a damage-soak target), F4 is an open slime field (six Tough
  // Slimes — an attrition check). Other floors default to bats.
  ...Array.from({ length: 5 }, (_, i) => {
    const floor = i + 1
    const monsters: Record<number, string[]> = {
      2: ['tough-slime', 'bat'],
      3: ['animated-armor'],
      4: ['tough-slime'],
    }
    const scenarios: Record<number, string> = {
      2: 'geffen-f2-cross',
      4: 'geffen-f4-slime-field',
    }
    const descriptions: Record<number, string> = {
      3: 'Floor 3 of the catacombs beneath Geffen — empty suits of armor patrol the halls.',
      4: 'Floor 4 of the catacombs beneath Geffen opens into a cavern hall — a writhing pack of Tough Slimes oozes across the floor.',
    }
    return {
      id: `geffen-dungeon-${floor}`, region: 'geffen-dungeon',
      name: `Geffen Dungeon Floor ${floor}`,
      description: descriptions[floor] ?? `Floor ${floor} of the catacombs beneath Geffen.`,
      traits: ['dungeon', 'underground'],
      monsterIds: monsters[floor] ?? ['bat'],
      familiarityMax: 100, connections: [] as string[],
      testScenarioId: scenarios[floor],
    }
  }),
]
