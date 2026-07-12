// Combat Tactic Engine — type definitions (spec §3, §4, §7, §11, §12, §13).
//
// The engine consumes a roster the host RPG resolves (final stats, skills) and
// produces a deterministic BattleResult plus an event log. It owns positioning,
// turn order, damage, status effects, and win/loss — nothing about progression,
// loot, or rendering (§13).

import type { Element } from './elements'
export type { Element } from './elements'

// 'neutral' is a non-combatant faction (town NPCs — merchants, questgivers): it
// is nobody's enemy (excluded from every targeting/AoE query) and nobody's ally,
// and a neutral combatant never takes a turn (it just stands where it spawned).
export type Team = 'player' | 'enemy' | 'neutral'
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
  statusLevel?: number   // level to scale a per-level status by when applied (e.g. Bless)
  knockback?: number     // grid units to push affected enemies away from the caster (§2)
  retreatAfter?: number  // rows the caster falls back after the cast resolves
  zone?: { dotDamage: number; duration: number; element?: Element; maxActive?: number; statusApplied?: string; follow?: boolean }  // place a persistent ground hazard (aoe_point, or aoe centered on the caster). maxActive caps how many of this caster's zones can be live at once — at the cap the skill reads as not-ready (a soft cooldown). statusApplied → a utility zone (Molasses) that refreshes a status on units inside instead of damaging. follow → the zone re-centers on its caster each round (Consecration aura) and ends when the caster dies.
  wall?: { fireDamage: number; maxBumps: number; duration: number; halfWidth: number; maxActive: number }  // Firewall: an oriented line that bounces foes who cross it (knockback + burn) until they've bumped maxBumps times. halfWidth = half the line length (3-wide ⇒ 1.5).
  stealthBonus?: number  // damage multiplier when cast from stealth (Back Stab, §3)
  dispelCategory?: 'buff' | 'debuff'  // strip statuses of this category from affected targets
  removesStatusId?: string            // strip a specific status from affected targets (Sight → stealthed)
  summon?: SummonConfig  // §minions: a self-cast that spawns N owned minions (Summon Skeletons)
  slot: SkillSlot
}

// §minions: what a `type: 'summon'` skill spawns. The minions join the caster's
// team as owned, leashed, time-limited combatants (low-stat melee bodies by
// default). Behaviour comes from `tactics` (e.g. Guardian to body-block).
export interface SummonConfig {
  name: string
  count: number          // how many to spawn per cast
  hp: number
  str: number            // drives their basic-attack damage (keep low)
  spd?: number           // initiative; defaults to the caster's
  moveSpeed?: number     // grid units/round; defaults to the caster's ("normal")
  meleeRange?: number    // default 1
  ttl: number            // logical rounds before they crumble (scaled at spawn)
  leash: number          // cells from the owner before they're pulled back
  maxActive: number      // cap on simultaneous live minions from this skill/caster
  tactics?: TacticRef[]  // their behaviour loadout (e.g. [{ id: 'guardian', rank: 1 }])
}

// ── Status effects (§7) ─────────────────────────────────────────────────────--

export interface StatModifiers {
  str?: number
  def?: number       // physical defense (mitigates melee/physical)
  int?: number
  spd?: number
  magicDef?: number  // magic defense (mitigates spell damage)
  moveSpeed?: number  // grid units/round added to base (positive = faster, negative = slow)
  moveSpeedMult?: number  // multiplies final move speed after additive mods (e.g. 0.75 while cloaked)
  acc?: number  // accuracy/"hit" bonus — tracked & shown (e.g. Bless), but not yet rolled in combat (like the game's accuracy stat)
}

export interface StatusEffect {
  id: string
  name: string
  source: string          // unit id
  duration: number        // rounds remaining
  statModifiers: StatModifiers
  flags: string[]         // "stealthed", "rooted", "channeling", "shielded", "taunted", "frozen"
  dotDamage?: number      // damage dealt to the bearer each round (poison etc.)
  element?: Element       // element of the DoT (runs through the matrix; e.g. poison vs undead = 0)
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
  useItemId?: string            // §consumables: a carried item the unit uses on itself this turn (heals per its spec, decrements pack)
}

