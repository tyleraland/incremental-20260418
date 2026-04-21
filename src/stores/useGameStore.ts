import { create } from 'zustand'

// ── Trait system ──────────────────────────────────────────────────────────────

export type TraitCategory =
  | 'damage-type'
  | 'element'
  | 'stat'
  | 'item-type'
  | 'environment'
  | 'class'
  | 'proficiency'
  | 'general'

export interface Trait {
  id: string
  label: string
  category: TraitCategory
  description: string
  colorClass?: string // overrides category default
}

export const TRAIT_REGISTRY: Record<string, Trait> = {
  // Damage types
  slashing:    { id: 'slashing',    label: 'Slashing',    category: 'damage-type', description: 'Deals cutting damage. Effective against lightly armored targets.' },
  piercing:    { id: 'piercing',    label: 'Piercing',    category: 'damage-type', description: 'Deals puncturing damage. Bypasses a portion of physical defense.' },
  bludgeoning: { id: 'bludgeoning', label: 'Bludgeoning', category: 'damage-type', description: 'Deals blunt force damage. Effective against heavy or rigid armor.' },
  // Elements
  fire:        { id: 'fire',        label: 'Fire',        category: 'element', description: 'Imbued with fire energy. Has a chance to inflict Burning.', colorClass: 'bg-orange-950 text-orange-300 border-orange-700/50' },
  lightning:   { id: 'lightning',   label: 'Lightning',   category: 'element', description: 'Imbued with electrical energy. Fast and unpredictable.', colorClass: 'bg-yellow-950 text-yellow-300 border-yellow-700/50' },
  ice:         { id: 'ice',         label: 'Ice',         category: 'element', description: 'Imbued with cold energy. May reduce target\'s speed.', colorClass: 'bg-sky-950 text-sky-300 border-sky-700/50' },
  earth:       { id: 'earth',       label: 'Earth',       category: 'element', description: 'Imbued with earth energy. Stable and powerful.', colorClass: 'bg-lime-950 text-lime-300 border-lime-700/50' },
  wind:        { id: 'wind',        label: 'Wind',        category: 'element', description: 'Imbued with wind energy. High speed, reduced weight.', colorClass: 'bg-teal-950 text-teal-300 border-teal-700/50' },
  // Item types
  '1h':        { id: '1h',          label: '1H',          category: 'item-type', description: 'One-handed. Can be paired with a shield, second weapon, or accessory in the off-hand.' },
  '2h':        { id: '2h',          label: '2H',          category: 'item-type', description: 'Two-handed. Requires both hands — the off-hand slot is locked while equipped.' },
  'tool':      { id: 'tool',        label: 'Tool',        category: 'item-type', description: 'Utility tool for gathering, crafting, or exploration. Occupies the dedicated Tool slot.' },
  'shield':    { id: 'shield',      label: 'Shield',      category: 'item-type', description: 'Off-hand defensive equipment. Provides bonus Defense when equipped.' },
  // Weight
  light:       { id: 'light',       label: 'Light',       category: 'general',   description: 'Lightweight equipment. Minimal movement penalty.' },
  heavy:       { id: 'heavy',       label: 'Heavy',       category: 'general',   description: 'Heavy equipment. May reduce speed but offers better protection.' },
  versatile:   { id: 'versatile',   label: 'Versatile',   category: 'general',   description: 'Can be used effectively in multiple contexts.' },
  // Environment
  forest:      { id: 'forest',      label: 'Forest',      category: 'environment', description: 'Dense woodland. Good for timber, herbs, and hunting.' },
  shadow:      { id: 'shadow',      label: 'Shadow',      category: 'environment', description: 'Dimly lit and treacherous. Increases risk, may yield rare finds.' },
  water:       { id: 'water',       label: 'Water',       category: 'environment', description: 'Aquatic environment. Enables fishing and water-based gathering.' },
  mining:      { id: 'mining',      label: 'Mining',      category: 'environment', description: 'Rich in ore deposits. Requires a Pickaxe to extract efficiently.' },
  ruins:       { id: 'ruins',       label: 'Ruins',       category: 'environment', description: 'Ancient structures that may contain hidden items or dangers.' },
  hunting:     { id: 'hunting',     label: 'Hunting',     category: 'environment', description: 'Abundant game. A Skinning Knife improves yield from hunted animals.' },
  fishing:     { id: 'fishing',     label: 'Fishing',     category: 'environment', description: 'Active fishing grounds. Requires a Fishing Rod.' },
  lumber:      { id: 'lumber',      label: 'Lumber',      category: 'environment', description: 'Harvestable timber. A Handaxe or Woodcutter\'s Axe is recommended.' },
  dangerous:   { id: 'dangerous',   label: 'Dangerous',   category: 'environment', description: 'High threat level. Units assigned here face greater risk.' },
  rocky:       { id: 'rocky',       label: 'Rocky',       category: 'environment', description: 'Rugged terrain with exposed rock faces and ore veins.' },
  calm:        { id: 'calm',        label: 'Calm',        category: 'environment', description: 'Peaceful area with low threat level.' },
  // Classes
  warrior:     { id: 'warrior',     label: 'Warrior',     category: 'class', description: 'A combat-trained fighter. Proficient with swords, shields, and heavy armor.' },
  mage:        { id: 'mage',        label: 'Mage',        category: 'class', description: 'A student of arcane arts. Specializes in magical weaponry and high SP.ATK.' },
  rogue:       { id: 'rogue',       label: 'Rogue',       category: 'class', description: 'A nimble operative. Favors light weapons, tools, and stealth.' },
  // Proficiencies
  'prof-swords':    { id: 'prof-swords',    label: 'Swords',    category: 'proficiency', description: 'Trained with swords. Improved accuracy and damage with sword-type weapons.' },
  'prof-heavy-armor': { id: 'prof-heavy-armor', label: 'Heavy Armor', category: 'proficiency', description: 'Accustomed to heavy armor. No movement penalty when wearing chain or plate.' },
  'prof-tools':     { id: 'prof-tools',     label: 'Tools',     category: 'proficiency', description: 'Experienced with gathering tools. Improved yield from tool-based activities.' },
  'prof-staves':    { id: 'prof-staves',    label: 'Staves',    category: 'proficiency', description: 'Proficient with staves. Increases magical power when using staff weapons.' },
  'prof-wands':     { id: 'prof-wands',     label: 'Wands',     category: 'proficiency', description: 'Proficient with wands. Faster casting speed with wand-type weapons.' },
  'prof-mining':    { id: 'prof-mining',    label: 'Mining',    category: 'proficiency', description: 'Skilled miner. Greater ore yield and faster extraction.' },
  'prof-daggers':   { id: 'prof-daggers',   label: 'Daggers',   category: 'proficiency', description: 'Proficient with daggers. High critical hit rate.' },
  'prof-lockpicks': { id: 'prof-lockpicks', label: 'Lockpicks', category: 'proficiency', description: 'Experienced with lockpicks. Can unlock doors and chests.' },
}

