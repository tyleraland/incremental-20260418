import type { Trait, Unit, EquipmentItem } from '@/types'

export const TRAIT_REGISTRY: Record<string, Trait> = {
  slashing:    { id: 'slashing',    label: 'Slashing',    category: 'damage-type', description: 'Deals cutting damage. Effective against lightly armored targets.' },
  piercing:    { id: 'piercing',    label: 'Piercing',    category: 'damage-type', description: 'Deals puncturing damage. Bypasses a portion of physical defense.' },
  bludgeoning: { id: 'bludgeoning', label: 'Bludgeoning', category: 'damage-type', description: 'Deals blunt force damage. Effective against heavy or rigid armor.' },
  fire:        { id: 'fire',        label: 'Fire',        category: 'element', description: 'Imbued with fire energy. May inflict Burning.', colorClass: 'bg-orange-950 text-orange-300 border-orange-700/50' },
  lightning:   { id: 'lightning',   label: 'Lightning',   category: 'element', description: 'Imbued with electrical energy. Fast and unpredictable.', colorClass: 'bg-yellow-950 text-yellow-300 border-yellow-700/50' },
  ice:         { id: 'ice',         label: 'Ice',         category: 'element', description: 'Imbued with cold energy. May slow the target.', colorClass: 'bg-sky-950 text-sky-300 border-sky-700/50' },
  earth:       { id: 'earth',       label: 'Earth',       category: 'element', description: 'Imbued with earth energy. Stable and powerful.', colorClass: 'bg-lime-950 text-lime-300 border-lime-700/50' },
  wind:        { id: 'wind',        label: 'Wind',        category: 'element', description: 'Imbued with wind energy. High speed, reduced weight.', colorClass: 'bg-teal-950 text-teal-300 border-teal-700/50' },
  '1h':        { id: '1h',          label: '1H',          category: 'item-type', description: 'One-handed. Pairs with a shield, off-hand weapon, or accessory.' },
  '2h':        { id: '2h',          label: '2H',          category: 'item-type', description: 'Two-handed. Off-hand slot is locked while equipped.' },
  'tool':      { id: 'tool',        label: 'Tool',        category: 'item-type', description: 'Utility item for gathering or exploration. Uses the dedicated Tool slot.' },
  'shield':    { id: 'shield',      label: 'Shield',      category: 'item-type', description: 'Off-hand defensive gear. Provides bonus Defense.' },
  light:       { id: 'light',       label: 'Light',       category: 'general',   description: 'Lightweight. Minimal speed penalty.' },
  heavy:       { id: 'heavy',       label: 'Heavy',       category: 'general',   description: 'Heavy. Better protection, possible speed penalty.' },
  versatile:   { id: 'versatile',   label: 'Versatile',   category: 'general',   description: 'Effective in multiple contexts.' },
  forest:      { id: 'forest',      label: 'Forest',      category: 'environment', description: 'Dense woodland. Good for timber, herbs, and hunting.' },
  shadow:      { id: 'shadow',      label: 'Shadow',      category: 'environment', description: 'Dimly lit and treacherous. Increases risk, may yield rare finds.' },
  water:       { id: 'water',       label: 'Water',       category: 'environment', description: 'Aquatic environment. Enables fishing and water-based gathering.' },
  mining:      { id: 'mining',      label: 'Mining',      category: 'environment', description: 'Rich in ore deposits. Requires a Pickaxe to extract efficiently.' },
  ruins:       { id: 'ruins',       label: 'Ruins',       category: 'environment', description: 'Ancient structures that may contain hidden items or dangers.' },
  hunting:     { id: 'hunting',     label: 'Hunting',     category: 'environment', description: 'Abundant game. A Skinning Knife improves yield.' },
  fishing:     { id: 'fishing',     label: 'Fishing',     category: 'environment', description: 'Active fishing grounds. Requires a Fishing Rod.' },
  lumber:      { id: 'lumber',      label: 'Lumber',      category: 'environment', description: 'Harvestable timber. A Handaxe is recommended.' },
  dangerous:   { id: 'dangerous',   label: 'Dangerous',   category: 'environment', description: 'High threat level. Units assigned here face greater risk.' },
  rocky:       { id: 'rocky',       label: 'Rocky',       category: 'environment', description: 'Rugged terrain with exposed rock faces and ore veins.' },
  calm:        { id: 'calm',        label: 'Calm',        category: 'environment', description: 'Peaceful area with low threat level.' },
  warrior:     { id: 'warrior',     label: 'Warrior',     category: 'class', description: 'A combat-trained fighter. Proficient with swords, shields, and heavy armor.' },
  mage:        { id: 'mage',        label: 'Mage',        category: 'class', description: 'A student of arcane arts. Specializes in magical weaponry and high M.ATK.' },
  rogue:       { id: 'rogue',       label: 'Rogue',       category: 'class', description: 'A nimble operative. Favors light weapons, tools, and stealth.' },
  'prof-swords':      { id: 'prof-swords',      label: 'Swords',      category: 'proficiency', description: 'Trained with swords. Improved accuracy and damage.' },
  'prof-heavy-armor': { id: 'prof-heavy-armor', label: 'Heavy Armor', category: 'proficiency', description: 'No movement penalty in chain or plate.' },
  'prof-tools':       { id: 'prof-tools',       label: 'Tools',       category: 'proficiency', description: 'Improved yield from tool-based activities.' },
  'prof-staves':      { id: 'prof-staves',      label: 'Staves',      category: 'proficiency', description: 'Increases magical power with staves.' },
  'prof-wands':       { id: 'prof-wands',       label: 'Wands',       category: 'proficiency', description: 'Faster casting speed with wands.' },
  'prof-mining':      { id: 'prof-mining',      label: 'Mining',      category: 'proficiency', description: 'Greater ore yield and faster extraction.' },
  'prof-daggers':     { id: 'prof-daggers',     label: 'Daggers',     category: 'proficiency', description: 'High critical hit rate with daggers.' },
  'prof-lockpicks':   { id: 'prof-lockpicks',   label: 'Lockpicks',   category: 'proficiency', description: 'Can unlock doors and chests.' },
}

const PROF_TO_TRAIT: Record<string, string> = {
  'Swords': 'prof-swords', 'Heavy Armor': 'prof-heavy-armor',
  'Tools': 'prof-tools',   'Staves': 'prof-staves',
  'Wands': 'prof-wands',   'Mining': 'prof-mining',
  'Daggers': 'prof-daggers', 'Lockpicks': 'prof-lockpicks',
}

export function getUnitTraits(unit: Unit): Trait[] {
  const out: Trait[] = []
  if (unit.class) { const t = TRAIT_REGISTRY[unit.class.toLowerCase()]; if (t) out.push(t) }
  for (const p of unit.proficiencies) { const t = TRAIT_REGISTRY[PROF_TO_TRAIT[p]]; if (t) out.push(t) }
  return out
}

export function getItemTraits(item: EquipmentItem): Trait[] {
  const out: Trait[] = item.traits.map((id) => TRAIT_REGISTRY[id]).filter(Boolean) as Trait[]
  const statMap: [keyof EquipmentItem['stats'], string, string][] = [
    ['attack',        'ATK',   'physical attack'],
    ['defense',       'DEF',   'physical defense'],
    ['specialAttack', 'M.ATK', 'magic attack'],
    ['specialDefense','M.DEF', 'magic defense'],
  ]
  for (const [k, short, desc] of statMap) {
    const v = item.stats[k]
    if (v) out.push({ id: `stat-${k}-${v}`, label: `+${v} ${short}`, category: 'stat', description: `Increases ${desc} by ${v}.` })
  }
  return out
}
