import type { Location } from '@/types'

const KANTO_BEACH_IDS = Array.from({ length: 10 }, (_, i) => `beach-${i + 1}`)

export const INITIAL_LOCATIONS: Location[] = [
  { id: 'kings-forest', region: 'prontera', name: "King's Forest",   description: 'A dense royal forest rich with timber and game.',        traits: ['forest', 'lumber', 'hunting'],   monsterIds: ['slime'],                                    familiarityMax: 100, connections: [] },
  { id: 'duskwood',     region: 'prontera', name: 'Duskwood Forest', description: 'A shadowed wood where the trees grow unnaturally tall.', traits: ['forest', 'shadow', 'dangerous'], monsterIds: ['harpy', 'shadow-wolf', 'dark-slime'],        familiarityMax: 100, connections: [] },
  { id: 'lake-arawok',  region: 'geffen',   name: 'Lake Arawok',     description: 'A vast freshwater lake, calm on the surface.',           traits: ['water', 'fishing', 'calm'],      monsterIds: ['giant-frog', 'river-serpent'],               familiarityMax: 100, connections: [] },
  { id: 'gray-hills',   region: 'geffen',   name: 'Gray Hills',      description: 'Rocky highlands rich with ore and ancient ruins.',       traits: ['rocky', 'mining', 'ruins'],      monsterIds: ['rock-crab', 'stone-golem', 'ruins-specter'], familiarityMax: 100, connections: [] },
  ...KANTO_BEACH_IDS.map((id, i) => ({
    id, region: 'kanto', name: `Beach ${i + 1}`,
    description: 'A sunny stretch of coastline dotted with rock pools.',
    traits: ['beach', 'water'], monsterIds: ['rock-crab'], familiarityMax: 100, connections: [] as string[],
  })),
]
