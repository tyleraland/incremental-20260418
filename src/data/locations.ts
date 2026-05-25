import type { Location } from '@/types'

const KANTO_BEACH_IDS = Array.from({ length: 9 }, (_, i) => `beach-${i + 1}`)

// All newly-introduced placeholder locations share a single slime encounter.
// We'll customize these later — the names + ids are committed shape, but the
// monsters / descriptions / traits are intentionally shallow for now.
const PLACEHOLDER_MONSTERS = ['slime']

function pronField(n: number): Location {
  return {
    id: `prontera-field-${n}`, region: 'prontera',
    name: `Prontera Field ${n}`,
    description: 'A grassy plain on the outskirts of Prontera.',
    traits: ['plains'], monsterIds: PLACEHOLDER_MONSTERS,
    familiarityMax: 100, connections: [],
  }
}

function gefField(n: number): Location {
  return {
    id: `geffen-field-${n}`, region: 'geffen',
    name: `Geffen Field ${n}`,
    description: 'A windswept field in the Geffen lowlands.',
    traits: ['plains'], monsterIds: PLACEHOLDER_MONSTERS,
    familiarityMax: 100, connections: [],
  }
}

export const INITIAL_LOCATIONS: Location[] = [
  // ── Prontera region (3×3) ─────────────────────────────────────────────────
  ...Array.from({ length: 6 }, (_, i) => pronField(i + 1)),
  { id: 'prontera-city', region: 'prontera', name: 'Prontera City',
    description: 'Capital of the Prontera kingdom.',
    traits: ['city'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },
  { id: 'kings-forest',  region: 'prontera', name: "King's Forest",
    description: 'A dense royal forest rich with timber and game.',
    traits: ['forest', 'lumber', 'hunting'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },
  { id: 'duskwood',      region: 'prontera', name: 'Duskwood Forest',
    description: 'A shadowed wood where the trees grow unnaturally tall.',
    traits: ['forest', 'shadow', 'dangerous'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },

  // ── Geffen region (3×3) ───────────────────────────────────────────────────
  ...Array.from({ length: 7 }, (_, i) => gefField(i + 1)),
  { id: 'geffen-city',   region: 'geffen', name: 'Geffen City',
    description: 'A bustling mage city built atop ancient catacombs.',
    traits: ['city', 'arcane'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [],
    dungeonEntryRegion: 'geffen-dungeon' },
  { id: 'mount-mjolnir', region: 'geffen', name: 'Mount Mjolnir',
    description: 'An ancient mountain rumored to hold great power.',
    traits: ['mountain', 'arcane'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },

  // ── Geffen Dungeon (private 3×3 grid) ─────────────────────────────────────
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `geffen-dungeon-${i + 1}`, region: 'geffen-dungeon',
    name: `Geffen Dungeon Floor ${i + 1}`,
    description: `Floor ${i + 1} of the catacombs beneath Geffen.`,
    traits: ['dungeon', 'underground'],
    // Floor 2 is a defensive wall: tough slimes flanked by bats (see ENCOUNTER_OVERRIDES).
    monsterIds: (i === 1 ? ['tough-slime', 'bat'] : ['bat']) as string[],
    familiarityMax: 100, connections: [] as string[],
  })),

  // ── Kanto (kept as-is) ────────────────────────────────────────────────────
  ...KANTO_BEACH_IDS.map((id, i) => ({
    id, region: 'kanto', name: `Beach ${i + 1}`,
    description: 'A sunny stretch of coastline dotted with rock pools.',
    traits: ['beach', 'water'], monsterIds: ['rock-crab'],
    familiarityMax: 100, connections: [] as string[],
  })),
]
