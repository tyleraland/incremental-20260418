// Combat Tactic Engine — type definitions (spec §3, §4, §7, §11, §12, §13).
//
// The engine consumes a roster the host RPG resolves (final stats, skills) and
// produces a deterministic BattleResult plus an event log. It owns positioning,
// turn order, damage, status effects, and win/loss — nothing about progression,
// loot, or rendering (§13).

import type { Element } from './elements'
export type { Element } from './elements'

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
  element?: Element       // attack element for damage (default 'neutral'); drives §3 matrix
  statusApplied?: string // status effect id, if any
  statusMaxActive?: number // cap on simultaneous instances of statusApplied across the caster's team (e.g. Agility = 1); at the cap the skill reads as not-ready
  knockback?: number     // grid units to push affected enemies away from the caster (§2)
  retreatAfter?: number  // rows the caster falls back after the cast resolves
  zone?: { dotDamage: number; duration: number; element?: Element; maxActive?: number; statusApplied?: string }  // place a persistent ground hazard (aoe_point). maxActive caps how many of this caster's zones can be live at once — at the cap the skill reads as not-ready (a soft cooldown). statusApplied → a utility zone (Molasses) that refreshes a status on units inside instead of damaging.
  wall?: { fireDamage: number; maxBumps: number; duration: number; halfWidth: number; maxActive: number }  // Firewall: an oriented line that bounces foes who cross it (knockback + burn) until they've bumped maxBumps times. halfWidth = half the line length (3-wide ⇒ 1.5).
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
  moveSpeed?: number  // grid units/round added to base (positive = faster, negative = slow)
  moveSpeedMult?: number  // multiplies final move speed after additive mods (e.g. 0.75 while cloaked)
}

export interface StatusEffect {
  id: string
  name: string
  source: string          // unit id
  duration: number        // rounds remaining
  statModifiers: StatModifiers
  flags: string[]         // "stealthed", "rooted", "channeling", "shielded", "taunted", "frozen"
  dotDamage?: number      // damage dealt to the bearer each round (poison etc.)
  damageTakenMult?: number // element-agnostic incoming-damage multiplier while active
  armorOverride?: Element  // override the bearer's effective armor element (Frozen → water, §3)
  removedByElement?: Element[]  // taking damage of these elements clears the status (fire melts Frozen)
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
  speedMult?: number            // multiply base move speed when advancing on the lock / toPoint
  awayFromNearestEnemy?: boolean // retreat toward own edge instead of advancing
  rows?: number                 // distance to fall back (with awayFromNearestEnemy)
  hold?: boolean                // do not move this turn
  skipAction?: boolean          // also skip the attack this turn
  clearLock?: boolean           // disengage: drop the locked target
  toPoint?: Vec2                // move toward an explicit point (flank / guard / regroup, §spatial)
  desiredRange?: number         // hold this gap to the locked target (kite): back off if closer, close if farther
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
  // 'floor' tactics fire whenever a basic precondition holds (a target/ally is
  // in sight) — so a floor sitting above a trigger in the same channel would
  // starve it (the trigger never gets a turn). resolveTactics demotes floors
  // below triggers within each channel; undefined ⇒ 'trigger'.
  kind?: 'floor' | 'trigger'
  cooldown?: number             // rounds between activations (0/undefined = always)
  oncePerCombat?: boolean
  override?: boolean            // party tactics: inject at the TOP instead of bottom (§5.5)
  monsterOnly?: boolean         // §aggression: monster-disposition tactics (skittish, pack-…, flee); hidden from the player's picker (listTactics) but fully functional on monsters
  targeting?: (self: Combatant, state: BattleState, rank: number) => string | null
  movement?:  (self: Combatant, state: BattleState, rank: number) => MovementResult | null
  action?:    (self: Combatant, state: BattleState, rank: number) => ActionResult | null
  reaction?:  (self: Combatant, state: BattleState, rank: number) => ReactionResult | null
}

export interface ResolvedTactic {
  def: TacticDef
  rank: number
}

// §debug: a per-turn record of how each equipped tactic resolved on this unit's
// last turn — what actually fired vs why the rest stayed dormant:
//   fired    — this tactic produced the channel's result this turn
//   idle     — evaluated, but its condition returned nothing (dormant)
//   starved  — never evaluated: a higher-priority tactic already won the channel
//   cooldown — skipped (on cooldown or a spent once-per-combat)
// Runtime-only (rebuilt every turn, never serialized); surfaced in BattleView.
export type TacticOutcome = 'fired' | 'idle' | 'starved' | 'cooldown'
export interface TacticResolution {
  id: string
  name: string
  channel: TacticChannel
  rank: number
  outcome: TacticOutcome
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
  moveSpeed: number       // grid units/round; 0 = stationary; not derived from spd
  attackElement?: Element // default 'neutral'
  armorElement?: Element  // default 'neutral'

