import type { Location } from '@/types'

// Linear test-friendly path: Prontera → Geffen → Geffen Dungeon. Locations are
// intentionally sparse for now so we can be deliberate about where features
// land while we're testing — extra fields, towns, side dungeons, and the Kanto
// region were trimmed.
const PLACEHOLDER_MONSTERS = ['slime']

export const INITIAL_LOCATIONS: Location[] = [
  // Prontera region — open-field test ground
  { id: 'prontera-city',    region: 'prontera', name: 'Prontera City',
    description: 'Capital of the Prontera kingdom.',
    traits: ['city'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },
  { id: 'prontera-field-1', region: 'prontera', name: 'Prontera Field 1',
    description: 'A grassy plain on the outskirts of Prontera.',
    traits: ['plains'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },

  // Geffen region
  { id: 'geffen-field-1',   region: 'geffen', name: 'Geffen Field 1',
    description: 'A windswept field in the Geffen lowlands.',
    traits: ['plains'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [] },
  { id: 'geffen-city',      region: 'geffen', name: 'Geffen City',
    description: 'A bustling mage city built atop ancient catacombs.',
    traits: ['city', 'arcane'], monsterIds: PLACEHOLDER_MONSTERS, familiarityMax: 100, connections: [],
    dungeonEntryRegion: 'geffen-dungeon' },

  // Geffen Dungeon — Floor 2 carries the central cross (walls), see LOCATION_TERRAIN
  { id: 'geffen-dungeon-1', region: 'geffen-dungeon', name: 'Geffen Dungeon Floor 1',
    description: 'Floor 1 of the catacombs beneath Geffen.',
    traits: ['dungeon', 'underground'], monsterIds: ['bat'], familiarityMax: 100, connections: [] },
  { id: 'geffen-dungeon-2', region: 'geffen-dungeon', name: 'Geffen Dungeon Floor 2',
    description: 'Floor 2 of the catacombs beneath Geffen. Tough slimes guard the central cross.',
    traits: ['dungeon', 'underground'], monsterIds: ['tough-slime', 'bat'], familiarityMax: 100, connections: [] },
]
