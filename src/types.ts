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

// ── Skill system ──────────────────────────────────────────────────────────────

export interface SkillBonuses {
  attack?: number; defense?: number; magicAttack?: number; magicDefense?: number
  attackSpeed?: number; accuracy?: number; dodge?: number
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

export type EquipSlot    = 'mainHand' | 'offHand' | 'tool' | 'armor' | 'accessory'
export type ItemCategory = 'weapon-1h' | 'weapon-2h' | 'tool' | 'shield' | 'armor' | 'accessory'
export type TabId        = 'map' | 'units' | 'inventory' | 'guild' | 'time' | 'codex'
export type MonsterBehavior = 'normal' | 'prioritize' | 'ignore' | 'avoid'

// §5: weapon sets — hand slots are switchable; armor/tool/accessory are shared
export type WeaponRecord = { mainHand: string | null; offHand: string | null }

// ── Core stat types ───────────────────────────────────────────────────────────

export interface Abilities {
  strength: number; agility: number; dexterity: number; constitution: number; intelligence: number
}

export interface DerivedStats {
  attack: number; defense: number; magicAttack: number; magicDefense: number
  attackSpeed: number; accuracy: number; dodge: number; maxHp: number
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
  equipment: { armor: string | null; tool: string | null; accessory: string | null }
  weaponSets: [WeaponRecord, WeaponRecord] // §5: set A and set B
  activeWeaponSet: 0 | 1                  // §5: which weapon set is active
  recoveryTicksLeft: number               // >0: KO countdown; 0: active or regenerating
}

// ── Location ──────────────────────────────────────────────────────────────────

export interface Location {
  id: string; name: string; region: string; description: string
  traits: string[]; monsterIds: string[]; familiarityMax: number
  connections: string[]  // §2: locationIds reachable directly from here
}

// ── Monster ───────────────────────────────────────────────────────────────────

export type MonsterElement = 'fire' | 'lightning' | 'ice' | 'earth' | 'wind' | 'water' | 'neutral'
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
}

export interface MonsterDef {
  id: string
  name: string
  level: number
  health: number
  stats: MonsterStats
  drops: MonsterDrop[]
  element: MonsterElement  // §3: default 'neutral'
  size: MonsterSize        // §3: default 'medium'
  isBoss?: boolean         // §3: undefined = false
  attackName: string
}

// ── Equipment item ────────────────────────────────────────────────────────────

export interface EquipmentItem {
  id: string; name: string; category: ItemCategory; traits: string[]
  stats: { attack?: number; defense?: number; specialAttack?: number; specialDefense?: number }
  description?: string
  slots?: number  // §6: card sockets (0–4); default 0
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
  behavior: MonsterBehavior   // per-slot (not per-monsterId), enabling boss differentiation
  phase: 'approaching' | 'standing' | 'retreating'
  distance: number            // distance from melee range; 0 = in combat; cosmetic until movement speed is implemented
  dealtHistory: number[]      // HP damage dealt on attack events (for rolling DPS)
  takenHistory: number[]      // progress chunks taken on hit events (for rolling DPS)
  attackCooldown: number      // ticks until this monster's next attack on a unit (0 = fires this tick)
  progressCooldown: number    // ticks until next unit hit lands on this slot (0 = fires this tick)
}

// ── Event log ─────────────────────────────────────────────────────────────────

// §7: ring buffer of game events; max 200 entries
export type LogCategory = 'loot' | 'levelup' | 'ko' | 'defeat' | 'flee' | 'craft' | 'travel' | 'offline'

export interface LogEntry {
  tick: number
  category: LogCategory
  message: string
}
