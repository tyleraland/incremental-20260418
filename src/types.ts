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
export type TabId        = 'war' | 'armory' | 'map' | 'units' | 'inventory' | 'guild' | 'reports' | 'time'

// Each unit has a 6-slot action bar; entries either reference an equipment
// item id or an active-skill id.
export interface ActionSlotEntry {
  kind: 'item' | 'skill'
  id: string
}
export const ACTION_SLOT_COUNT = 6
export const SIDEBOARD_SLOTS: EquipSlot[] = ['sideboard1', 'sideboard2']

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
  // §threat / §passive combat mechanics granted by passive skills (Toughness /
  // Evasion / Defensive Stance). armorReduction: incoming-damage cut (0–0.5);
  // dodgePeriod: dodge every Nth hit (0 = never); threatMult: threat-per-action
  // multiplier (1 = baseline; a tank raises it to hold aggro). The adapter passes
  // these straight into the engine combatant.
  armorReduction: number
  dodgePeriod: number
  threatMult: number
}

// ── Tactics ─────────────────────────────────────────────────────────────────--

// A unit's (or the party's) equipped combat tactic. `id` indexes the engine's
// TACTIC_REGISTRY; `rank` (1–5) scales its numbers. Structurally matches the
// engine's TacticRef so it passes straight through the adapter.
export interface TacticSlot { id: string; rank: number }

// §minions: a hero's persistent beast companion, granted by the Beast Companion
// passive skill. It fights alongside the hero as an owned, leashed combatant; its
// behaviour is the player's to tune via its own `tactics` loadout (tank, dps, …).
// Stats scale with the owner's level (it "levels with the unit"); a dedicated
// companion XP track is deferred (see BACKLOG). `tactics` reuses the same engine
// catalog as heroes.
export interface CompanionInstance {
  speciesId: string        // future: multiple beasts; 'wolf' for now
  name: string
  tactics: TacticSlot[]
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
  tactics: TacticSlot[]                    // combat tactics in priority order (first = highest)
  suppressedTactics?: string[]             // skill-inherited tactic ids the player has decoupled (debug/tuning)
  companion?: CompanionInstance            // §minions: beast pet (granted by the Beast Companion passive)
  recoveryTicksLeft: number               // >0: KO countdown; 0: active, resting, or idle
  isResting: boolean                      // true after KO countdown ends, until health reaches maxHp
}

// ── Location ──────────────────────────────────────────────────────────────────