// §consumables: an in-combat use of a carried item the host (adapter) has wired
// up from the player's allow-list. The effect descriptor travels across the
// engine boundary so the engine never imports the item data registry; it's
// serialized on the combatant so a reloaded BSNAP rebuilds the same tactic.
//   'heal-max' — restore to full.
//   'heal'     — restore `healAmount` HP (capped at the missing HP).
export type ConsumableEffect = 'heal-max' | 'heal'
export interface ConsumableSpec {
  itemId: string
  threshold: number             // HP ratio 0..1 below which the unit uses the item
  effect: ConsumableEffect
  healAmount?: number           // for effect 'heal': HP restored per use
}

// §blink (movement-action-coupling.md M4): a movement capability — Blink is the
// first. `kind` doubles as the cooldown key. `needsLoS`: walls block the jump;
// cliffs never do (same rule as shooting over the moat), which is what makes a
// teleport a bridge across un-walkable gaps.
export interface MoveAbility {
  kind: 'teleport'
  range: number                 // grid cells per jump
  cooldown: number              // rounds between uses
  needsLoS: boolean
}

// §posture (the player's behavior dial, movement-action-coupling.md §levers):
// which row of the POSTURES policy table (engine/tuning.ts) this unit's
// plan-layer decisions read — exposure aversion, travel HP budget, blink
// eagerness. The dial is the id; the weights live in the table, so re-tuning
// a row re-tunes every unit standing on it.
export type Posture = 'bold' | 'steady' | 'wary'

// §blink (M4): movement capabilities as the PATHER sees them — passed into
// steerAround/canReach to add teleport edges to the route search ("this unit
// can cross the moat"). Reachability-only shape: cooldowns are the mover's
// problem, not the map's.
export interface MoveCaps {
  teleport?: { range: number; needsLoS: boolean }
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



// §intel (tactical-coordination.md §3.7): what the OPPOSING team currently
// knows about a unit — the imperfect-information mask. Each field flags one
// maskable fact as revealed. The semantics are deliberate and load-bearing:
//   • ABSENT (`intel` undefined) ⇒ fully known. Every legacy snapshot token,
//     every hero input, and every sandbox battle carries no intel, so they are
//     omniscient — byte-identical to pre-intel behavior.
//   • PRESENT-BUT-EMPTY (`{}`) ⇒ knows NOTHING: scorers read the unit through
//     `knownView` (damage.ts) and unrevealed fields fall back to priors
//     (neutral armor, no dodge rhythm, bare kit — a basic attacker).
// Only ESTIMATION is masked (estimateDamageVs / threatProfile / the masked
// capability); damage RESOLUTION always reads true stats — reality doesn't
// care what you know. The store owns learning (it watches damage events) and
// sets this via the adapter at spawn / `setCombatantIntel` live.
export interface IntelMask {
  armor?: boolean   // armorElement revealed
  dodge?: boolean   // dodgePeriod revealed
  kit?: boolean     // skills (the kit) revealed
}

export interface EngineUnitInput {
  id: string
  name: string
  team: Team

