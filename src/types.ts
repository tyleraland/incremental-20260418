// ── Trait system ──────────────────────────────────────────────────────────────

export type TraitCategory =
  | 'damage-type' | 'element' | 'stat' | 'item-type'
  | 'environment' | 'class' | 'proficiency' | 'general'

import type { Element } from '@/lib/elements'
export type { Element } from '@/lib/elements'

export interface Trait {
  id: string
  label: string
  category: TraitCategory
  description: string
  colorClass?: string
}

// ── Skill system ──────────────────────────────────────────────────────────────

export interface SkillBonuses {
  attack?: number; defense?: number; magicAttack?: number; magicDefense?: number
  attackSpeed?: number; accuracy?: number; dodge?: number
  moveSpeed?: number; attackRange?: number
  strength?: number; agility?: number; dexterity?: number; constitution?: number; intelligence?: number
}

export type SkillType   = 'passive' | 'active'
export type SkillTarget = 'self' | 'party' | 'monster-target' | 'aggro'

export interface SkillDef {
  id: string
  name: string
  maxLevel: number
  description: (level: number) => string
  requires: { skillId: string; minLevel: number }[]
  getBonuses: (level: number) => SkillBonuses
  type?: SkillType    // default: 'passive'
  target?: SkillTarget // default: 'self'
}

// ── Equipment & slot types ────────────────────────────────────────────────────

export type EquipSlot    = 'mainHand' | 'offHand' | 'sideboard1' | 'sideboard2' | 'armor' | 'accessory'
export type ItemCategory = 'weapon-1h' | 'weapon-2h' | 'tool' | 'shield' | 'armor' | 'accessory'
export type TabId        = 'map' | 'combat' | 'units' | 'inventory' | 'guild' | 'time'

// Each unit has a 6-slot action bar; entries either reference an equipment
// item id or an active-skill id.
export interface ActionSlotEntry {
  kind: 'item' | 'skill'
  id: string
}
export const ACTION_SLOT_COUNT = 6
export const SIDEBOARD_SLOTS: EquipSlot[] = ['sideboard1', 'sideboard2']
// Monster slot priority (per-location, per-monsterId-via-slot):
//   ≥ 1: focusable; higher = attacked first. 1 = normal, 2/3/… = bumped.
//   0  : ignore — party doesn't attack but the monster still engages.
//   -1 : avoid — party flees the location.
export type Priority = number
export const PRIORITY_NORMAL = 1
export const PRIORITY_IGNORE = 0
export const PRIORITY_AVOID  = -1

// §5: weapon sets — hand slots are switchable; armor/tool/accessory are shared
export type WeaponRecord = { mainHand: string | null; offHand: string | null }

// ── Core stat types ───────────────────────────────────────────────────────────

export interface Abilities {
  strength: number; agility: number; dexterity: number; constitution: number; intelligence: number
}

export interface DerivedStats {
  attack: number; defense: number; defenseEquip: number; magicAttack: number; magicDefense: number
  attackSpeed: number; accuracy: number; dodge: number; maxHp: number
  moveSpeed: number   // ft/s; divide by TICKS_PER_SECOND for ft/tick in the movement loop
  attackRange: number // feet; gap ≤ this → attacks land (melee=5, bow=35)
  attackElement: Element // 'neutral' unless a weapon imbues otherwise
  armorElement:  Element // 'neutral' unless armor imbues otherwise
}

// ── Unit ──────────────────────────────────────────────────────────────────────

export interface Unit {
  id: string; name: string; level: number; exp: number; expToNext: number
  age: number; health: number; class: string | null; proficiencies: string[]
  abilities: Abilities
  abilityPoints: number
  skillPoints: number
  learnedSkills: Record<string, number>
  locationId: string | null
  travelPath: string[] | null              // §4: ordered remaining waypoints; null = at destination
  equipment: { armor: string | null; sideboard1: string | null; sideboard2: string | null; accessory: string | null }
  weaponSets: [WeaponRecord, WeaponRecord] // §5: set A and set B
  activeWeaponSet: 0 | 1                  // §5: which weapon set is active
  actionSlots: (ActionSlotEntry | null)[] // length ACTION_SLOT_COUNT; tap/drag-to-fill
  recoveryTicksLeft: number               // >0: KO countdown; 0: active, resting, or idle
  isResting: boolean                      // true after KO countdown ends, until health reaches maxHp
}

// ── Location ──────────────────────────────────────────────────────────────────