// Map proficiency strings to trait IDs
const PROF_TO_TRAIT: Record<string, string> = {
  'Swords': 'prof-swords',
  'Heavy Armor': 'prof-heavy-armor',
  'Tools': 'prof-tools',
  'Staves': 'prof-staves',
  'Wands': 'prof-wands',
  'Mining': 'prof-mining',
  'Daggers': 'prof-daggers',
  'Lockpicks': 'prof-lockpicks',
}

/** Returns all trait objects for a unit (class + proficiencies). */
export function getUnitTraits(unit: Unit): Trait[] {
  const traits: Trait[] = []
  if (unit.class) {
    const t = TRAIT_REGISTRY[unit.class.toLowerCase()]
    if (t) traits.push(t)
  }
  for (const prof of unit.proficiencies) {
    const id = PROF_TO_TRAIT[prof]
    const t = id ? TRAIT_REGISTRY[id] : undefined
    if (t) traits.push(t)
  }
  return traits
}

/** Returns all trait objects for an equipment item (explicit + stat-derived). */
export function getItemTraits(item: EquipmentItem): Trait[] {
  const traits: Trait[] = item.traits
    .map((id) => TRAIT_REGISTRY[id])
    .filter(Boolean) as Trait[]

  const statEntries: [keyof EquipmentItem['stats'], string, string][] = [
    ['attack',        'ATK',    'physical attack power'],
    ['defense',       'DEF',    'physical defense'],
    ['specialAttack', 'SP.ATK', 'magical attack power'],
    ['specialDefense','SP.DEF', 'magical defense'],
  ]
  for (const [key, short, desc] of statEntries) {
    const v = item.stats[key]
    if (v) {
      traits.push({
        id: `gen-${key}-${v}`,
        label: `+${v} ${short}`,
        category: 'stat',
        description: `Increases ${desc} by ${v} points.`,
      })
    }
  }
  return traits
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type EquipSlot = 'mainHand' | 'offHand' | 'tool' | 'armor' | 'accessory'
export type ItemCategory = 'weapon-1h' | 'weapon-2h' | 'tool' | 'shield' | 'armor' | 'accessory'
export type TabId = 'map' | 'units' | 'inventory'

export interface Unit {
  id: string
  name: string
  level: number
  exp: number
  expToNext: number
  age: number
  health: number
  class: string | null
  proficiencies: string[]
  stats: { attack: number; defense: number; specialAttack: number; specialDefense: number }
  locationId: string | null
  equipment: Record<EquipSlot, string | null>
}

export interface Location {
  id: string
  name: string
  description: string
  traits: string[]
}

export interface EquipmentItem {
  id: string
  name: string
  category: ItemCategory
  traits: string[]
  stats: { attack?: number; defense?: number; specialAttack?: number; specialDefense?: number }
  description?: string
}

export interface MiscItem {
  id: string
  name: string
  quantity: number
  description?: string
}

export const SLOT_COMPATIBLE: Record<EquipSlot, ItemCategory[]> = {
  mainHand: ['weapon-1h', 'weapon-2h'],
  offHand:  ['weapon-1h', 'shield', 'accessory'],
  tool:     ['tool'],
  armor:    ['armor'],
  accessory:['accessory'],
}

export const SLOT_LABELS: Record<EquipSlot, string> = {
  mainHand:  'Main Hand',
  offHand:   'Off Hand',
  tool:      'Tool',
  armor:     'Armor',
  accessory: 'Accessory',
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  'weapon-1h': '1H Weapon',
  'weapon-2h': '2H Weapon',
  tool:        'Tool',
  shield:      'Shield',
  armor:       'Armor',
  accessory:   'Accessory',
}

// ── Initial data ──────────────────────────────────────────────────────────────

const LOCATIONS: Location[] = [
  { id: 'kings-forest', name: "King's Forest", description: 'A dense royal forest rich with timber and game.', traits: ['forest', 'lumber', 'hunting'] },
  { id: 'duskwood',     name: 'Duskwood Forest', description: 'A shadowed wood where the trees grow unnaturally tall.', traits: ['forest', 'shadow', 'dangerous'] },
  { id: 'lake-arawok',  name: 'Lake Arawok', description: 'A vast freshwater lake, calm on the surface.', traits: ['water', 'fishing', 'calm'] },
  { id: 'gray-hills',   name: 'Gray Hills', description: 'Rocky highlands rich with ore and ancient ruins.', traits: ['rocky', 'mining', 'ruins'] },
]

const UNITS: Unit[] = [
  { id: 'u1', name: 'Aldric',  level: 3, exp: 245, expToNext: 312, age: 24, health: 95,  class: 'Warrior', proficiencies: ['Swords', 'Heavy Armor'], stats: { attack: 5, defense: 4, specialAttack: 1, specialDefense: 2 }, locationId: null,          equipment: { mainHand: 'eq-sword-1h',  offHand: 'eq-shield-wood', tool: null,         armor: 'eq-leather', accessory: null } },
  { id: 'u2', name: 'Mira',    level: 2, exp:  80, expToNext: 180, age: 19, health: 100, class: null,       proficiencies: ['Tools'],                  stats: { attack: 2, defense: 2, specialAttack: 2, specialDefense: 2 }, locationId: 'kings-forest', equipment: { mainHand: null,           offHand: null,             tool: 'eq-handaxe', armor: null,         accessory: null } },
  { id: 'u3', name: 'Theron',  level: 4, exp: 420, expToNext: 520, age: 31, health: 82,  class: 'Mage',     proficiencies: ['Staves', 'Wands'],        stats: { attack: 2, defense: 1, specialAttack: 8, specialDefense: 5 }, locationId: 'gray-hills',   equipment: { mainHand: 'eq-staff',     offHand: null,             tool: null,         armor: null,         accessory: null } },
  { id: 'u4', name: 'Sera',    level: 1, exp:  20, expToNext: 100, age: 16, health: 100, class: null,       proficiencies: [],                         stats: { attack: 2, defense: 1, specialAttack: 1, specialDefense: 1 }, locationId: null,          equipment: { mainHand: null,           offHand: null,             tool: null,         armor: null,         accessory: null } },
  { id: 'u5', name: 'Davan',   level: 2, exp: 120, expToNext: 180, age: 28, health: 67,  class: null,       proficiencies: ['Tools', 'Mining'],        stats: { attack: 3, defense: 2, specialAttack: 1, specialDefense: 2 }, locationId: null,          equipment: { mainHand: null,           offHand: null,             tool: 'eq-pickaxe', armor: null,         accessory: null } },
  { id: 'u6', name: 'Lyra',    level: 5, exp: 750, expToNext: 800, age: 35, health: 90,  class: 'Rogue',    proficiencies: ['Daggers', 'Lockpicks'],   stats: { attack: 7, defense: 3, specialAttack: 4, specialDefense: 3 }, locationId: 'lake-arawok',  equipment: { mainHand: 'eq-shortsword',offHand: null,             tool: null,         armor: 'eq-leather', accessory: null } },
]

const EQUIPMENT: EquipmentItem[] = [
  { id: 'eq-handaxe',       name: 'Handaxe',          category: 'tool',      traits: ['tool', 'slashing', 'light'],             stats: {},                description: 'Good for gathering wood.' },
  { id: 'eq-pickaxe',       name: 'Pickaxe',           category: 'tool',      traits: ['tool', 'piercing'],                      stats: {},                description: 'Essential for mining ore.' },
  { id: 'eq-skinning-knife',name: 'Skinning Knife',    category: 'tool',      traits: ['tool', 'slashing', 'light'],             stats: { attack: 1 },    description: 'Sharp blade for preparing game.' },
  { id: 'eq-lockpick',      name: 'Lockpick',          category: 'tool',      traits: ['tool', 'light'],                         stats: {},                description: 'Opens locks without a key.' },
  { id: 'eq-sword-1h',      name: 'Iron Sword',        category: 'weapon-1h', traits: ['1h', 'slashing'],                        stats: { attack: 4 },    description: 'A reliable iron blade.' },
  { id: 'eq-shortsword',    name: 'Shortsword',        category: 'weapon-1h', traits: ['1h', 'slashing', 'light'],               stats: { attack: 3 },    description: 'Light and fast.' },
  { id: 'eq-wand',          name: 'Wand',              category: 'weapon-1h', traits: ['1h', 'light'],                           stats: { specialAttack: 4 }, description: 'Channels magical energy.' },
  { id: 'eq-greatsword',    name: 'Greatsword',        category: 'weapon-2h', traits: ['2h', 'slashing', 'heavy'],               stats: { attack: 9 },    description: 'Massive two-handed blade. Locks off-hand.' },
  { id: 'eq-staff',         name: 'Staff',             category: 'weapon-2h', traits: ['2h', 'bludgeoning'],                     stats: { specialAttack: 6 }, description: 'Two-handed magical focus. Locks off-hand.' },
  { id: 'eq-shield-wood',   name: 'Wooden Shield',     category: 'shield',    traits: ['shield', 'bludgeoning', 'light'],        stats: { defense: 2 },   description: 'Basic wooden protection.' },
  { id: 'eq-shield-iron',   name: 'Iron Shield',       category: 'shield',    traits: ['shield', 'bludgeoning', 'heavy'],        stats: { defense: 5 },   description: 'Solid iron shield.' },
  { id: 'eq-leather',       name: 'Leather Armor',     category: 'armor',     traits: ['light'],                                 stats: { defense: 2 },   description: 'Light but sturdy protection.' },
  { id: 'eq-chainmail',     name: 'Chain Mail',        category: 'armor',     traits: ['heavy'],                                 stats: { defense: 5 },   description: 'Linked iron rings.' },
]

const MISC: MiscItem[] = [
  { id: 'm1', name: 'Wood',     quantity: 42, description: 'Raw timber.' },
  { id: 'm2', name: 'Iron Ore', quantity: 18, description: 'Unrefined ore.' },
  { id: 'm3', name: 'Fish',     quantity:  7, description: 'Fresh catch.' },
  { id: 'm4', name: 'Herbs',    quantity: 23, description: 'Medicinal herbs.' },
]

// ── Store ─────────────────────────────────────────────────────────────────────

interface GameState {
  units: Unit[]
  locations: Location[]
  equipment: EquipmentItem[]
  miscItems: MiscItem[]
  activeTab: TabId
  selectedUnitIds: string[]
  expandedLocationIds: string[]
  expandedUnitIds: string[]
  equipContext: { unitId: string; slot: EquipSlot } | null

  setActiveTab: (tab: TabId) => void
  toggleLocation: (id: string) => void
  toggleUnit: (id: string) => void
  toggleSelectUnit: (id: string) => void
  clearSelection: () => void
  assignUnits: (unitIds: string[], locationId: string | null) => void
  equipItem: (unitId: string, slot: EquipSlot, itemId: string | null) => void
  openEquipFor: (unitId: string, slot: EquipSlot) => void
  closeEquipContext: () => void
}

export const useGameStore = create<GameState>((set) => ({
  units: UNITS,
  locations: LOCATIONS,
  equipment: EQUIPMENT,
  miscItems: MISC,
  activeTab: 'map',
  selectedUnitIds: [],
  expandedLocationIds: [],
  expandedUnitIds: [],
  equipContext: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleLocation: (id) => set((s) => ({ expandedLocationIds: s.expandedLocationIds.includes(id) ? s.expandedLocationIds.filter((x) => x !== id) : [...s.expandedLocationIds, id] })),
  toggleUnit: (id) => set((s) => ({ expandedUnitIds: s.expandedUnitIds.includes(id) ? s.expandedUnitIds.filter((x) => x !== id) : [...s.expandedUnitIds, id] })),
  toggleSelectUnit: (id) => set((s) => ({ selectedUnitIds: s.selectedUnitIds.includes(id) ? s.selectedUnitIds.filter((x) => x !== id) : [...s.selectedUnitIds, id] })),
  clearSelection: () => set({ selectedUnitIds: [] }),
  assignUnits: (unitIds, locationId) => set((s) => ({ units: s.units.map((u) => (unitIds.includes(u.id) ? { ...u, locationId } : u)), selectedUnitIds: [] })),
  equipItem: (unitId, slot, itemId) => set((s) => ({ units: s.units.map((u) => u.id === unitId ? { ...u, equipment: { ...u.equipment, [slot]: itemId } } : u) })),
  openEquipFor: (unitId, slot) => set({ equipContext: { unitId, slot }, activeTab: 'inventory' }),
  closeEquipContext: () => set({ equipContext: null }),
}))
