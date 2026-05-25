// Combat Tactic Engine — type definitions (spec §3, §4, §7, §11, §12, §13).
//
// The engine consumes a roster the host RPG resolves (final stats, skills) and
// produces a deterministic BattleResult plus an event log. It owns positioning,
// turn order, damage, status effects, and win/loss — nothing about progression,
// loot, or rendering (§13).

export type Team = 'player' | 'enemy'
export type Rank = 'front' | 'mid' | 'back'

export interface Vec2 {
  x: number
  y: number
}

// ── Skills (§4) ───────────────────────────────────────────────────────────────

export type SkillType =
  | 'attack' | 'heal' | 'buff' | 'debuff' | 'summon' | 'interrupt' | 'aoe'

export type SkillTargeting =
  | 'single_enemy' | 'single_ally' | 'self' | 'aoe_enemy' | 'aoe_ally' | 'aoe_point'

export type SkillSlot = 'basic' | 'primary' | 'secondary'

export interface EngineSkill {
  id: string
  name: string
  type: SkillType
  targeting: SkillTargeting
  range: number          // max distance to use
  aoeRadius: number      // 0 for single-target
  cooldown: number       // rounds between uses
  channelTime: number    // 0 for instant, 1+ for channeled
  damageFormula: string  // e.g. "str * 1.5" — evaluated by the engine
  healFormula: string    // e.g. "int * 2.0"
  statusApplied?: string // status effect id, if any
  slot: SkillSlot
}

// ── Status effects (§7) ─────────────────────────────────────────────────────--

export interface StatModifiers {
  str?: number
  def?: number
  int?: number
  spd?: number
}

export interface StatusEffect {
  id: string
  name: string
  source: string          // unit id
  duration: number        // rounds remaining
  statModifiers: StatModifiers
  flags: string[]         // "stealthed", "rooted", "channeling", "shielded", "taunted"
}

// ── Unit interface the RPG provides (§3) ─────────────────────────────────────--

export interface EngineUnitInput {
  id: string
  name: string
  team: Team

  // Core stats (the RPG resolves these; the engine only reads them, §3.1)
  str: number
  def: number
  int: number
  spd: number
  maxHp: number
  hp: number

  preferredRank: Rank

  meleeRange: number      // grid units; melee reach
  rangedRange: number     // 0 if melee-only; >0 enables ranged basic attacks

  skills: EngineSkill[]
  potions?: number        // count of self-heal consumables available this fight
}

// ── Internal mutable combat state ────────────────────────────────────────────--

// The engine clones every input into a Combatant and never mutates the input
// (invariant §16.5). All in-combat mutation happens here.
export interface Combatant {
  id: string
  name: string
  team: Team
  index: number           // stable index across both teams; seeds damage variation (§8.1)

  str: number
  def: number
  int: number
  spd: number
  maxHp: number
  hp: number
  alive: boolean

  pos: Vec2
  preferredRank: Rank
  meleeRange: number
  rangedRange: number

  skills: EngineSkill[]
  skillCooldowns: Record<string, number>
  statuses: StatusEffect[]
  lockedTargetId: string | null
  potionsLeft: number
}

// ── Events (§12) ─────────────────────────────────────────────────────────────--

export type BattleEventType =
  | 'move' | 'melee_attack' | 'ranged_attack' | 'skill_use'
  | 'heal' | 'unit_death' | 'target_switch' | 'status_expire'

export interface BattleEvent {
  round: number
  type: BattleEventType
  sourceId: string
  targetId?: string
  value?: number
  position?: Vec2
  skillId?: string
  tacticId?: string
  extra?: Record<string, unknown>
}

// ── Setup & results (§11, §13) ───────────────────────────────────────────────--

export type CalculateDamage = (
  attacker: Readonly<Combatant>,
  defender: Readonly<Combatant>,
  skill: EngineSkill | null,
  round: number,
) => number

export interface CombatCallbacks {
  calculateDamage?: CalculateDamage
}

export interface CombatSetup {
  playerUnits: EngineUnitInput[]
  enemyUnits: EngineUnitInput[]
  callbacks?: CombatCallbacks
  maxRounds?: number
  collectEvents?: boolean   // default true; set false for fast bulk resolution (§11)
}

export type Outcome = 'ongoing' | 'victory' | 'defeat' | 'draw'

export interface BattleStats {
  totalDamageByUnit: Record<string, number>
  totalHealingByUnit: Record<string, number>
  killsByUnit: Record<string, number>
  skillsUsedByUnit: Record<string, string[]>
  potionsConsumed: number
}

export interface CombatantSnapshot {
  id: string
  name: string
  team: Team
  hp: number
  maxHp: number
  alive: boolean
  pos: Vec2
}

// Steppable battle state — `advanceRound` mutates this in place. Carries the
// engine's private copies; the input units are never touched.
export interface BattleState {
  combatants: Combatant[]
  round: number
  outcome: Outcome
  events: BattleEvent[]
  stats: BattleStats
  maxRounds: number
  collectEvents: boolean
  calculateDamage: CalculateDamage
}

export interface BattleResult {
  outcome: Exclude<Outcome, 'ongoing'>
  rounds: number
  units: CombatantSnapshot[]   // all combatants with final HP (filter by alive for survivors)
  events: BattleEvent[]
  stats: BattleStats
}