  // Core stats (the RPG resolves these; the engine only reads them, §3.1)
  str: number
  def: number             // physical defense (mitigates melee/physical hits)
  int: number
  spd: number
  magicDef?: number       // magic defense (mitigates spell damage); default 0
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
  // §consumables: carried items by id (the hero's pack) and the player-allowed
  // use rules. makeCombatant seeds the runtime pack and injects one action-channel
  // tactic per spec whose item is actually carried.
  pack?: Record<string, number>
  consumableSpecs?: ConsumableSpec[]
  // §blink (M4): movement capabilities granted by the unit's kit (the adapter
  // maps an equipped Blink here). Default none.
  moveAbilities?: MoveAbility[]
  // §posture: the player's behavior dial (default 'steady' = pre-posture behavior).
  posture?: Posture
  tactics?: TacticRef[]   // unit-level tactics, priority order (first = highest)
  // §open-world: max distance at which this unit can *acquire* a new target.
  // Default Infinity (unlimited — what encounters use). Open-world sets finite
  // values (heroes see farther than monsters) so the party has to hunt.
  visionRange?: number
  // §threat / §passive — see the Combatant fields of the same name. Default
  // threatMult 1, armorReduction 0, dodgePeriod undefined (never dodge).
  threatMult?: number
  armorReduction?: number
  dodgePeriod?: number
  // §minions: set on summoned/companion inputs so makeCombatant wires the owner
  // link, leash, lifetime, and active-cap tag (see the Combatant fields).
  ownerId?: string | null
  leashRange?: number | null
  summonTtl?: number | null
  summonTag?: string | null
  // §intel: what the OPPOSING team knows about this unit (see IntelMask above).
  // The adapter stamps it on ENEMY (monster) inputs in curated mode; absent
  // everywhere else ⇒ omniscient.
  intel?: IntelMask
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
  def: number             // physical defense
  int: number
  spd: number
  magicDef: number        // magic defense (spell mitigation)
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
  // §consumables: carried items by id, decremented in-engine as use-item tactics
  // fire (so the count lives in the snapshot and replays 1:1). The store mirrors
  // this back to the hero's authoritative Unit.pack each tick. `consumableSpecs`
  // is the player's allow-list, serialized so rebuildTactics can reconstruct the
  // injected tactics on load. Both default empty on legacy tokens.
  pack: Record<string, number>
  consumableSpecs: ConsumableSpec[]
  // §blink (movement-action-coupling.md M4): movement capabilities — things a
  // unit can do with its FEET (well, without them), read by the escape logic and
  // the capability-aware pather, never cast through the action channel. Cooldowns
  // tick with skill/tactic cooldowns, keyed by ability kind. Both serialize;
  // legacy tokens default empty.
  moveAbilities: MoveAbility[]
  moveAbilityCds: Record<string, number>
  // §posture: the policy row this unit's plan-layer decisions read (see
  // engine/tuning.ts). Optional + JSON-plain → rides the snapshot; absent
  // (legacy tokens, unset units) reads as 'steady' via postureOf.
  posture?: Posture

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
  lastCastSkillId: string | null         // last skill this unit cast — Chain tactics follow up with the next slot
  lastCastTargetId: string | null        // who that cast was aimed at (Chain reuses the same target)
  lastCastRound: number                  // round of that cast (Chain only follows up immediately after)

  // §open-world (mode === 'open' only). visionRange gates target acquisition.
  // wanderTarget/wanderDwell drive idle roaming: a monster lurks for wanderDwell
  // rounds, then hops toward wanderTarget; heroes read the team plan's waypoint
  // instead.
  visionRange: number
  wanderTarget: Vec2 | null
  wanderDwell: number
  // §kite: the heading a fleeing unit committed to last turn (unit vector, null
  // when not retreating). escapeHeading favours continuing it so a cornered
  // kiter doesn't flip-flop between two near-tied directions (up the open wall vs
  // back into the corner) and dither in place until it's caught.
  escapeDir: Vec2 | null

  // §move-order: an explicit "go here" command that overrides normal AI
  // (targeting/wander) until the unit arrives or the order is cleared. The host
  // sets it via issueMoveOrder; the engine paths toward it each turn, routing
  // around known terrain, and gives up (holds) if it's unreachable. Used by the
  // game to send a unit somewhere and by tests to force pathing. null = no order.
  moveOrder: Vec2 | null
  // §travel-defend: how a marching unit reacts to a hostile in sight. absent/undefined
  // = 'off' (march straight through, as a plain move order or forced-pathing does).
  //  'retaliate' = keep marching toward the destination but target + fire on foes in
  //     range as it passes (no veer off course).
  //  'avoid' = steer the march AROUND foes' attack ranges (capped repulsion vs the
  //     pull to the destination — skirt cheap threats, plow through costly ones),
  //     still firing when a foe ends up in range.
  // Set by the store's travel loop from the hero's Logistics preference. Optional so
  // legacy snapshots and plain orders default to 'off'.
  moveEngage?: 'retaliate' | 'avoid'
  // §travel-defend 'avoid' anti-stuck watchdog (all optional, positions-derived so
  // replays stay 1:1). avoidBest = best (min) distance-to-destination reached while
  // avoiding; avoidStuck = turns since that improved; avoidPlowUntil = when boxed in
  // (a wall of threat zones round the goal), the distance to close to before releasing
  // a committed straight PLOW through the wall (accept the hits — no other way out).
  avoidBest?: number
  avoidStuck?: number
  avoidPlowUntil?: number
  avoidSide?: number    // committed pass direction (±1) while steering around threats — held to avoid dithering
  // §priced routes (movement-action-coupling.md M3): committed clear-first mode —
  // the corridor to the travel destination costs more HP than the budget allows,
  // so the unit has stopped marching and is fighting the threat wall down.
  // Cleared (with hysteresis) once the corridor is affordable again. Optional and
  // JSON-plain, so it rides the snapshot; legacy tokens read as unset.
  travelClearing?: boolean