  skills: EngineSkill[]
  potions?: number        // count of self-heal consumables available this fight
  tactics?: TacticRef[]   // unit-level tactics, priority order (first = highest)
  // §open-world: max distance at which this unit can *acquire* a new target.
  // Default Infinity (unlimited — what encounters use). Open-world sets finite
  // values (heroes see farther than monsters) so the party has to hunt.
  visionRange?: number
}

// An in-progress channeled cast (channelTime ≥ 1). Resolves when roundsLeft hits
// 0 on the caster's turn; cleared (no cooldown) if the caster is hit meanwhile.
export interface ChannelState {
  skillId: string
  targetId: string
  roundsLeft: number
  targetPoint?: Vec2   // for a ground-zone AoE: the telegraphed spot, locked at cast start so it can be dodged (the storm lands here even if the target moves/dies)
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
  facing: Vec2             // unit vector the token points (move dir, else toward target); (1,0) at spawn
  moving: boolean          // did this unit actually change position on its last turn (UI "tail")
  preferredRank: Rank
  meleeRange: number
  rangedRange: number
  moveSpeed: number        // grid units/round; 0 = stationary
  attackElement: Element   // element of this unit's basic attacks (§3)
  armorElement: Element    // defensive element

  skills: EngineSkill[]
  skillCooldowns: Record<string, number>
  statuses: StatusEffect[]
  lockedTargetId: string | null
  potionsLeft: number

  // §aggression: is this unit currently hostile? Heroes and aggressive-on-sight
  // monsters start true. A "skittish" (non-aggressive) monster starts false and
  // ignores foes — no targeting, just wanders/holds — until it's provoked: it
  // takes a hit from an enemy (applyDamageRaw) or a packmate calls it (rallyPack).
  // Once true it stays true. Round-trips in the snapshot (legacy tokens → true).
  provoked: boolean

  // Tactics (§5)
  tactics: ResolvedTactic[]              // unit tactics + injected party tactics, priority order
  tacticCooldowns: Record<string, number>
  tacticsUsed: string[]                  // once-per-combat tactic ids that have fired
  chargeUsed: boolean                    // Charger's first-hit damage bonus consumed
  attacksReceived: number                // for Nimble's deterministic dodge
  lastHitById: string | null             // attacker since this unit's last turn (Counterattacker)
  lastDamageRound: number                // round this unit last dealt OR received damage (Cloak's "not engaged" gate; sentinel far-negative = never)
  channel: ChannelState | null           // active channeled cast, if any (§4 cast time)
  interruptedCount: number               // times a channel of theirs has been disrupted (Wary Caster reads this)

  // §open-world (mode === 'open' only). visionRange gates target acquisition.
  // wanderTarget/wanderDwell drive idle roaming: a monster lurks for wanderDwell
  // rounds, then hops toward wanderTarget; heroes read the team plan's waypoint
  // instead.
  visionRange: number
  wanderTarget: Vec2 | null
  wanderDwell: number

  // §move-order: an explicit "go here" command that overrides normal AI
  // (targeting/wander) until the unit arrives or the order is cleared. The host
  // sets it via issueMoveOrder; the engine paths toward it each turn, routing
  // around known terrain, and gives up (holds) if it's unreachable. Used by the
  // game to send a unit somewhere and by tests to force pathing. null = no order.
  moveOrder: Vec2 | null

  // §debug: a small ring buffer of one-line summaries of what this unit did each
  // turn (targeting / movement / action). Purely observational — the BattleView
  // debug tab and tests read it; nothing in the sim depends on it.
  trace: TraceEntry[]

  // §debug: how each equipped tactic resolved on this unit's most recent turn
  // (fired / idle / starved / cooldown), grouped per channel by the eval loops.
  // Observational only — rebuilt each turn, never serialized.
  lastResolution: TacticResolution[]
}

// One turn's worth of "what this unit just did", newest pushed to the end.
export interface TraceEntry {
  round: number
  text: string
}

// ── Team blackboard (§coordination) ──────────────────────────────────────────--
//
// A per-team scratchpad recomputed once per round by a pluggable `Planner` and
// stashed on `BattleState.plans`. Tactics *read* the plan instead of each unit
// recomputing — so "the party roams to one waypoint / focus-fires one target"
// falls out of shared state rather than coincidence. Easy to inspect for
// debugging (BattleView debug tab) and to assert on in tests.
export interface TeamPlan {
  waypoint: Vec2 | null            // shared roam target (heroes wander toward it)
  focusTargetId: string | null     // enemy the team should concentrate on (advisory)
  threat: Record<string, number>   // enemyId → threat score (higher = scarier)
  // §hunt (open world): the enemy the party has committed to routing toward — the
  // nearest foe ANY member can currently see (fog-of-war). `waypoint` tracks its
  // position so the squad marches there together; held while it stays seen +
  // reachable, else re-picked, else null (nothing in sight → roam to explore).
  huntTargetId?: string | null
}

