// Prototype-only flavour text. Deterministic "story" generation so the Saga lens
// has something narrative to show — woven from a hero's class, proficiencies,
// age, level and recent deeds. Pure functions of the Unit + event log; no RNG, so
// a given hero always reads the same. This is mock content for the UI overhaul
// exploration, not game-canon lore.

import type { Unit, LogEntry } from '@/types'

// Tiny deterministic hash → index, so each hero gets a stable pick from a table.
function pick<T>(seed: string, table: T[]): T {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return table[Math.abs(h) % table.length]
}

const ORIGINS = [
  'born in the lantern-lit alleys of Geffen',
  'raised by wandering caravan-folk on the Prontera road',
  'orphaned young and taken in by a frontier garrison',
  'a runaway from a cloistered mountain order',
  'the last of a line of disgraced minor nobility',
  'pulled from a shipwreck on the Kanto shore as a child',
]

const DRIVES = [
  'chasing a debt that can only be paid in monster ichor',
  'searching for a sibling lost to the dungeons below',
  'sworn to map every cursed hollow on the continent',
  'hunting the beast that left the scar',
  'simply unwilling to die quietly in a village bed',
  'drawn forward by a recurring dream of an open gate',
]

const CLASS_FLAVOR: Record<string, { title: string; line: string }> = {
  Fighter: { title: 'the Unbroken',   line: 'meets every charge head-on, trusting steel and stubbornness in equal measure' },
  Ranger:  { title: 'the Far-Eye',    line: 'never lets a foe close the distance it has already measured' },
  Mage:    { title: 'the Kindled',    line: 'carries weather in both hands and spends it without ceremony' },
  Cleric:  { title: 'the Mending',    line: 'keeps the party upright by sheer refusal to let anyone fall' },
  Rogue:   { title: 'the Quiet Knife',line: 'prefers the fight to be over before the enemy knows it began' },
}

const PROFICIENCY_LINE: Record<string, string> = {
  Swords:        'A lifetime on the practice yard shows in the economy of every cut.',
  Bows:          'Arrows are nocked and loosed before most could name the threat.',
  Staves:        'The old staff-cant flows through them like a second language.',
  Wands:         'Quick, surgical castings — power measured to the milligram.',
  'Heavy Armor': 'Plate is worn like a second skin; the weight is reassurance, not burden.',
  Daggers:      'Close work, the kind that ends in a single breath.',
}

export interface HeroSaga {
  title: string
  epithet: string
  opening: string
  body: string
  deeds: { tick: number; text: string }[]
}

export function buildSaga(unit: Unit, log: LogEntry[]): HeroSaga {
  const cls = unit.class ?? 'Novice'
  const flav = CLASS_FLAVOR[cls] ?? { title: 'the Untested', line: 'is still writing the first page of their story' }
  const origin = pick(unit.id + 'o', ORIGINS)
  const drive  = pick(unit.id + 'd', DRIVES)

  const epithet = `${cls === 'Novice' ? 'Aspirant' : cls} · ${flav.title}`
  const opening = `${unit.name}, ${origin}, now ${unit.age} winters old and ${drive}.`

  const profSentences = unit.proficiencies
    .map((p) => PROFICIENCY_LINE[p])
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')

  const tier =
    unit.level >= 20 ? 'a name spoken with respect in three provinces' :
    unit.level >= 10 ? 'a seasoned hand the younger recruits already imitate' :
    unit.level >= 5  ? 'no longer green, but with much still to prove' :
    'green as spring, hungry for the first real test'

  const body = [
    `By the world's reckoning ${unit.name} ${flav.line}.`,
    profSentences,
    `At level ${unit.level}, they are ${tier}.`,
  ].filter(Boolean).join(' ')

  // Recent deeds: pull this hero's name out of the shared event log. The log is
  // global, so we filter loosely by name mention — good enough for a mock.
  const deeds = log
    .filter((e) => e.message.includes(unit.name) || (e.category === 'victory' && unit.locationId))
    .slice(0, 6)
    .map((e) => ({ tick: e.tick, text: e.message }))

  return { title: unit.name, epithet, opening, body, deeds }
}