export interface Location {
  id: string; name: string; region: string; description: string
  traits: string[]; monsterIds: string[]; familiarityMax: number
  connections: string[]  // §2: locationIds reachable directly from here
  dungeonEntryRegion?: string  // §10: if set, location's detail panel exposes "Enter <Region>" → switches map to that region
  testScenarioId?: string  // §scenario: pin a SCENARIO_REGISTRY entry — overrides wave + barriers in combat
  // §open-world: when true the location runs a single *persistent* battle —
  // monsters trickle in over time (respawn) and heroes join/leave it as they
  // deploy or recover, instead of the discrete start→wipe→respawn wave model.
  // Mutually exclusive with `testScenarioId` (scenarios stay discrete for
  // deterministic testing). Default (undefined/false) = discrete encounter.
  openWorld?: boolean
  // §open-world: fixed number of monsters this location keeps on the field at
  // once (refilled one at a time as they're killed). Only read when `openWorld`.
  // Per-location and party-independent for now; defaults to OPEN_WORLD_DEFAULT_CAP.
  openWorldCap?: number
  // §open-world: side length (grid cells) of this location's square map. Only
  // read when `openWorld`; defaults to OPEN_WORLD_DEFAULT_SIZE (a large field the
  // camera can't fully fit). The party hunts across it with limited vision.
  openWorldSize?: number
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
  // Optional engine-skill kit. Each entry is built via buildEngineSkill(id, level)
  // and behaves exactly like an action-bar skill on a hero — including the
  // "skills give you tactics" merge.
  skills?: { id: string; level: number }[]
  // Optional engine tactics. Same shape as a hero's tactic loadout — opens the
  // door for skill/tactic-bearing humanoid encounters (the Elite Four, future
  // monsters with class-like kits).
  tactics?: TacticSlot[]
  // §threat / §passive combat mechanics (engine combatant fields). armorReduction:
  // incoming-damage cut (0–0.5); dodgePeriod: dodge every Nth hit; threatMult:
  // threat-generation multiplier. The adapter passes these into the engine.
  armorReduction?: number
  dodgePeriod?: number
  threatMult?: number
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

// `kind` lets the Inventory filter bar tell usable consumables (potions, food,
// salves) apart from raw crafting materials. Unset is treated as 'material'.
export interface MiscItem { id: string; name: string; quantity: number; description?: string; kind?: 'consumable' | 'material' }

export interface RecipeIngredient { itemId: string; quantity: number }

// Crafting tab grouping for the output. Defaults to 'misc' when unset.
export type RecipeCategory = 'consumable' | 'equipment' | 'misc'

export interface CraftingRecipe {
  id: string; name: string; description: string
  category?: RecipeCategory
  // For equipment recipes, the item category produced — lets the shared Inventory
  // filter slot a craftable weapon/armor/accessory under the matching chip.
  outputCategory?: ItemCategory
  ingredients: RecipeIngredient[]
  outputItemId: string; outputName: string; outputQuantity: number
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
  // Per-hero combat breakdown at this location (battle-report "per character"
  // table). Keyed by unitId; each is the same rich tally as the per-unit lifetime
  // stats, but scoped to fights *here*. Optional for back-compat (migrates to {}).
  byUnit?: Record<string, UnitCombatStats>
}

// Effectiveness buckets for damage a unit *dealt*: how the element matrix landed
// (§3). `effective` = >1× (super-effective), `neutral` = 1×, `resisted` = <1×,
// `immune` = 0× (no damage). Counts are per landed hit.
export interface EffectivenessTally {
  effective: number
  neutral: number
  resisted: number
  immune: number
}

// Per-unit lifetime combat tally (persisted), accumulated across every battle a
// hero fights — and the shared shape for the rolling-window history buckets and
// the per-location `byUnit` breakdown. `combatTicks` is the rate denominator —
// ticks the unit spent as a live combatant — so DPS / items-per-minute are
// derivable. Kills and items are credited to the unit that landed the final blow.
// The richer fields (taken / hits / element & effectiveness maps) power the
// battle-report analytics; older saves migrate the missing fields to 0 / {}.
export interface UnitCombatStats {
  damageDealt: number
  monstersDefeated: number
  itemsFound: number
  combatTicks: number
  // ── battle-report analytics (added) ──────────────────────────────────────────
  spellDamageDealt: number                 // damage dealt via skills/spells (subset of damageDealt)
  hits: number                             // attacks/skills this unit landed (value > 0)
  misses: number                           // this unit's attacks the target dodged
  damageTaken: number                      // incoming damage this unit absorbed
  dodges: number                           // incoming attacks this unit dodged
  healingDone: number                      // HP this unit restored to allies
  expGained: number                        // XP credited (floored at display)
  levelsGained: number                     // level-ups while tracked
  dmgDealtByElement: Record<string, number> // element → damage dealt with it
  dmgTakenByElement: Record<string, number> // element → damage taken from it
  effDealt: EffectivenessTally             // how the unit's outgoing damage landed
}

// Alias: the same shape is used for lifetime stats, rolling-window buckets, and
// the per-location per-hero breakdown — they all accumulate the same combat tally.
export type CombatTally = UnitCombatStats

// One bucket of the per-unit rolling history. `bucket` is an absolute index
// (floor(tick / HISTORY_BUCKET_TICKS)); summing the last K buckets answers
// "last K minutes". Buckets are pruned to a bounded window (see combatTally.ts).
export interface StatBucket {
  bucket: number
  tally: UnitCombatStats
}
