// Map generation — §M story scaffolds (idea catalog: "apophenia over authored
// text"). ONE pass, shared by every recipe: it names the place and writes a
// one-line premise into the semantic plane — a scaffold the player projects a
// story onto, never prose. It runs LAST so it can read what the map actually
// grew (function → theme → history, §G): a lake becomes "split by a ford", a
// sealed gate "a door nobody has opened", the deepest hall "something nests at
// the bottom". Same discipline as everything here: tiny fixed vocabularies
// (§K, grow one entry at a time), seeded stream RNG, no feature may depend on
// the premise (the line DESCRIBES the bake; it never steers it).
//
// Consumers render the line as-is (the ?mapgen=1 lab, the Map detail panel).
// Reports / offline-summary surfacing is deferred — BACKLOG → Procedural map
// generation, phase 5.

import type { PassCtx, PassDef } from './pipeline'
import type { ThemeTag } from './types'

// Name fragments conditioned on theme (§G: one tag, coherent content across
// systems). Prefix pools union across the map's themes; suffix follows recipe.
// Exported for the coverage gate (theme-profiles.test.ts): every THEME_TAG
// must name itself.
export const THEME_PREFIXES: Partial<Record<ThemeTag, string[]>> = {
  plains: ['Mill', 'Wold', 'Fallow', 'Bray'],
  forest: ['Oak', 'Thorn', 'Alder', 'Fern'],
  beach: ['Salt', 'Gull', 'Shell', 'Tide'],
  water: ['Mere', 'Reed', 'Otter', 'Rill'],
  mountain: ['Crag', 'Tor', 'Flint', 'Gale'],
  desert: ['Dune', 'Sun', 'Dust', 'Adder'],
  ruins: ['Eld', 'Grey', 'Hollow', 'Wrack'],
  city: ['King', 'Guild', 'Ward', 'Copper'],
  dungeon: ['Under', 'Deep', 'Grim', 'Bleak'],
  haunted: ['Wraith', 'Pale', 'Mourn', 'Dusk'],
  volcanic: ['Ash', 'Ember', 'Cinder', 'Slag'],
  arcane: ['Rune', 'Star', 'Ley', 'Glimmer'],
  swamp: ['Mire', 'Sedge', 'Toad', 'Murk'],
  snow: ['Frost', 'Rime', 'Sleet', 'Winter'],
  cave: ['Echo', 'Gloam', 'Drip', 'Delve'],
  jungle: ['Vine', 'Moss', 'Fever', 'Tangle'],
  farm: ['Barley', 'Furrow', 'Hay', 'Harrow'],
  orchard: ['Apple', 'Bough', 'Cider', 'Blossom'],
  tundra: ['Lichen', 'Hoar', 'Elk', 'Sere'],
  village: ['Thatch', 'Byre', 'Wain', 'Tithe'],
  river: ['Ford', 'Eddy', 'Weir', 'Brook'],
}
const PLAIN_PREFIXES = ['Green', 'Stone', 'High', 'Marsh']

const FIELD_ADJ = ['quiet', 'wind-worn', 'half-wild', 'sun-dazed', 'mist-hung', 'old']
export const FIELD_LANDFORM: Partial<Record<ThemeTag, string>> = {
  forest: 'wood', beach: 'strand', mountain: 'high moor', desert: 'waste',
  water: 'fen', ruins: 'field of toppled stones', haunted: 'pale heath',
  volcanic: 'cinder flat', arcane: 'ley field',
  swamp: 'mire', snow: 'snowfield', jungle: 'jungle floor', tundra: 'frozen barren',
  farm: 'patch of worked fields', orchard: 'stand of orchard rows',
  village: 'common green', river: 'riverland', cave: 'sunken ground',
}

const DUNGEON_ADJ = ['long-plundered', 'half-collapsed', 'airless', 'root-choked', 'echoing', 'frost-bitten']
const DUNGEON_TYPE: Partial<Record<ThemeTag, string>> = {
  ruins: 'undercroft', haunted: 'barrow', volcanic: 'slag mine',
  arcane: 'sanctum', mountain: 'galleries', cave: 'cavern', snow: 'ice-bound galleries',
}

const CITY_ADJ = ['bustling', 'sleepy', 'prosperous', 'ramshackle', 'pious', 'stubborn']
const CITY_TRADE: Partial<Record<ThemeTag, string>> = {
  beach: 'fisher', water: 'fisher', forest: 'timber', mountain: 'mining',
  desert: 'caravan', arcane: 'scrivener', farm: 'grain', river: 'ferry',
}

const themed = <T,>(themes: ThemeTag[], table: Partial<Record<ThemeTag, T>>): T | null => {
  for (const t of themes) { const v = table[t]; if (v !== undefined) return v }
  return null
}

const art = (s: string) => (/^[aeiou]/i.test(s) ? 'an' : 'a')

export const premisePass: PassDef = {
  id: 'premise',
  run({ draft, params, rng }: PassCtx) {
    const r = rng('words')
    const { themes } = params
    const prefixes = themes.flatMap((t) => THEME_PREFIXES[t] ?? [])
    const prefix = r.pick(prefixes.length ? prefixes : PLAIN_PREFIXES)

    // What the bake actually grew — the premise reads the map, never steers it.
    const water = draft.collision.some((b) => b.material === 'deep-water')
    const sealed = draft.semantic.locks.some((l) => !l.open)
    const maxDepth = Math.max(0, ...draft.semantic.nav.nodes.map((n) => n.depth ?? 0))
    const gates = draft.semantic.nav.nodes.filter((n) => n.id.startsWith('gate-')).length

    let name: string
    let premise: string
    if (params.recipe === 'dungeon') {
      name = `The ${prefix}${r.pick(['barrow', 'delve', 'warren', 'deep', 'vault', 'gaol'])}`
      const type = themed(themes, DUNGEON_TYPE) ?? 'delve'
      const tail = sealed
        ? '; one door has never been opened'
        : maxDepth > 0 ? '; something nests at the bottom' : ''
      const adj = r.pick(DUNGEON_ADJ)
      premise = `${art(adj)} ${adj} ${type} sunk ${Math.max(1, maxDepth)} halls deep${tail}`
    } else if (params.recipe === 'city') {
      name = `${prefix}${r.pick(['ton', 'stead', 'bury', 'market', 'cross', 'gate'])}`
      const trade = themed(themes, CITY_TRADE) ?? 'market'
      const adj = r.pick(CITY_ADJ)
      premise = `${art(adj)} ${adj} ${trade} town where ${Math.max(2, gates)} roads meet`
    } else {
      const suffixes = ['vale', 'lea', 'moor', 'reach', 'down']
      if (water) suffixes.push('ford', 'mere')
      name = `${prefix}${r.pick(suffixes)}`
      const landform = themed(themes, FIELD_LANDFORM) ?? 'meadowland'
      const adj = r.pick(FIELD_ADJ)
      premise = `${art(adj)} ${adj} ${landform}${water ? ', split by a ford' : ''}`
    }

    draft.semantic.name = name
    draft.semantic.premise = premise
  },
}
