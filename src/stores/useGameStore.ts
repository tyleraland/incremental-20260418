import { create } from 'zustand'

// ── Trait system ──────────────────────────────────────────────────────────────

export type TraitCategory =
  | 'damage-type' | 'element' | 'stat' | 'item-type'
  | 'environment' | 'class' | 'proficiency' | 'general'

export interface Trait {
  id: string
  label: string
  category: TraitCategory
  description: string
  colorClass?: string
}

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

// ── Skill system ──────────────────────────────────────────────────────────────

export interface SkillBonuses {
  attack?: number; defense?: number; magicAttack?: number; magicDefense?: number
  attackSpeed?: number; accuracy?: number; dodge?: number
  strength?: number; agility?: number; dexterity?: number; constitution?: number; intelligence?: number
}

export interface SkillDef {
  id: string
  name: string
  maxLevel: number
  description: (level: number) => string
  requires: { skillId: string; minLevel: number }[]
  getBonuses: (level: number) => SkillBonuses
}

export const SKILL_REGISTRY: Record<string, SkillDef> = {
  'sword-mastery-1h': {
    id: 'sword-mastery-1h', name: '1H Sword Mastery', maxLevel: 10,
    description: (lv) => `+${lv * 3} ATK when wielding a 1H sword`,
    requires: [],
    getBonuses: (lv) => ({ attack: lv * 3 }),
  },
  'sword-mastery-2h': {
    id: 'sword-mastery-2h', name: '2H Sword Mastery', maxLevel: 10,
    description: (lv) => `+${lv * 5} ATK when wielding a 2H sword`,
    requires: [{ skillId: 'sword-mastery-1h', minLevel: 1 }],
    getBonuses: (lv) => ({ attack: lv * 5 }),
  },
  'keen-eyes': {
    id: 'keen-eyes', name: 'Keen Eyes', maxLevel: 10,
    description: (lv) => `+${lv} DEX`,
    requires: [],
    getBonuses: (lv) => ({ dexterity: lv }),
  },
  'eagle-eyes': {
    id: 'eagle-eyes', name: 'Eagle Eyes', maxLevel: 10,
    description: (lv) => `+${lv} AGI`,
    requires: [{ skillId: 'keen-eyes', minLevel: 1 }],
    getBonuses: (lv) => ({ agility: lv }),
  },
  'arcane-knowledge': {
    id: 'arcane-knowledge', name: 'Arcane Knowledge', maxLevel: 10,
    description: (lv) => `+${lv} INT`,
    requires: [],
    getBonuses: (lv) => ({ intelligence: lv }),
  },
  'spellweaving': {
    id: 'spellweaving', name: 'Spellweaving', maxLevel: 10,
    description: (lv) => `+${lv * 4} M.ATK`,
    requires: [{ skillId: 'arcane-knowledge', minLevel: 1 }],
    getBonuses: (lv) => ({ magicAttack: lv * 4 }),
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type EquipSlot   = 'mainHand' | 'offHand' | 'tool' | 'armor' | 'accessory'
export type ItemCategory = 'weapon-1h' | 'weapon-2h' | 'tool' | 'shield' | 'armor' | 'accessory'
export type TabId = 'map' | 'units' | 'inventory' | 'guild' | 'time' | 'codex'

export const TICKS_PER_DAY    = 200
export const DAYS_PER_SEASON  = 100
export const SEASONS_PER_YEAR = 4
export const TICKS_PER_SEASON = TICKS_PER_DAY * DAYS_PER_SEASON
export const TICKS_PER_YEAR   = TICKS_PER_SEASON * SEASONS_PER_YEAR
export const SEASON_NAMES     = ['Spring', 'Summer', 'Autumn', 'Winter'] as const
export const RECOVERY_TICKS   = 30   // ticks of KO countdown before regen starts
const        REGEN_RATE       = 1    // HP% per tick when not in active combat

export function ticksToCalendar(ticks: number) {
  const tickOfDay   = ticks % TICKS_PER_DAY
  const totalDays   = Math.floor(ticks / TICKS_PER_DAY)
  const dayOfSeason = (totalDays % DAYS_PER_SEASON) + 1
  const totalSeasons = Math.floor(totalDays / DAYS_PER_SEASON)
  const seasonIndex  = totalSeasons % SEASONS_PER_YEAR
  const year         = Math.floor(totalSeasons / SEASONS_PER_YEAR) + 1
  return { year, seasonIndex, seasonName: SEASON_NAMES[seasonIndex], dayOfSeason, tickOfDay }
}

export interface Abilities {
  strength: number; agility: number; dexterity: number; constitution: number; intelligence: number
}

export interface DerivedStats {
  attack: number; defense: number; magicAttack: number; magicDefense: number
  attackSpeed: number; accuracy: number; dodge: number
}

export interface Unit {
  id: string; name: string; level: number; exp: number; expToNext: number
  age: number; health: number; class: string | null; proficiencies: string[]
  abilities: Abilities
  abilityPoints: number
  skillPoints: number
  learnedSkills: Record<string, number>
  locationId: string | null
  equipment: Record<EquipSlot, string | null>
  recoveryTicksLeft: number   // >0: KO countdown; 0: active or regenerating
}

export interface Location { id: string; name: string; description: string; traits: string[]; monsterIds: string[]; familiarityMax: number }

// Seen-count thresholds: how many sightings unlock each info tier in the codex
export const FAMILIARITY_THRESHOLDS = { stats: 2, dropNames: 4, dropRates: 8 } as const

export interface MonsterDrop {
  itemId: string
  dropRate: number
  quantityMin: number
  quantityMax: number
}

export interface MonsterDef {
  id: string
  name: string
  level: number
  stats: DerivedStats
  drops: MonsterDrop[]
}

export interface EquipmentItem {
  id: string; name: string; category: ItemCategory; traits: string[]
  stats: { attack?: number; defense?: number; specialAttack?: number; specialDefense?: number }
  description?: string
}

export interface MiscItem { id: string; name: string; quantity: number; description?: string }

// ── Monster registry ──────────────────────────────────────────────────────────

export const DROP_ITEMS: Record<string, string> = {
  'drop-wolf-pelt':     'Wolf Pelt',     'drop-wolf-fang':     'Wolf Fang',
  'drop-spirit-dust':   'Spirit Dust',   'drop-emerald-leaf':  'Emerald Leaf',
  'drop-iron-dagger':   'Iron Dagger',   'drop-coin-pouch':    'Coin Pouch',
  'drop-harpy-feather': 'Harpy Feather', 'drop-talon':         'Talon',
  'drop-shadow-essence':'Shadow Essence','drop-dark-pelt':     'Dark Pelt',
  'drop-slime-gel':     'Slime Gel',     'drop-dark-core':     'Dark Core',
  'drop-frog-leg':      'Frog Leg',      'drop-sticky-tongue': 'Sticky Tongue',
  'drop-serpent-scale': 'Serpent Scale', 'drop-venom-sac':     'Venom Sac',
  'drop-crab-shell':    'Crab Shell',    'drop-crab-claw':     'Crab Claw',
  'drop-stone-shard':   'Stone Shard',   'drop-golem-core':    'Golem Core',
  'drop-ectoplasm':     'Ectoplasm',     'drop-ancient-coin':  'Ancient Coin',
}

export const MONSTER_REGISTRY: Record<string, MonsterDef> = {
  'wolf':          { id: 'wolf',         name: 'Wolf',          level: 2, stats: { attack: 8,  defense: 4,  magicAttack: 1,  magicDefense: 2,  attackSpeed: 14, accuracy: 10, dodge: 8  }, drops: [{ itemId: 'drop-wolf-pelt',     dropRate: 0.70, quantityMin: 1, quantityMax: 2 }, { itemId: 'drop-wolf-fang',     dropRate: 0.30, quantityMin: 1, quantityMax: 1 }] },
  'forest-sprite': { id: 'forest-sprite',name: 'Forest Sprite', level: 3, stats: { attack: 5,  defense: 3,  magicAttack: 12, magicDefense: 10, attackSpeed: 16, accuracy: 12, dodge: 14 }, drops: [{ itemId: 'drop-spirit-dust',    dropRate: 0.50, quantityMin: 1, quantityMax: 3 }, { itemId: 'drop-emerald-leaf',  dropRate: 0.25, quantityMin: 1, quantityMax: 1 }] },
  'poacher':       { id: 'poacher',      name: 'Poacher',       level: 4, stats: { attack: 14, defense: 8,  magicAttack: 2,  magicDefense: 4,  attackSpeed: 10, accuracy: 16, dodge: 6  }, drops: [{ itemId: 'drop-coin-pouch',     dropRate: 0.60, quantityMin: 1, quantityMax: 3 }, { itemId: 'drop-iron-dagger',   dropRate: 0.40, quantityMin: 1, quantityMax: 1 }] },
  'harpy':         { id: 'harpy',        name: 'Harpy',         level: 4, stats: { attack: 12, defense: 5,  magicAttack: 8,  magicDefense: 6,  attackSpeed: 18, accuracy: 14, dodge: 16 }, drops: [{ itemId: 'drop-harpy-feather',  dropRate: 0.65, quantityMin: 1, quantityMax: 3 }, { itemId: 'drop-talon',         dropRate: 0.35, quantityMin: 1, quantityMax: 2 }] },
  'shadow-wolf':   { id: 'shadow-wolf',  name: 'Shadow Wolf',   level: 5, stats: { attack: 16, defense: 7,  magicAttack: 6,  magicDefense: 8,  attackSpeed: 18, accuracy: 14, dodge: 12 }, drops: [{ itemId: 'drop-dark-pelt',      dropRate: 0.55, quantityMin: 1, quantityMax: 2 }, { itemId: 'drop-shadow-essence',dropRate: 0.40, quantityMin: 1, quantityMax: 1 }] },
  'dark-slime':    { id: 'dark-slime',   name: 'Dark Slime',    level: 3, stats: { attack: 6,  defense: 10, magicAttack: 4,  magicDefense: 12, attackSpeed: 6,  accuracy: 8,  dodge: 4  }, drops: [{ itemId: 'drop-slime-gel',      dropRate: 0.80, quantityMin: 1, quantityMax: 4 }, { itemId: 'drop-dark-core',     dropRate: 0.15, quantityMin: 1, quantityMax: 1 }] },
  'giant-frog':    { id: 'giant-frog',   name: 'Giant Frog',    level: 2, stats: { attack: 7,  defense: 6,  magicAttack: 2,  magicDefense: 4,  attackSpeed: 8,  accuracy: 9,  dodge: 10 }, drops: [{ itemId: 'drop-frog-leg',       dropRate: 0.75, quantityMin: 1, quantityMax: 2 }, { itemId: 'drop-sticky-tongue', dropRate: 0.20, quantityMin: 1, quantityMax: 1 }] },
  'river-serpent': { id: 'river-serpent',name: 'River Serpent', level: 5, stats: { attack: 15, defense: 9,  magicAttack: 4,  magicDefense: 7,  attackSpeed: 12, accuracy: 13, dodge: 11 }, drops: [{ itemId: 'drop-serpent-scale',  dropRate: 0.50, quantityMin: 1, quantityMax: 3 }, { itemId: 'drop-venom-sac',     dropRate: 0.25, quantityMin: 1, quantityMax: 1 }] },
  'rock-crab':     { id: 'rock-crab',    name: 'Rock Crab',     level: 3, stats: { attack: 10, defense: 14, magicAttack: 1,  magicDefense: 6,  attackSpeed: 6,  accuracy: 10, dodge: 4  }, drops: [{ itemId: 'drop-crab-shell',     dropRate: 0.70, quantityMin: 1, quantityMax: 2 }, { itemId: 'drop-crab-claw',     dropRate: 0.45, quantityMin: 1, quantityMax: 2 }] },
  'stone-golem':   { id: 'stone-golem',  name: 'Stone Golem',   level: 7, stats: { attack: 22, defense: 24, magicAttack: 3,  magicDefense: 10, attackSpeed: 6,  accuracy: 12, dodge: 3  }, drops: [{ itemId: 'drop-stone-shard',    dropRate: 0.85, quantityMin: 1, quantityMax: 4 }, { itemId: 'drop-golem-core',    dropRate: 0.10, quantityMin: 1, quantityMax: 1 }] },
  'ruins-specter': { id: 'ruins-specter',name: 'Ruins Specter', level: 6, stats: { attack: 8,  defense: 4,  magicAttack: 20, magicDefense: 18, attackSpeed: 10, accuracy: 16, dodge: 12 }, drops: [{ itemId: 'drop-ectoplasm',      dropRate: 0.60, quantityMin: 1, quantityMax: 2 }, { itemId: 'drop-ancient-coin',  dropRate: 0.20, quantityMin: 1, quantityMax: 3 }] },
}

// ── Crafting recipes ──────────────────────────────────────────────────────────

export interface RecipeIngredient { itemId: string; quantity: number }

export interface CraftingRecipe {
  id: string; name: string; description: string
  ingredients: RecipeIngredient[]
  outputItemId: string; outputName: string; outputQuantity: number
}

export const RECIPE_REGISTRY: Record<string, CraftingRecipe> = {
  'recipe-plank':      { id: 'recipe-plank',      name: 'Wooden Plank',  description: 'Processed timber for construction.',            ingredients: [{ itemId: 'm1', quantity: 2  }],                                  outputItemId: 'craft-plank',      outputName: 'Wooden Plank',  outputQuantity: 3 },
  'recipe-iron-ingot': { id: 'recipe-iron-ingot',  name: 'Iron Ingot',    description: 'Smelted iron bar ready for smithing.',           ingredients: [{ itemId: 'm2', quantity: 3  }],                                  outputItemId: 'craft-iron-ingot', outputName: 'Iron Ingot',    outputQuantity: 1 },
  'recipe-fish-stew':  { id: 'recipe-fish-stew',   name: 'Fish Stew',     description: 'Hearty meal. Restores health in the field.',     ingredients: [{ itemId: 'm3', quantity: 2  }, { itemId: 'm4', quantity: 1 }],   outputItemId: 'craft-fish-stew',  outputName: 'Fish Stew',     outputQuantity: 2 },
  'recipe-herb-salve': { id: 'recipe-herb-salve',  name: 'Herb Salve',    description: 'Soothing ointment for minor wounds.',           ingredients: [{ itemId: 'm4', quantity: 3  }],                                  outputItemId: 'craft-herb-salve', outputName: 'Herb Salve',    outputQuantity: 1 },
  'recipe-preserved-fish': { id: 'recipe-preserved-fish', name: 'Preserved Fish', description: 'Salted fish that keeps for long journeys.', ingredients: [{ itemId: 'm3', quantity: 10 }],                               outputItemId: 'craft-preserved-fish', outputName: 'Preserved Fish', outputQuantity: 5 },
}

// ── Slot / category metadata ──────────────────────────────────────────────────

export const SLOT_COMPATIBLE: Record<EquipSlot, ItemCategory[]> = {
  mainHand:  ['weapon-1h', 'weapon-2h'],
  offHand:   ['weapon-1h', 'shield', 'accessory'],
  tool:      ['tool'],
  armor:     ['armor'],
  accessory: ['accessory'],
}

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand: 'Main Hand', offHand: 'Off Hand', tool: 'Tool', armor: 'Armor', accessory: 'Accessory',
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  'weapon-1h': '1H Weapon', 'weapon-2h': '2H Weapon',
  tool: 'Tool', shield: 'Shield', armor: 'Armor', accessory: 'Accessory',
}

// ── Derived-stat helpers ──────────────────────────────────────────────────────

function skillBonusTotal(unit: Unit): SkillBonuses {
  const b: SkillBonuses = {}
  for (const [id, lv] of Object.entries(unit.learnedSkills)) {
    if (!lv) continue
    const skill = SKILL_REGISTRY[id]; if (!skill) continue
    for (const [k, v] of Object.entries(skill.getBonuses(lv)) as [keyof SkillBonuses, number][])
      b[k] = (b[k] ?? 0) + v
  }
  return b
}

export function getDerivedStats(unit: Unit, allEquipment: EquipmentItem[]): DerivedStats {
  const sb  = skillBonusTotal(unit)
  const str = unit.abilities.strength     + (sb.strength     ?? 0)
  const agi = unit.abilities.agility      + (sb.agility      ?? 0)
  const dex = unit.abilities.dexterity    + (sb.dexterity    ?? 0)
  const con = unit.abilities.constitution + (sb.constitution ?? 0)
  const int = unit.abilities.intelligence + (sb.intelligence ?? 0)

  const eq = { atk: 0, def: 0, matk: 0, mdef: 0 }
  for (const id of Object.values(unit.equipment)) {
    const item = allEquipment.find((e) => e.id === id); if (!item) continue
    eq.atk  += item.stats.attack         ?? 0
    eq.def  += item.stats.defense        ?? 0
    eq.matk += item.stats.specialAttack  ?? 0
    eq.mdef += item.stats.specialDefense ?? 0
  }

  return {
    attack:      Math.max(1, Math.floor(str * 2)               + eq.atk  + (sb.attack       ?? 0)),
    defense:     Math.max(1, Math.floor(con * 1.5)             + eq.def  + (sb.defense      ?? 0)),
    magicAttack: Math.max(1, Math.floor(int * 2 + dex * 0.5)  + eq.matk + (sb.magicAttack  ?? 0)),
    magicDefense:Math.max(1, Math.floor(int * 0.5 + con)       + eq.mdef + (sb.magicDefense ?? 0)),
    attackSpeed: Math.max(1, Math.floor(agi * 2)                          + (sb.attackSpeed  ?? 0)),
    accuracy:    Math.max(1, Math.floor(dex * 1.5 + agi * 0.5)           + (sb.accuracy     ?? 0)),
    dodge:       Math.max(1, Math.floor(agi * 2   + dex * 0.5)           + (sb.dodge        ?? 0)),
  }
}

export function abilityPointCost(current: number): number {
  return Math.floor((current - 1) / 10) + 1
}

export function getAvailableSkills(unit: Unit) {
  return Object.values(SKILL_REGISTRY).map((skill) => {
    const current = unit.learnedSkills[skill.id] ?? 0
    const prereqsMet = skill.requires.every((r) => (unit.learnedSkills[r.skillId] ?? 0) >= r.minLevel)
    return { skill, current, prereqsMet, maxed: current >= skill.maxLevel }
  })
}

export function getLearnedSkills(unit: Unit) {
  return Object.values(SKILL_REGISTRY)
    .filter((s) => (unit.learnedSkills[s.id] ?? 0) >= 1)
    .map((skill) => ({ skill, current: unit.learnedSkills[skill.id]! }))
}

// ── Initial data ──────────────────────────────────────────────────────────────

const LOCATIONS: Location[] = [
  { id: 'kings-forest', name: "King's Forest",   description: 'A dense royal forest rich with timber and game.',        traits: ['forest', 'lumber', 'hunting'],   monsterIds: ['wolf', 'forest-sprite', 'poacher'],    familiarityMax: 100 },
  { id: 'duskwood',     name: 'Duskwood Forest', description: 'A shadowed wood where the trees grow unnaturally tall.', traits: ['forest', 'shadow', 'dangerous'], monsterIds: ['harpy', 'shadow-wolf', 'dark-slime'],  familiarityMax: 100 },
  { id: 'lake-arawok',  name: 'Lake Arawok',     description: 'A vast freshwater lake, calm on the surface.',           traits: ['water', 'fishing', 'calm'],      monsterIds: ['giant-frog', 'river-serpent'],         familiarityMax: 100 },
  { id: 'gray-hills',   name: 'Gray Hills',      description: 'Rocky highlands rich with ore and ancient ruins.',       traits: ['rocky', 'mining', 'ruins'],      monsterIds: ['rock-crab', 'stone-golem', 'ruins-specter'], familiarityMax: 100 },
]

const UNITS: Unit[] = [
  { id: 'u1', name: 'Aldric',  level: 3, exp: 245, expToNext: 312, age: 24, health: 95,  recoveryTicksLeft: 0, class: 'Warrior', proficiencies: ['Swords', 'Heavy Armor'], locationId: null,           abilities: { strength: 8, agility: 5, dexterity: 4, constitution: 7, intelligence: 2 }, abilityPoints: 20, skillPoints: 1, learnedSkills: { 'sword-mastery-1h': 2 }, equipment: { mainHand: 'eq-sword-1h', offHand: 'eq-shield-wood', tool: null,         armor: 'eq-leather', accessory: null } },
  { id: 'u2', name: 'Mira',    level: 2, exp:  80, expToNext: 180, age: 19, health: 100, recoveryTicksLeft: 0, class: null,       proficiencies: ['Tools'],                  locationId: 'kings-forest', abilities: { strength: 4, agility: 5, dexterity: 6, constitution: 4, intelligence: 4 }, abilityPoints: 15, skillPoints: 1, learnedSkills: {},                                         equipment: { mainHand: null,           offHand: null,             tool: 'eq-handaxe', armor: null,         accessory: null } },
  { id: 'u3', name: 'Theron',  level: 4, exp: 420, expToNext: 520, age: 31, health: 82,  recoveryTicksLeft: 0, class: 'Mage',     proficiencies: ['Staves', 'Wands'],        locationId: 'gray-hills',   abilities: { strength: 3, agility: 5, dexterity: 6, constitution: 4, intelligence: 9 }, abilityPoints: 25, skillPoints: 2, learnedSkills: { 'arcane-knowledge': 3 },                  equipment: { mainHand: 'eq-staff',     offHand: null,             tool: null,         armor: null,         accessory: null } },
  { id: 'u4', name: 'Sera',    level: 1, exp:  20, expToNext: 100, age: 16, health: 100, recoveryTicksLeft: 0, class: null,       proficiencies: [],                         locationId: null,           abilities: { strength: 3, agility: 3, dexterity: 3, constitution: 3, intelligence: 3 }, abilityPoints: 30, skillPoints: 1, learnedSkills: {},                                         equipment: { mainHand: null,           offHand: null,             tool: null,         armor: null,         accessory: null } },
  { id: 'u5', name: 'Davan',   level: 2, exp: 120, expToNext: 180, age: 28, health: 67,  recoveryTicksLeft: 0, class: null,       proficiencies: ['Tools', 'Mining'],        locationId: null,           abilities: { strength: 6, agility: 4, dexterity: 5, constitution: 6, intelligence: 3 }, abilityPoints: 18, skillPoints: 1, learnedSkills: {},                                         equipment: { mainHand: null,           offHand: null,             tool: 'eq-pickaxe', armor: null,         accessory: null } },
  { id: 'u6', name: 'Lyra',    level: 5, exp: 750, expToNext: 800, age: 35, health: 90,  recoveryTicksLeft: 0, class: 'Rogue',    proficiencies: ['Daggers', 'Lockpicks'],   locationId: 'lake-arawok',  abilities: { strength: 6, agility: 9, dexterity: 8, constitution: 5, intelligence: 5 }, abilityPoints: 22, skillPoints: 3, learnedSkills: { 'keen-eyes': 5 },                         equipment: { mainHand: 'eq-shortsword',offHand: null,             tool: null,         armor: 'eq-leather', accessory: null } },
]

const EQUIPMENT: EquipmentItem[] = [
  { id: 'eq-handaxe',        name: 'Handaxe',        category: 'tool',      traits: ['tool', 'slashing', 'light'],        stats: {},               description: 'Good for gathering wood.' },
  { id: 'eq-pickaxe',        name: 'Pickaxe',         category: 'tool',      traits: ['tool', 'piercing'],                 stats: {},               description: 'Essential for mining ore.' },
  { id: 'eq-skinning-knife', name: 'Skinning Knife',  category: 'tool',      traits: ['tool', 'slashing', 'light'],        stats: { attack: 1 },    description: 'Sharp blade for preparing game.' },
  { id: 'eq-lockpick',       name: 'Lockpick',        category: 'tool',      traits: ['tool', 'light'],                    stats: {},               description: 'Opens locks without a key.' },
  { id: 'eq-sword-1h',       name: 'Iron Sword',      category: 'weapon-1h', traits: ['1h', 'slashing'],                   stats: { attack: 4 },    description: 'A reliable iron blade.' },
  { id: 'eq-shortsword',     name: 'Shortsword',      category: 'weapon-1h', traits: ['1h', 'slashing', 'light'],          stats: { attack: 3 },    description: 'Light and fast.' },
  { id: 'eq-wand',           name: 'Wand',            category: 'weapon-1h', traits: ['1h', 'light'],                      stats: { specialAttack: 4 }, description: 'Channels magical energy.' },
  { id: 'eq-greatsword',     name: 'Greatsword',      category: 'weapon-2h', traits: ['2h', 'slashing', 'heavy'],          stats: { attack: 9 },    description: 'Massive two-handed blade. Locks off-hand.' },
  { id: 'eq-staff',          name: 'Staff',           category: 'weapon-2h', traits: ['2h', 'bludgeoning'],                stats: { specialAttack: 6 }, description: 'Two-handed magical focus. Locks off-hand.' },
  { id: 'eq-shield-wood',    name: 'Wooden Shield',   category: 'shield',    traits: ['shield', 'bludgeoning', 'light'],   stats: { defense: 2 },   description: 'Basic wooden protection.' },
  { id: 'eq-shield-iron',    name: 'Iron Shield',     category: 'shield',    traits: ['shield', 'bludgeoning', 'heavy'],   stats: { defense: 5 },   description: 'Solid iron shield.' },
  { id: 'eq-leather',        name: 'Leather Armor',   category: 'armor',     traits: ['light'],                            stats: { defense: 2 },   description: 'Light but sturdy protection.' },
  { id: 'eq-chainmail',      name: 'Chain Mail',      category: 'armor',     traits: ['heavy'],                            stats: { defense: 5 },   description: 'Linked iron rings.' },
]

const MISC: MiscItem[] = [
  { id: 'm1',    name: 'Wood',     quantity: 42, description: 'Raw timber.' },
  { id: 'm2',    name: 'Iron Ore', quantity: 18, description: 'Unrefined ore.' },
  { id: 'm3',    name: 'Fish',     quantity:  7, description: 'Fresh catch.' },
  { id: 'm4',    name: 'Herbs',    quantity: 23, description: 'Medicinal herbs.' },
  { id: 'm-gold', name: 'Gold',    quantity:  0, description: 'Currency.' },
]

// ── Store ─────────────────────────────────────────────────────────────────────

interface GameState {
  units: Unit[]; locations: Location[]; equipment: EquipmentItem[]
  miscItems: MiscItem[]; activeTab: TabId; selectedUnitIds: string[]
  expandedLocationIds: string[]; expandedUnitIds: string[]
  equipContext: { unitId: string; slot: EquipSlot } | null
  learnedRecipes: string[]
  locationFamiliarity: Record<string, number>        // locationId → current (0..familiarityMax)
  locationMonstersSeen: Record<string, string[]>     // locationId → monsterIds seen at that location
  monsterSeen: Record<string, number>                // monsterId → total global sighting count
  activeEncounters: Record<string, string[]>         // locationId → active monster slots (up to 4, may repeat)

  ticks: number                                      // total real-second ticks elapsed
  encounterProgress: Record<string, number[]>        // locationId → per-slot progress (0..1)
  encounterTargets: Record<string, (string | null)[]> // locationId → per-slot targeted unitId
  monsterDefeated: Record<string, number>            // monsterId → total defeat count
  lastTickAt: number                                 // Date.now() of the last processed tick

  offlineSummary: {
    seconds: number
    goldEarned: number
    monstersDefeated: number
    expEarned: number
  } | null

  tick: () => void
  batchTick: (n: number) => void
  dismissOfflineSummary: () => void
  setActiveTab: (tab: TabId) => void
  toggleLocation: (id: string) => void
  toggleUnit: (id: string) => void
  toggleSelectUnit: (id: string) => void
  clearSelection: () => void
  assignUnits: (unitIds: string[], locationId: string | null) => void
  equipItem: (unitId: string, slot: EquipSlot, itemId: string | null) => void
  openEquipFor: (unitId: string, slot: EquipSlot) => void
  closeEquipContext: () => void
  spendAbilityPoint: (unitId: string, ability: keyof Abilities) => void
  learnSkill: (unitId: string, skillId: string) => void
  recruitUnit: () => void
  craft: (recipeId: string) => void
}

export const useGameStore = create<GameState>((set) => ({
  units: UNITS, locations: LOCATIONS, equipment: EQUIPMENT, miscItems: MISC,
  activeTab: 'map', selectedUnitIds: [],
  expandedLocationIds: (() => { try { return JSON.parse(localStorage.getItem('expandedLocationIds') ?? '[]') } catch { return [] } })(),
  expandedUnitIds:     (() => { try { return JSON.parse(localStorage.getItem('expandedUnitIds')     ?? '[]') } catch { return [] } })(),
  equipContext: null,
  learnedRecipes: ['recipe-plank', 'recipe-iron-ingot', 'recipe-fish-stew', 'recipe-herb-salve', 'recipe-preserved-fish'],
  locationFamiliarity:    { 'kings-forest': 100, 'duskwood': 0, 'lake-arawok': 50, 'gray-hills': 75 },
  locationMonstersSeen:   { 'kings-forest': ['wolf', 'forest-sprite', 'poacher'], 'duskwood': [], 'lake-arawok': ['giant-frog'], 'gray-hills': ['rock-crab', 'stone-golem'] },
  monsterSeen:            { wolf: 15, 'forest-sprite': 3, poacher: 1, 'giant-frog': 8, 'rock-crab': 5, 'stone-golem': 2 },
  activeEncounters:       { 'kings-forest': ['wolf', 'wolf'], 'gray-hills': ['rock-crab', 'stone-golem'] },

  ticks: 0,
  encounterProgress: { 'kings-forest': [0, 0], 'gray-hills': [0, 0] },
  encounterTargets:  {},
  monsterDefeated: {},
  lastTickAt: Date.now(),
  offlineSummary: null,

  tick: () => set((s) => {
    const newTicks    = s.ticks + 1
    const yearChanged = Math.floor(newTicks / TICKS_PER_YEAR) > Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounterProgress: Record<string, number[]>           = {}
    const encounterTargets:  Record<string, (string | null)[]>  = {}
    const monsterDefeated = { ...s.monsterDefeated }
    const expGained: Record<string, number> = {}
    let goldEarned = 0
    const hpDamage: Record<string, number> = {}   // unitId → total damage this tick

    for (const [locationId, monsterSlots] of Object.entries(s.activeEncounters)) {
      const prevProgress = s.encounterProgress[locationId] ?? monsterSlots.map(() => 0)
      const aliveUnits   = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)

      const targets: (string | null)[] = monsterSlots.map((_, i) =>
        aliveUnits.length > 0 ? aliveUnits[i % aliveUnits.length].id : null,
      )
      encounterTargets[locationId] = targets

      if (aliveUnits.length === 0) {
        encounterProgress[locationId] = prevProgress
        continue
      }

      const totalDPS = aliveUnits.reduce((sum, u) => sum + getDerivedStats(u, s.equipment).attack, 0)

      for (let i = 0; i < monsterSlots.length; i++) {
        const monster  = MONSTER_REGISTRY[monsterSlots[i]]
        const targetId = targets[i]
        if (!monster || !targetId) continue
        const target   = s.units.find((u) => u.id === targetId)
        if (!target) continue
        const def = getDerivedStats(target, s.equipment).defense
        hpDamage[targetId] = (hpDamage[targetId] ?? 0) + (monster.stats.attack / Math.max(def, 1))
      }

      encounterProgress[locationId] = prevProgress.map((prog, i) => {
        const monster = MONSTER_REGISTRY[monsterSlots[i]]
        if (!monster) return prog
        if (prog >= 1) {
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + 1
          expGained[locationId]       = (expGained[locationId] ?? 0) + 1
          goldEarned++
          return 0
        }
        const hp      = (monster.stats.attack + monster.stats.defense) * 3
        const seconds = Math.max(1, Math.min(300, hp / Math.max(totalDPS, 0.001)))
        return Math.min(prog + 1 / seconds, 1)
      })
    }

    const units = s.units.map((u) => {
      let { health, recoveryTicksLeft } = u
      if (recoveryTicksLeft > 0) {
        recoveryTicksLeft--
      } else if (health > 0) {
        const dmg = hpDamage[u.id] ?? 0
        health -= dmg
        if (dmg === 0 && health < 100) health = Math.min(100, health + REGEN_RATE)
        if (health <= 0) { health = 0; recoveryTicksLeft = RECOVERY_TICKS }
      } else {
        health = Math.min(100, health + REGEN_RATE)
      }
      const aged = yearChanged ? { age: u.age + 1 } : {}
      const exp  = (u.locationId && health > 0 && recoveryTicksLeft === 0) ? (expGained[u.locationId] ?? 0) : 0
      return { ...u, health, recoveryTicksLeft, ...aged, exp: u.exp + exp }
    })

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    return { ticks: newTicks, units, encounterProgress, encounterTargets, monsterDefeated, miscItems, lastTickAt: Date.now() }
  }),

  batchTick: (n) => set((s) => {
    if (n <= 0) return s

    const newTicks    = s.ticks + n
    const yearsPassed = Math.floor(newTicks / TICKS_PER_YEAR) - Math.floor(s.ticks / TICKS_PER_YEAR)

    const encounterProgress: Record<string, number[]> = {}
    const monsterDefeated = { ...s.monsterDefeated }
    const expGained: Record<string, number> = {}
    let goldEarned   = 0
    let totalDefeats = 0

    // Damage rates and targeting based on alive status at batch start
    const damageRates: Record<string, number> = {}
    const inCombat    = new Set<string>()

    for (const [locationId, monsterSlots] of Object.entries(s.activeEncounters)) {
      const prevProgress = s.encounterProgress[locationId] ?? monsterSlots.map(() => 0)
      const aliveUnits   = s.units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)

      if (aliveUnits.length === 0) {
        encounterProgress[locationId] = prevProgress
        continue
      }

      const targets  = monsterSlots.map((_, i) => aliveUnits[i % aliveUnits.length])
      const totalDPS = aliveUnits.reduce((sum, u) => sum + getDerivedStats(u, s.equipment).attack, 0)

      for (let i = 0; i < monsterSlots.length; i++) {
        const monster = MONSTER_REGISTRY[monsterSlots[i]]
        const target  = targets[i]
        if (!monster || !target) continue
        const def = getDerivedStats(target, s.equipment).defense
        damageRates[target.id] = (damageRates[target.id] ?? 0) + (monster.stats.attack / Math.max(def, 1))
        inCombat.add(target.id)
      }

      encounterProgress[locationId] = prevProgress.map((prog, i) => {
        const monster = MONSTER_REGISTRY[monsterSlots[i]]
        if (!monster) return prog
        const hp          = (monster.stats.attack + monster.stats.defense) * 3
        const seconds     = Math.max(1, Math.min(300, hp / Math.max(totalDPS, 0.001)))
        const effectiveProg = prog >= 1 ? 0 : prog
        const combined    = effectiveProg + n / seconds
        const completions = Math.floor(combined)
        if (completions > 0) {
          monsterDefeated[monster.id] = (monsterDefeated[monster.id] ?? 0) + completions
          expGained[locationId]        = (expGained[locationId] ?? 0) + completions
          goldEarned   += completions
          totalDefeats += completions
        }
        return combined - completions
      })
    }

    const totalExpEarned = Object.values(expGained).reduce((a, b) => a + b, 0)

    // Compute final encounterTargets based on post-batch alive state (approximate)
    const encounterTargets: Record<string, (string | null)[]> = {}

    const units = s.units.map((u) => {
      let { health, recoveryTicksLeft } = u

      if (recoveryTicksLeft > 0) {
        const regenTicks  = Math.max(0, n - recoveryTicksLeft)
        recoveryTicksLeft = Math.max(0, recoveryTicksLeft - n)
        health            = Math.min(100, health + regenTicks * REGEN_RATE)
      } else if (inCombat.has(u.id)) {
        const rate         = damageRates[u.id] ?? 0
        const ticksToDeath = rate > 0 ? health / rate : Infinity
        if (ticksToDeath >= n) {
          health -= rate * n
        } else {
          const ticksAfterDeath = n - Math.floor(ticksToDeath)
          recoveryTicksLeft     = Math.max(0, RECOVERY_TICKS - ticksAfterDeath)
          const regenTicks      = Math.max(0, ticksAfterDeath - RECOVERY_TICKS)
          health                = Math.min(100, regenTicks * REGEN_RATE)
        }
      } else {
        health = Math.min(100, health + n * REGEN_RATE)
      }

      health = Math.max(0, health)
      const aged = yearsPassed > 0 ? { age: u.age + yearsPassed } : {}
      const exp  = (u.locationId && health > 0 && recoveryTicksLeft === 0) ? (expGained[u.locationId] ?? 0) : 0
      return { ...u, health, recoveryTicksLeft, ...aged, exp: u.exp + exp }
    })

    for (const [locationId, monsterSlots] of Object.entries(s.activeEncounters)) {
      const finalAlive = units.filter((u) => u.locationId === locationId && u.health > 0 && u.recoveryTicksLeft === 0)
      encounterTargets[locationId] = monsterSlots.map((_, i) =>
        finalAlive.length > 0 ? finalAlive[i % finalAlive.length].id : null,
      )
    }

    const miscItems = goldEarned > 0
      ? s.miscItems.map((i) => i.id === 'm-gold' ? { ...i, quantity: i.quantity + goldEarned } : i)
      : s.miscItems

    const offlineSummary = n >= 10
      ? { seconds: n, goldEarned, monstersDefeated: totalDefeats, expEarned: totalExpEarned }
      : s.offlineSummary

    return { ticks: newTicks, units, encounterProgress, encounterTargets, monsterDefeated, miscItems, lastTickAt: Date.now(), offlineSummary }
  }),

  dismissOfflineSummary: () => set({ offlineSummary: null }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleLocation: (id) => set((s) => {
    const next = s.expandedLocationIds.includes(id) ? s.expandedLocationIds.filter((x) => x !== id) : [...s.expandedLocationIds, id]
    localStorage.setItem('expandedLocationIds', JSON.stringify(next))
    return { expandedLocationIds: next }
  }),
  toggleUnit: (id) => set((s) => {
    const next = s.expandedUnitIds.includes(id) ? s.expandedUnitIds.filter((x) => x !== id) : [...s.expandedUnitIds, id]
    localStorage.setItem('expandedUnitIds', JSON.stringify(next))
    return { expandedUnitIds: next }
  }),
  toggleSelectUnit: (id) => set((s) => ({ selectedUnitIds: s.selectedUnitIds.includes(id) ? s.selectedUnitIds.filter((x) => x !== id) : [...s.selectedUnitIds, id] })),
  clearSelection: () => set({ selectedUnitIds: [] }),
  assignUnits: (unitIds, locationId) => set((s) => ({ units: s.units.map((u) => unitIds.includes(u.id) ? { ...u, locationId } : u), selectedUnitIds: [] })),
  equipItem: (unitId, slot, itemId) => set((s) => ({ units: s.units.map((u) => u.id === unitId ? { ...u, equipment: { ...u.equipment, [slot]: itemId } } : u) })),
  openEquipFor: (unitId, slot) => set({ equipContext: { unitId, slot }, activeTab: 'inventory' }),
  closeEquipContext: () => set({ equipContext: null }),

  spendAbilityPoint: (unitId, ability) => set((s) => {
    const unit = s.units.find((u) => u.id === unitId)
    if (!unit) return s
    const current = unit.abilities[ability]
    if (current >= 99) return s
    const cost = abilityPointCost(current)
    if (unit.abilityPoints < cost) return s
    return { units: s.units.map((u) => u.id === unitId ? { ...u, abilityPoints: u.abilityPoints - cost, abilities: { ...u.abilities, [ability]: current + 1 } } : u) }
  }),

  recruitUnit: () => set((s) => {
    const NAMES = ['Brom','Cass','Dara','Fen','Gale','Holt','Issa','Jorn','Kara','Lexa','Mack','Nira','Orin','Pell','Quinn','Roan','Sela','Tarn','Vex','Wren','Zora']
    const used = new Set(s.units.map((u) => u.name))
    const pool = NAMES.filter((n) => !used.has(n))
    const name = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : `Recruit ${s.units.length + 1}`
    const r = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo
    const unit: Unit = {
      id: `u${Date.now()}`, name, level: 1, exp: 0, expToNext: 100,
      age: r(16, 30), health: 100, recoveryTicksLeft: 0, class: null, proficiencies: [],
      abilities: { strength: r(2,5), agility: r(2,5), dexterity: r(2,5), constitution: r(2,5), intelligence: r(2,5) },
      abilityPoints: 3, skillPoints: 1, learnedSkills: {}, locationId: null,
      equipment: { mainHand: null, offHand: null, tool: null, armor: null, accessory: null },
    }
    return { units: [...s.units, unit] }
  }),

  craft: (recipeId) => set((s) => {
    const recipe = RECIPE_REGISTRY[recipeId]; if (!recipe) return s
    for (const ing of recipe.ingredients) {
      const item = s.miscItems.find((i) => i.id === ing.itemId)
      if (!item || item.quantity < ing.quantity) return s
    }
    let items = s.miscItems.map((item) => {
      const ing = recipe.ingredients.find((i) => i.itemId === item.id)
      return ing ? { ...item, quantity: item.quantity - ing.quantity } : item
    })
    const existing = items.find((i) => i.id === recipe.outputItemId)
    if (existing) {
      items = items.map((i) => i.id === recipe.outputItemId ? { ...i, quantity: i.quantity + recipe.outputQuantity } : i)
    } else {
      items = [...items, { id: recipe.outputItemId, name: recipe.outputName, quantity: recipe.outputQuantity, description: recipe.description }]
    }
    return { miscItems: items }
  }),

  learnSkill: (unitId, skillId) => set((s) => {
    const unit = s.units.find((u) => u.id === unitId)
    if (!unit || unit.skillPoints < 1) return s
    const skill = SKILL_REGISTRY[skillId]; if (!skill) return s
    const current = unit.learnedSkills[skillId] ?? 0
    if (current >= skill.maxLevel) return s
    const prereqsMet = skill.requires.every((r) => (unit.learnedSkills[r.skillId] ?? 0) >= r.minLevel)
    if (!prereqsMet) return s
    return { units: s.units.map((u) => u.id === unitId ? { ...u, skillPoints: u.skillPoints - 1, learnedSkills: { ...u.learnedSkills, [skillId]: current + 1 } } : u) }
  }),
}))