export type Planner = (state: BattleState, team: Team) => TeamPlan

// ── Events (§12) ─────────────────────────────────────────────────────────────--

export type BattleEventType =
  | 'move' | 'melee_attack' | 'ranged_attack' | 'skill_use'
  | 'heal' | 'unit_death' | 'target_switch' | 'status_expire'
  | 'dodge' | 'retreat' | 'buff_apply'
  | 'cast_start' | 'interrupt' | 'dot' | 'knockback'
  // spawn: a combatant entered an already-running battle (open-world
  // reinforcement, or a hero re-joining after recovery). UI can flash it in.
  | 'spawn'
  // aggro: a unit just turned hostile (provoked) — a skittish monster roused by
  // a hit or a packmate's call. UI flashes a "!" over it.
  | 'aggro'
  // rally: a monster with Pack Tactics called same-named kin into the fight. UI
  // pulses a "call ring" out from the caller.
  | 'rally'
  // tactic_use: a non-skill tactic fired (Counterattacker, Shield Wall, Last
  // Stand…). UI floats the tactic name above the source so the player can see
  // why a unit just acted. Skill tactics already emit `skill_use` and don't
  // need this marker.
  | 'tactic_use'

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

// An axis-aligned impassable region of terrain. Units route around it; knockback
// stops against it (§2 barriers). Walls also block line of sight — ranged attacks
// and spells can't punch through. Cliffs only block movement; ranged attacks
// fire over them freely.
export interface Barrier {
  x: number; y: number; w: number; h: number
  kind?: 'wall' | 'cliff'   // default 'wall'
}

export interface CombatSetup {
  playerUnits: EngineUnitInput[]
  enemyUnits: EngineUnitInput[]
  playerPartyTactics?: TacticRef[]   // team-wide tactics injected into every player unit (§5.5)
  enemyPartyTactics?: TacticRef[]
  callbacks?: CombatCallbacks
  maxRounds?: number
  collectEvents?: boolean   // default true; set false for fast bulk resolution (§11)
  barriers?: Barrier[]      // impassable terrain (default none)
  cols?: number             // arena width in grid units (default COLS); open-world is larger
  rows?: number             // arena height in grid units (default ROWS)
  planner?: Planner         // team blackboard producer (default: built-in defaultPlanner)
  // 'encounter' (default): a discrete wave — `evalOutcome` ends it on a wipe
  // (victory/defeat/draw). 'open': a persistent open-world battle that never
  // self-terminates; the host trickles reinforcements in via `addCombatant`
  // and owns teardown. See the open-world model in CLAUDE.md.
  mode?: BattleMode
}

export type BattleMode = 'encounter' | 'open'

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

// A persistent ground hazard (e.g. Lightning Storm). Units of the affected team
// inside the radius take `dotDamage` each round until `roundsLeft` runs out (§2
// zones). (Firewall is no longer a zone — it's a FireWall line; see below.)
export interface BattleZone {
  id: string
  sourceId: string        // caster (for kill attribution)
  team: Team              // which team is affected (units standing in it)
  pos: Vec2
  radius: number
  dotDamage: number
  roundsLeft: number
  skillId: string
  element?: Element       // flavour element for the tick (UI label); damage itself bypasses the matrix
  statusApplied?: string  // status id refreshed on units inside each round (e.g. Molasses → 'slowed'); non-stacking
}

// A Firewall (§firewall): a short oriented line that bounces foes who try to
// cross it. It blocks only `blockTeam` (the caster's foes) — allies pass freely.
// Each foe must `bump` into it `maxBumps` times (each a knockback + burn) before
// it lets them through, so a kiter can drop it between itself and a chaser.
export interface FireWall {
  id: string
  sourceId: string          // caster (kill attribution)
  blockTeam: Team           // the team that is blocked/burned; the other team passes
  pos: Vec2                 // line centre
  normal: Vec2              // unit normal — the caster↔foe axis the wall blocks across
  half: number              // half the line length, in cells (3-wide ⇒ 1.5)
  fireDamage: number        // burn dealt per bump
  maxBumps: number          // bumps a unit absorbs before it can pass
  roundsLeft: number        // duration
  bumps: Record<string, number>   // per-combatant bump tally
}

// Steppable battle state — `advanceRound` mutates this in place. Carries the
// engine's private copies; the input units are never touched.
export interface BattleState {
  combatants: Combatant[]
  zones: BattleZone[]
  firewalls: FireWall[]
  barriers: Barrier[]
  cols: number
  rows: number
  mode: BattleMode
  plans: Partial<Record<Team, TeamPlan>>   // §coordination: per-team blackboard, recomputed each round
  planner: Planner                          // produces the plans (pluggable)
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
