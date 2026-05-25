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
  knockback?: number     // grid units to push affected enemies away from the caster (§2)
  retreatAfter?: number  // rows the caster falls back after the cast resolves
  zone?: { dotDamage: number; duration: number }  // place a persistent ground hazard (aoe_point)
  stealthBonus?: number  // damage multiplier when cast from stealth (Back Stab, §3)
  dispelCategory?: 'buff' | 'debuff'  // strip statuses of this category from affected targets
  removesStatusId?: string            // strip a specific status from affected targets (Sight → stealthed)
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
  flags: string[]         // "stealthed", "rooted", "channeling", "shielded", "taunted", "frozen"
  dotDamage?: number      // damage dealt to the bearer each round (poison etc.)
  damageTakenMult?: number // incoming-damage multiplier while active (vulnerability, §3 combos)
  category?: 'buff' | 'debuff' | 'control'  // what Dispel/cleanse can strip
}

// ── Tactics (§5) ─────────────────────────────────────────────────────────────--

export type TacticChannel = 'movement' | 'targeting' | 'action' | 'reaction' | 'passive'
export type TacticScope = 'unit' | 'party'

export interface TacticRef {
  id: string
  rank: number   // 1–5; scales numeric parameters (§15)
}

// What a movement tactic decides for this turn (null fields fall back to default).
export interface MovementResult {
  speedMult?: number            // multiply base move speed when advancing on the lock
  awayFromNearestEnemy?: boolean // retreat toward own edge instead of advancing
  rows?: number                 // distance to fall back (with awayFromNearestEnemy)
  hold?: boolean                // do not move this turn
  skipAction?: boolean          // also skip the attack this turn
  clearLock?: boolean           // disengage: drop the locked target
}

export interface ActionResult {
  skipAttack?: boolean
  applyStatusToSelf?: StatusEffect
  castSkill?: EngineSkill        // a skill the unit wants to cast this turn
  skillTarget?: string          // combatant id the skill is aimed at (primary target)
}

export interface ReactionResult {
  applyStatusToSelf?: StatusEffect
  counterAttack?: string        // combatant id to immediately basic-attack
  consumesTurn?: boolean
}

// Catalog entry. Behaviour is expressed as channel-specific functions (only the
// one matching `channel` is consulted). Passives carry no function — their
// effect is read directly by the damage/targeting code via the helpers in
// tactics.ts. The engine resolves a unit's TacticRefs into these defs.
export interface TacticDef {
  id: string
  name: string
  description: string
  scope: TacticScope
  channel: TacticChannel
  cooldown?: number             // rounds between activations (0/undefined = always)
  oncePerCombat?: boolean
  override?: boolean            // party tactics: inject at the TOP instead of bottom (§5.5)
  targeting?: (self: Combatant, state: BattleState, rank: number) => string | null
  movement?:  (self: Combatant, state: BattleState, rank: number) => MovementResult | null
  action?:    (self: Combatant, state: BattleState, rank: number) => ActionResult | null
  reaction?:  (self: Combatant, state: BattleState, rank: number) => ReactionResult | null
}

export interface ResolvedTactic {
  def: TacticDef
  rank: number
}



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
  tactics?: TacticRef[]   // unit-level tactics, priority order (first = highest)
}

// An in-progress channeled cast (channelTime ≥ 1). Resolves when roundsLeft hits
// 0 on the caster's turn; cleared (no cooldown) if the caster is hit meanwhile.
export interface ChannelState {
  skillId: string
  targetId: string
  roundsLeft: number
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

  // Tactics (§5)
  tactics: ResolvedTactic[]              // unit tactics + injected party tactics, priority order
  tacticCooldowns: Record<string, number>
  tacticsUsed: string[]                  // once-per-combat tactic ids that have fired
  chargeUsed: boolean                    // Charger's first-hit damage bonus consumed
  attacksReceived: number                // for Nimble's deterministic dodge
  lastHitById: string | null             // attacker since this unit's last turn (Counterattacker)
  channel: ChannelState | null           // active channeled cast, if any (§4 cast time)
}

// ── Events (§12) ─────────────────────────────────────────────────────────────--

export type BattleEventType =
  | 'move' | 'melee_attack' | 'ranged_attack' | 'skill_use'
  | 'heal' | 'unit_death' | 'target_switch' | 'status_expire'
  | 'dodge' | 'retreat' | 'buff_apply'
  | 'cast_start' | 'interrupt' | 'dot' | 'knockback'

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
  playerPartyTactics?: TacticRef[]   // team-wide tactics injected into every player unit (§5.5)
  enemyPartyTactics?: TacticRef[]
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

// A persistent ground hazard (e.g. Firewall). Units of the affected team inside
// the radius take `dotDamage` each round until `roundsLeft` runs out (§2 zones).
export interface BattleZone {
  id: string
  sourceId: string        // caster (for kill attribution)
  team: Team              // which team is affected (units standing in it)
  pos: Vec2
  radius: number
  dotDamage: number
  roundsLeft: number
  skillId: string
}

// Steppable battle state — `advanceRound` mutates this in place. Carries the
// engine's private copies; the input units are never touched.
export interface BattleState {
  combatants: Combatant[]
  zones: BattleZone[]
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