  // §threat: per-enemy threat each opponent has built up against this unit (by
  // id). Dealing damage to / healing against a unit raises the actor's threat on
  // it; the default targeting fallback (selectTarget) attacks the highest-threat
  // foe, with hysteresis (the "aggro wobble"). Symmetric — both teams accrue it.
  threat: Record<string, number>
  // §threat: this unit's threat-generation multiplier (tank passives raise it so
  // a tank holds aggro by dealing modest damage). Default 1.
  threatMult: number
  // §passive (was the Armored/Nimble tactics, now skill-granted): incoming-damage
  // reduction fraction (0 = none, capped 0.5 in armoredFactor) and dodge-every-Nth
  // period (null = never). Sourced from skills (heroes) / MonsterDef (monsters).
  armorReduction: number
  dodgePeriod: number | null

  // §minions: a summoned/companion unit's link to its master (a hero or caster).
  // `ownerId` is the master's combatant id (null = not a minion). `leashRange`
  // pulls it back when it strays farther than this many cells from the owner
  // (null = no leash). `summonTtl` counts engine rounds until it crumbles (null =
  // permanent, e.g. a beast companion). `summonTag` is the skill id that spawned
  // it, for per-skill active caps. All four round-trip in the snapshot.
  ownerId: string | null
  leashRange: number | null
  summonTtl: number | null
  summonTag: string | null

  // §coordination (tactical-coordination.md §3.2/§5): precomputed kit capability
  // — the planner's "who tanks / who carries / who pulls" answers. Derived from
  // the kit (skills + base stats, fixed for the battle) at makeCombatant AND on
  // snapshot deserialize; NEVER serialized (rebuilt on load, like `tactics`).
  // Read by nothing in the sim yet (M0).
  capability?: KitCapability

