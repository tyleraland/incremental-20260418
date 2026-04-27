import type { Location } from '@/types'

const KANTO_BEACH_IDS = Array.from({ length: 10 }, (_, i) => `beach-${i + 1}`)

export const INITIAL_LOCATIONS: Location[] = [
  {
    id: 'kings-forest', region: 'prontera', name: "King's Forest",
    description: 'A dense royal forest rich with timber and game.',
    traits: ['forest', 'lumber', 'hunting'],
    monsterIds: ['wolf', 'forest-sprite', 'poacher'],
    familiarityMax: 100, connections: [],
    monsterPool: [
      { monsterId: 'wolf',         weight: 3, maxPopulation: 10 },
      { monsterId: 'forest-sprite', weight: 2, maxPopulation: 5  },
      { monsterId: 'poacher',       weight: 1, maxPopulation: 3  },
    ],
    encounterSize: [1, 3],
  },
  {
    id: 'duskwood', region: 'prontera', name: 'Duskwood Forest',
    description: 'A shadowed wood where the trees grow unnaturally tall.',
    traits: ['forest', 'shadow', 'dangerous'],
    monsterIds: ['harpy', 'shadow-wolf', 'dark-slime'],
    familiarityMax: 100, connections: [],
    monsterPool: [
      { monsterId: 'shadow-wolf', weight: 3, maxPopulation: 8 },
      { monsterId: 'dark-slime',  weight: 2, maxPopulation: 6 },
    ],
    encounterSize: [1, 3],
  },
  {
    id: 'lake-arawok', region: 'geffen', name: 'Lake Arawok',
    description: 'A vast freshwater lake, calm on the surface.',
    traits: ['water', 'fishing', 'calm'],
    monsterIds: ['giant-frog', 'river-serpent'],
    familiarityMax: 100, connections: [],
    monsterPool: [
      { monsterId: 'giant-frog',    weight: 3, maxPopulation: 8 },
      { monsterId: 'river-serpent', weight: 1, maxPopulation: 3 },
    ],
    encounterSize: [1, 2],
  },
  {
    id: 'gray-hills', region: 'geffen', name: 'Gray Hills',
    description: 'Rocky highlands rich with ore and ancient ruins.',
    traits: ['rocky', 'mining', 'ruins'],
    monsterIds: ['rock-crab', 'stone-golem', 'ruins-specter'],
    familiarityMax: 100, connections: [],
    monsterPool: [
      { monsterId: 'rock-crab',    weight: 3, maxPopulation: 8 },
      { monsterId: 'ruins-specter', weight: 2, maxPopulation: 4 },
      { monsterId: 'stone-golem',  weight: 1, maxPopulation: 2 },
    ],
    encounterSize: [1, 2],
  },
  ...KANTO_BEACH_IDS.map((id, i) => ({
    id, region: 'kanto', name: `Beach ${i + 1}`,
    description: 'A sunny stretch of coastline dotted with rock pools.',
    traits: ['beach', 'water'],
    monsterIds: ['rock-crab'],
    familiarityMax: 100, connections: [] as string[],
    monsterPool: [{ monsterId: 'rock-crab', weight: 1, maxPopulation: null }],
    encounterSize: [1, 2] as [number, number],
  })),
]
