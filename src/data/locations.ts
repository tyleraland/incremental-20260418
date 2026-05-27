import type { Location } from '@/types'

// World shape: a single chain of cells from Geffen → Prontera → Kanto, with
// Geffen Dungeon as a separate sub-area branching off Geffen City. We're
// deliberately sparse here while content is in flux — each cell exists to
// stage a specific combat scenario (see `testScenarioId` → `SCENARIO_REGISTRY`),
// not to depict the world in detail. Map coords live in `src/pages/Map.tsx`.

export const INITIAL_LOCATIONS: Location[] = [
  // ── World path (Geffen → Prontera → Kanto) ───────────────────────────────
  {
    id: 'geffen-city', region: 'world', name: 'Geffen City',
    description: 'A bustling mage city built atop ancient catacombs.',
    traits: ['city', 'arcane'], monsterIds: ['slime'],
    familiarityMax: 100, connections: [],
    dungeonEntryRegion: 'geffen-dungeon',
  },
  {
    id: 'geffen-field-1', region: 'world', name: 'Geffen Outskirts',
    description: 'A windswept plain east of Geffen — first proving ground on the road to Prontera.',
    traits: ['plains'], monsterIds: ['slime'],
    familiarityMax: 100, connections: [],
    testScenarioId: 'open-field',
  },
  {
    id: 'prontera-field-1', region: 'world', name: 'Western Approach',
    description: 'Rolling hills west of Prontera ringed by ruined walls — a natural perimeter for kiting tests.',
    traits: ['plains'], monsterIds: ['slime'],
    familiarityMax: 100, connections: [],
    testScenarioId: 'los-kiting-perimeter',
  },
  {
    id: 'prontera-city', region: 'world', name: 'Prontera City',
    description: 'Capital of the Prontera kingdom.',
    traits: ['city'], monsterIds: ['slime'],
    familiarityMax: 100, connections: [],
  },
  {
    id: 'prontera-field-2', region: 'world', name: 'Southern Road',
    description: 'A coastal road descending south toward Kanto — slimes travel in packs here.',
    traits: ['plains'], monsterIds: ['slime'],
    familiarityMax: 100, connections: [],
    encounterMultiplier: 2,   // 2 monsters per hero — test the swarm path
  },
  {
    id: 'beach-1', region: 'world', name: 'Kanto Beach',
    description: 'A sunny stretch of coastline dotted with rock pools.',
    traits: ['beach', 'water'], monsterIds: ['rock-crab'],
    familiarityMax: 100, connections: [],
  },

  // ── Geffen Dungeon (separate sub-area, 5 floors) ─────────────────────────
  // Floor-specific encounters: F2 stages the cross-wall scenario, F3 puts the
  // dumb-tank Animated Armor on the floor (slow + heavy DEF — exercises kite
  // logic against a damage-soak target). Other floors default to bats.
  ...Array.from({ length: 5 }, (_, i) => {
    const floor = i + 1
    const monsters: Record<number, string[]> = {
      2: ['tough-slime', 'bat'],
      3: ['animated-armor'],
    }
    const scenarios: Record<number, string> = { 2: 'geffen-f2-cross' }
    return {
      id: `geffen-dungeon-${floor}`, region: 'geffen-dungeon',
      name: `Geffen Dungeon Floor ${floor}`,
      description: floor === 3
        ? 'Floor 3 of the catacombs beneath Geffen — empty suits of armor patrol the halls.'
        : `Floor ${floor} of the catacombs beneath Geffen.`,
      traits: ['dungeon', 'underground'],
      monsterIds: monsters[floor] ?? ['bat'],
      familiarityMax: 100, connections: [] as string[],
      testScenarioId: scenarios[floor],
    }
  }),
]