  // §intel (tactical-coordination.md §3.7): what the OPPOSING team knows about
  // this unit — see the IntelMask doc above. SERIALIZED like any stat (only
  // when set), so a snapshot replays 1:1 with the knowledge the party had at
  // serialization time; absent (legacy tokens, heroes, sandbox) ⇒ omniscient.
  intel?: IntelMask
  // §intel: this unit's capability as the OPPOSING team is entitled to price it
  // — computeCapability run through knownView. Set only when `intel` is (absent
  // ⇒ appraisal reads the true `capability`). Derived at makeCombatant /
  // deserialize / setCombatantIntel; NEVER serialized (rebuilt, like capability).
  knownCapability?: KitCapability

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

// §coordination: the target-independent v0 capability answers (relative queries
// — top/median/outlier — happen at the point of use, tactical-coordination.md
// §3.2). All formulas v0 ⏱; computed by engine/teamplan.ts.
export interface KitCapability {
  sustainedDamage: number   // best raw damage/round over the kit, cooldown-amortized (basic + attack skills)
  toughness: number         // maxHp × armored mitigation factor
  reach: number             // max offensive range (basic + damage skills)
  hasHeal: boolean          // carries a heal skill
}

// ── Team blackboard (§coordination) ──────────────────────────────────────────--
//
// A per-team scratchpad recomputed once per round by a pluggable `Planner` and
// stashed on `BattleState.plans`. Tactics *read* the plan instead of each unit
// recomputing — so "the party roams to one waypoint / focus-fires one target"
// falls out of shared state rather than coincidence. Easy to inspect for
// debugging (BattleView debug tab) and to assert on in tests.
//
// v2 (tactical-coordination.md §3.1): engagement / assignments / avoid list /
// corridor. All optional — absent ⇒ pre-coordination behavior, so legacy
// snapshots and the shipped planner stay byte-identical until each milestone
// deliberately turns a field on. Nothing populates or reads them yet (M0).

// §coordination: how the line fights, chosen from party comp (M3).
export type Stance = 'hold' | 'kite' | 'collapse'

// §coordination: the team's cross-round commitment — the one piece of plan
// MEMORY (persists across decision rounds like huntTargetId; dropped only by
// explicit abandon predicates). Serialized with the plan for replay fidelity.
export interface Engagement {
  targetIds: string[]       // the committed pull-set — what we EXPECT to fight
  primaryId: string | null  // current kill target (ordered focus)
  anchor: Vec2 | null       // where the line stands (choke / ambush / ring spot)
  stance: Stance            // how the line fights (from party comp)
  sinceRound: number        // commitment age — abandon predicates read this
}

// §coordination disengage (tactical-coordination.md §3.1/§3.4): the OTHER piece
// of cross-round plan memory besides `engagement`. Published on the round the
// team drops an engagement for LOSING the mutual-TTK race (never for "won —
// everything's dead" or "target unseen"); read by executeMovement's default
// layer to break the line off toward its own edge (the Retreater back-off) and
// drop sticky locks. Persists across decision rounds (like `engagement`) until
// the party is safe (out of camp threat / nothing hostile in sight) or finds a
// fresh affordable engagement — the hysteresis that stops engage↔rout thrash.
// Serialized with the plan (only when set ⇒ legacy tokens stay byte-identical).
export interface Rout {
  // centroid of the camp we broke off from — the "fleeing from" marker. Debug/
  // legibility only (the flee direction is live-computed by breakOff); frozen at
  // the FIRST abandon round for the rout's life (a continuing rout carries
  // prevRout.from forward), so across a primary hand-off it names where the
  // break-off began, not the latest camp centroid.
  from: Vec2
  sinceRound: number  // decision round the break-off began (age; abandon predicates / debug)
  // ids of the camp we fled. The rout HOLDS (stays published, keeps that camp
  // avoid-listed) while any of these is still alive-and-visible — because
  // Combatant.threat never decays, a fled camp reads as `alreadyFighting`
  // forever, so distance alone can't tell "we broke contact" from "safe to walk
  // back in". It clears only when the fled camp is dead / out of sight or the
  // live re-price makes it affordable again (never a permanent blacklist).
  campIds: string[]
}

// §coordination: a member's job this plan (assigned per decision round from
// declared intent — equipped tactics — else kit capability; never a stored role).
export type Assignment =
  | { role: 'engage' }                            // default: fight the engagement
  | { role: 'anchor' }                            // stand the line on the anchor
  | { role: 'pull'; targetId: string; to: Vec2 }  // tag one foe, drag it to `to`
  | { role: 'guard'; allyId: string }             // peel/bodyguard the protectee
  | { role: 'escort'; allyId: string }            // screen a transiting unit
  | { role: 'work'; point: Vec2 }                 // do a job there (forage/mine/pickup); party screens
  | { role: 'rove'; targetId: string | null }     // jungler: farm own camps apart from the party
  | { role: 'hold' }                              // reserve: stay put, don't chase

export interface TeamPlan {
  waypoint: Vec2 | null            // shared roam target (heroes wander toward it)
  focusTargetId: string | null     // enemy the team should concentrate on (advisory)
  threat: Record<string, number>   // enemyId → threat score (higher = scarier)
  // §hunt (open world): the enemy the party has committed to routing toward — the
  // nearest foe ANY member can currently see (fog-of-war). `waypoint` tracks its
  // position so the squad marches there together; held while it stays seen +
  // reachable, else re-picked, else null (nothing in sight → roam to explore).
  huntTargetId?: string | null
  // v2 ↓ (absent-by-default; see the §3.1 note above)
  engagement?: Engagement | null
  assignments?: Record<string, Assignment>   // combatantId → role this plan
  avoidTargetIds?: string[]  // do-NOT-aggro list (over-pull prevention)
  corridor?: Vec2 | null     // shared route corner — the HERD_BIAS replacement
  rout?: Rout | null         // active break-off (abandon-for-losing execution)
}

// §coordination (tactical-coordination.md §3.6): why the team is here — the
// host/store's seam. Set post-creation (M5's setTeamObjective); absent = 'hunt'
// (today's behavior). Serialized like plans.
export type TeamObjective =
  | { kind: 'hunt' }                       // default — today's behavior
  | { kind: 'escort'; unitId: string }     // screen this combatant's transit
  | { kind: 'hold'; point: Vec2 }          // own this ground
  | { kind: 'clear' }                      // kill everything affordable, in order

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
  // tactic_use: a non-skill tactic fired (Counterattacker, Burst…). UI floats the
  // tactic name above the source so the player can see
  // why a unit just acted. Skill tactics already emit `skill_use` and don't
  // need this marker.
  | 'tactic_use'

export interface BattleEvent {
  round: number
  type: BattleEventType
  sourceId: string
  targetId?: string
  value?: number
  eff?: number          // §3 element multiplier for a damage event (1 = neutral, >1 super-effective, <1 resisted) — drives the UI's effectiveness clue
  element?: Element     // §3 the attacking element of a damage event (basic/skill/DoT) — lets the host tally damage-by-element without re-deriving it
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
  timeScale?: number        // finer-rounds factor (default 1 = no scaling); N rounds == 1 logical round
  decisionInterval?: number // re-decide (targeting + team planner) only every N rounds (default 1 = every round); in between, units execute their committed lock/movement. Smooths motion + cuts AI cost. N rounds.
  multiAttackMax?: number    // §multi-attack PROTOTYPE: max agility-driven basic swings per logical round (default MULTI_ATTACK_MAX=1 = disabled/single-swing)
  planner?: Planner         // team blackboard producer (default: built-in defaultPlanner)
  // 'encounter' (default): a discrete wave — `evalOutcome` ends it on a wipe
  // (victory/defeat/draw). 'open': a persistent open-world battle that never
  // self-terminates; the host trickles reinforcements in via `addCombatant`
  // and owns teardown. See the open-world model in CLAUDE.md.
  mode?: BattleMode
  // §coordination M4 (tactical-coordination.md §3.5): the active directive id
  // per team (DIRECTIVE_REGISTRY, engine/directives.ts). Absent ⇒ shipped
  // behavior. A def's injected `tactics` ride the partyTactics seam at
  // placement; hosts flip a live battle via setTeamDirective instead.
  playerDirective?: string
  enemyDirective?: string
  // A peaceful town (a city open-world field): heroes mill about individually
  // with long pauses (§town wander) instead of roaming as a party. No effect on
  // monsters/encounters. Default false.
  peaceful?: boolean
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
  element?: Element       // tick element — run through the element matrix vs the target's armor (radiant Consecration shreds undead/ghost), defaults neutral
  statusApplied?: string  // status id refreshed on units inside each round (e.g. Molasses → 'slowed'); non-stacking
  follow?: boolean        // re-center on the caster (sourceId) each round; the zone ends when the caster falls (Consecration)
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
  peaceful: boolean                         // §town wander: a city field — heroes mill individually, not as a party (default false)
  timeScale: number                       // finer-rounds factor: N engine rounds == 1 logical round (default 1)
  decisionInterval: number                  // re-decide targeting/planner every N rounds (default 1); execute committed plan in between
  multiAttackMax: number                    // §multi-attack PROTOTYPE: max agility-driven basic swings per logical round (default 1 = disabled)
  plans: Partial<Record<Team, TeamPlan>>   // §coordination: per-team blackboard, recomputed each round
  planner: Planner                          // produces the plans (pluggable)
  // §coordination: host-set purpose per team (tactical-coordination.md §3.6).
  // Absent = 'hunt' (today's behavior); set post-creation (M5), serialized.
  objectives?: Partial<Record<Team, TeamObjective>>
  // §coordination M4 (tactical-coordination.md §3.5): active directive id per
  // team — the player's party-scope lever (and the monster seam). Set at
  // createBattle or via setTeamDirective; serialized like `objectives` (only
  // when set — absent on every legacy token ⇒ shipped behavior). The def is
  // resolved through DIRECTIVE_REGISTRY on read (directiveOf).
  directives?: Partial<Record<Team, string>>
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