export interface Location {
  id: string; name: string; region: string; description: string
  traits: string[]; monsterIds: string[]; familiarityMax: number
  connections: string[]  // §2: locationIds reachable directly from here
  dungeonEntryRegion?: string  // §10: if set, location's detail panel exposes "Enter <Region>" → switches map to that region
}

// ── Monster ───────────────────────────────────────────────────────────────────

export type MonsterSize    = 'small' | 'medium' | 'large'

export interface MonsterDrop {
  itemId: string
  dropRate: number
  quantityMin: number
  quantityMax: number
}

export interface MonsterStats {
  attack: number
  defense: [number, number]      // [ability, armor]
  magicAttack: number
  magicDefense: [number, number] // [ability, armor]
  attackSpeed: number
  accuracy: number
  dodge: number
  moveSpeed?: number             // 1D distance closed per tick (default 1)
  attackRange?: number           // max gap at which attacks land (default 1)
}

export interface MonsterDef {
  id: string
  name: string
  level: number
  health: number
  stats: MonsterStats
  drops: MonsterDrop[]
  element: Element  // §3: defensive armor element; monster attacks are always neutral (default 'neutral')
  size: MonsterSize        // §3: default 'medium'
  isBoss?: boolean         // §3: undefined = false
  attackName: string
}

// ── Equipment item ────────────────────────────────────────────────────────────

export interface EquipmentItem {
  id: string; name: string; category: ItemCategory; traits: string[]
  stats: { attack?: number; defense?: number; specialAttack?: number; specialDefense?: number; range?: number }
  description?: string
  slots?: number          // §6: card sockets (0–4); default 0
  requiredLevel?: number  // minimum unit level to equip
  requiredClasses?: string[] // class whitelist; null/Novice counts as 'Novice'
  // Weapons set the unit's attackElement; armor sets armorElement.
  // Multiple sources resolve LIFO once temporary skill imbues exist; for now
  // mainHand wins over offHand and the armor slot drives armorElement.
  element?: Element
}

// ── Misc & crafting ───────────────────────────────────────────────────────────

export interface MiscItem { id: string; name: string; quantity: number; description?: string }

export interface RecipeIngredient { itemId: string; quantity: number }

export interface CraftingRecipe {
  id: string; name: string; description: string
  ingredients: RecipeIngredient[]
  outputItemId: string; outputName: string; outputQuantity: number
}

// ── Encounter model ───────────────────────────────────────────────────────────

// §9: replaces the three parallel arrays (activeEncounters, encounterProgress, encounterTargets)
// and the monsterId-keyed locationStrategy map
export interface EncounterSlot {
  monsterId: string
  progress: number            // 0..1; reaches 1 when monster is defeated, slot then removed
  targetUnitId: string | null // which unit this monster is targeting
  priority: Priority          // -1=avoid, 0=ignore, ≥1=focusable (higher first)
  threat:   Record<string, number>  // unitId → accumulated HP-equivalent damage dealt; resets per spawn
  phase: 'approaching' | 'standing' | 'retreating'  // derived from gap vs attackRange; stored for UI ease
  distance: number            // monster's position on the 1D combat axis (0 = unit base line); gap = distance - unitPos
  dealtHistory: number[]      // HP damage dealt on attack events (for rolling DPS)
  takenHistory: number[]      // progress chunks taken on hit events (for rolling DPS)
  attackCooldown: number      // ticks until this monster's next attack on a unit (0 = fires this tick)
  progressCooldown: number    // ticks until next unit hit lands on this slot (0 = fires this tick)
  lastAttackMissed: boolean   // true if monster's most recent attack was a miss
  lastProgressMissed: boolean // true if unit's most recent attack on this slot was a miss
}

// ── Event log ─────────────────────────────────────────────────────────────────

// §7: ring buffer of game events; max 200 entries
export type LogCategory = 'loot' | 'levelup' | 'ko' | 'defeat' | 'flee' | 'craft' | 'travel' | 'offline'

export interface LogEntry {
  tick: number
  category: LogCategory
  message: string
}

// ── Per-location combat stats ─────────────────────────────────────────────────

// Cumulative combat outcomes accumulated at a location, used to render the
// post-hoc Combat Report. Designed so we can later compute reports over
// arbitrary windows (since-anyone-arrived, since-X-arrived) by diffing two
// snapshots of this aggregate, rather than journaling every event.
export interface LocationCombatStats {
  startTick: number                       // tick the aggregate started counting
  monstersDefeated: Record<string, number> // monsterId → count
  itemsDropped:     Record<string, number> // itemId → count (loot system stub)
  expDistributed: number                  // exp per unit (1 per kill at this location)
  goldEarned: number
}
