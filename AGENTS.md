# Collaborator Guide

We're iterating fast on UI. No tests yet. Don't over-engineer toward future features — three similar lines beats a premature abstraction.

## Architecture patterns

**Single Zustand store** (`src/stores/useGameStore.ts`) holds all game and UI state — units, equipment, inventory, plus UI bits (expanded rows, active tab, equip context, etc.). The one exception is live combat: per-location `BattleState` objects live in `battles[locationId]` (runtime-only, not persisted) and are produced by the combat engine, not hand-written by the store.

**The combat engine is a separate, pure module** (`src/engine/`). It is a deterministic, round-based *spatial* simulation on a 15×15 grid — units have positions, move, kite, flank, and body-block. It imports no game state, time, or stats; `src/engine/adapter.ts` is the only translation layer between game `Unit`/`MonsterDef` + `DerivedStats` and the engine's `EngineUnitInput`. The engine never mutates its inputs. See the Combat spec below and `BACKLOG.md` for deferred engine work.

**Derived stats are computed at render time**, never stored. `getDerivedStats(unit, equipment)` reads abilities + equipment bonuses + skill bonuses each time. Same for `getUnitTraits`, `getAvailableSkills`, etc.

**Registries are plain exported objects** — `TRAIT_REGISTRY`, `MONSTER_REGISTRY`, `SKILL_REGISTRY`, `RECIPE_REGISTRY`, `TACTIC_REGISTRY`. Add entries there; the UI and engine read them.

**Collapsible row pattern** throughout: header always visible, body toggled via `expandedXxxIds: string[]` in the store.

**Portal modals** (`createPortal`) for any popup that needs to escape an overflow container — see `TraitBubble`, `MonsterCodex`.

**Drag-and-drop**: PointerSensor only (no TouchSensor). Apply `touchAction: 'none' as const` in the draggable element's style object — not just during drag — so mobile browsers don't intercept the gesture before it starts.

**Save = composable sliced codecs** (`src/lib/save.ts`, `src/save/*`). A save is a
`v1:<base64>` envelope of independently-versioned **slices**, one `SliceCodec`
per concern (`units`, `inventory`, `locations`, `codex`, `world`, `combatStats`,
`battles`, `sockets`). Each codec owns `serialize`/`deserialize`/`empty` and an
optional `migrate(data, fromVersion)`; a missing slice falls back to `empty()`
and a corrupt envelope loads as `{}` (safe no-op). `App.tsx` loads once on mount,
auto-saves every 60s + on tab-hide. **State tiers** (see the `GameState` comment
block): *persistent* (units, inventory, recipes, location familiarity/seen,
codex, locationStats, **unitStats** (per-hero lifetime combat tally), partyTactics,
ticks, **battles**, **itemSockets**),
*runtime* (regenerated: `locations`, `eventLog`, `lastTickAt`), *ephemeral UI*
(own localStorage keys: tabs, selections, expand state, camera nonces). **Live
battles persist** via `battlesCodec`, which stores each as the engine's
`BSNAP.<base64>` token (`serializeBattle`) — so battle serialization lives in one
place and the whole-game save *composes* it. That makes the battlefield-repro
token simply `exportBattle(locationId)` (one battle through the same serializer
the BattleView ⎘-state button uses). `exportSave`/`importSave` round-trip the
whole envelope (player backup + highest-fidelity bug repro, incl. live fights);
both are surfaced on the Time tab's Debug section.

## Priorities

- Playable feel on mobile first
- Visual iteration speed over correctness
- Tests and refactoring come later
- No error boundaries, no abstractions the current features don't need

## Branching & Merging

- Develop on a feature branch, but **merge to `main` when the feature is complete** — main is what gets tested in the browser. Do not wait to be asked.
- Fast-forward merge when possible: `git merge --ff-only <branch> && git push origin main`.
- **After pushing to `main`, include the commit hash in the chat reply** (e.g. "Shipped to `main` (commit `abc1234`)") so I can match it to what I'm seeing in the debug UI.

---

## Feature Specifications

These are the implemented behaviors. Written so they can eventually become test cases.

### Health

- Unit health is a whole integer capped at `maxHp` (derived: `floor(50 + con * 10)`, see `src/lib/stats.ts`). `Math.floor` is applied at the moment damage is written, never at display time.
- A unit with `health <= 0` is KO'd. KO'd units (and units still in recovery) do not participate in combat.
- KO'd units enter a recovery phase: `recoveryTicksLeft` counts down from `RECOVERY_TICKS` (5, ~1 real-sec) once per tick. **No regen during this phase.**
- When recovery ends the unit enters *resting* (`isResting`), regenerating `RESTING_REGEN_RATE` (50 HP/tick — full in ~1s) until it reaches `maxHp`, at which point `isResting` clears.
- Units not assigned to any location regen `REGEN_RATE` (50 HP/tick — full in ~1s) — idle recovery.
- Health is capped at `maxHp` after regen. `batchTick` applies the same logic in bulk for offline catch-up (it does **not** re-simulate live combat for the regen/recovery/leveling pass — but it *does* extrapolate offline combat rewards; see **Offline progression** below).

### Map & Locations

- The Map tab is a **pannable overworld**, not a list. Each location's `region` field names the map *page* it lives on (`'world'`, `'geffen-dungeon'`); `mapPageId` selects the visible page. Region-grouped collapsible headers are gone.
- Locations sit on a fixed grid (`LOCATION_COORDS` in `Map.tsx`); adjacent path cells are adjacent on the grid so the route reads as a connected chain. The world is larger than a phone screen — the player drags the camera to navigate (mobile-first, no scroll-wheel assumed).
- Dungeon pages (`isDungeon`) are entered from a world location (`entryLocationId`) and exit back to it.
- Tapping a location selects it and opens a detail panel (units present, monsters, **Familiarity** meter = `locationFamiliarity[id] / familiarityMax`, deploy button).
- `expandedLocationIds` / `expandedRegionIds` localStorage keys persist (the latter defaults to `["world","geffen-dungeon"]`) but drive collapse state within panels, not the old region list.

### Combat — spatial tactic engine

Combat is a deterministic, round-based **spatial** simulation in `src/engine/`. The
old per-slot model (`encounterProgress`, `locationStrategy`, `focusSlots`, the
`normal`/`prioritize`/`ignore`/`avoid` dropdowns, the flee state machine) is **gone** —
it was fully replaced. Per-monster behavior dropdowns no longer exist; behaviour is
driven by **tactics** (below).

**One battle per location.** `battles[locationId]` holds a `BattleState` with
`combatants[]` (cloned from inputs, never mutated), positions on a 15×15 grid
(`COLS = ROWS = 15`, grid units — *not* the game's feet), ground `zones[]`,
`barriers[]`, a `mode`, `round`, `outcome`, `events[]`, and accumulating `stats`.

**Two battle modes** (`BattleState.mode`):
- `'encounter'` (default) — a discrete wave. `evalOutcome` ends it on a wipe
  (`victory`/`defeat`/`draw`), then a `BATTLE_RESPAWN_TICKS` (15) cooldown and a
  fresh identical wave. This is what scenarios/tests rely on; it's deterministic.
- `'open'` — a *persistent* open-world battle for a location with `openWorld:
  true`, fought on a **large per-battle map** (`BattleState.cols/rows`, default
  `openWorldSize` = 50×50; the camera can't fit it, so `BattleView` uses a
  `followCamera` centred on the **party** that **auto-fits** to keep them all in
  view — until the player takes manual control via pinch-to-zoom / −,+ buttons
  (⊙ re-enables auto-fit). Off-screen tokens are **clipped, not clamped** to the
  rim (`isOnScreen`): off-screen monsters aren't drawn, and each off-screen
  **party member** gets an `EdgeMarker` rim bubble with an arrow pointing toward
  them. One-finger pan too). It
  never
  self-terminates (`evalOutcome` returns `'ongoing'`); the store keeps a
  **fixed** `openWorldCap` of monsters **scattered** across the field (off the
  edges, and never inside a barrier — `scatterPos` retries against
  `pointBlocked`), trickling one back in every `OPEN_WORLD_SPAWN_TICKS` (30) via
  the engine's `addCombatant` (which takes an explicit spawn position), drawn at
  random from `monsterIds`.
  Heroes join/leave the live fight as they deploy or recover
  (`reconcileOpenPlayers`). The store owns teardown: no eligible heroes → battle
  dropped. Spawn/feed events surface in `BattleView` (a ring + name flash; a
  "⟳ Open world · persistent" badge). Per-location, party-independent.

  **Vision & wander** (mostly open-world — encounters keep `visionRange: Infinity`
  so ordinary fights stay on the tuned 15×15 feel). Each unit only
  acquires targets within `visionRange` (heroes 10, monsters 8 cells;
  `targetableEnemies` filters on it). With nothing in sight a unit *wanders*
  (`executeWander`): **heroes** roam toward the team
  blackboard's shared `waypoint` (below); **monsters** lurk
  `MONSTER_WANDER_MIN..MAX` rounds then hop `NEAR..FAR` cells to a new local
  spot. Wandering runs in open world for everyone, **and in encounters for a
  *non-provoked* unit** — i.e. a **skittish** monster milling about on its own
  (`mode === 'open' || !provoked`); since only skittish monsters are ever
  non-provoked, ordinary encounter units still just hold. So "non-aggressive"
  means *both* "won't strike first" (the `provoked` gate) and "mills about every
  few rounds" (`aggression.test.ts`). Wander/vision are deterministic (a `hash01` of round+index, no RNG). The
  shared `waypoint` is chosen genuinely *far* and **reachable** from the party
  (`pickRoamPoint`): re-picking a nearby point on arrival caused a corner
  "tiny-step" jitter, and picking a walled-off region would make them grind.

  **Terrain is fully known** — line-of-sight (`visionRange`) is fog-of-war for
  *units only*, never for walls. `steerAround` runs Dijkstra over the *entire*
  passed barrier set, so pathing threads arbitrary mazes/spirals to a target.
  When no route exists it reports `reachable: false`; `moveToward`/
  `moveTowardPoint` then **hold** instead of grinding into the wall, and
  `canReach(from, to, barriers)` exposes the same check. Reachability is
  **dynamic in the barrier set**: a future "walk on lava" party buff that passes
  a reduced set flips impossible targets to reachable with no special-casing.
  (`wander-jitter.test.ts` covers jitter, ring + two-ring-spiral threading, and
  give-up-on-impossible + dynamic reachability.)

  **Spawn & move primitives** (used by the game and tests). `addCombatant(state,
  input, team, partyTactics?, at?)` drops a combatant at an explicit position —
  the primitive behind all spawns. The store wraps it: `spawnMonsterAt(battle,
  monsterId, at)` / `deployUnitAt(battle, unit, …, at)` place a specific
  monster/hero at a specific spot; the open-world **timed respawn is the special
  case** (`spawnMonsterInto` → random monster + `scatterPos`). A **move order**
  (`issueMoveOrder(state, id, to)` / `clearMoveOrder`) is an explicit "go here"
  on `Combatant.moveOrder` that overrides AI (targeting/wander) in `takeTurn`:
  the unit paths toward it (routing known terrain), clears on arrival, and
  **holds** if it's unreachable. Movement is instantaneous in grid steps —
  overworld travel *between* locations is deferred (BACKLOG), but the move-order
  primitive is what it'll build on. (`move-orders.test.ts`: clear path arrives,
  blocked path can't, the order beats AI targeting.)

  Bigger arenas work because spatial bounds are read from a per-battle ambient
  (`engine/arena.ts` `setArenaBounds`/`arenaClamp`), set at each engine entry
  point — no size constant is hardcoded in the movement clamps. See `BACKLOG.md`
  for the still-deferred pieces (overworld travel between locations, weighted
  spawn distributions, seeded RNG for exact replays).

  **Spatial hash** (`engine/spatialhash.ts`) keeps the per-round neighbour scans —
  separation (every unit vs every other) and target acquisition (`visibleEnemiesOf`,
  called many times per unit) — from being O(N²) at hundreds of combatants. A
  uniform grid buckets combatants once at `advanceRound` start (another per-round
  ambient, set then cleared); `enforceSeparation`/`visibleEnemiesOf` query only the
  buckets overlapping their radius. It's a **pure optimisation**: `near` over-scans
  by `SPATIAL_MARGIN` (≥ the most a unit moves in a round) and the caller re-filters
  by *live* distance, and returns candidates in array-index order, so the set AND
  order match a brute scan exactly — replay stays 1:1 and the whole suite is
  unchanged. Foreign/cleared hash (tests, between-round spawns) falls back to the
  brute scan, which is byte-identical. (`spatialhash.test.ts`.)

**Team blackboard** (`BattleState.plans: Partial<Record<Team, TeamPlan>>`). A
per-team scratchpad recomputed each round at the top of `advanceRound` by a
pluggable `planner` (`CombatSetup.planner`, default `defaultPlanner`). A
`TeamPlan` is `{ waypoint, focusTargetId, threat }`: the shared roam `waypoint`
(centroid of an engaged fight so roamers regroup, else a fresh interior point)
is what makes the party wander *together*; `focusTargetId` (lowest-HP visible
enemy) + `threat` are advisory today (exposed for debugging, available to a
future focus-fire tactic). Tactics **read** the plan rather than recompute.

**Combat debugging.** Every combatant keeps a `trace: TraceEntry[]` ring buffer
(last 20) of one-line per-turn summaries (targeting · movement · action),
appended in `takeTurn`. The BattleView unit detail overlay has a **Debug** tab
(blackboard snapshot, tactic resolution with competing-channel ⚠ flags, the
recent trace) and a **copy-last-15** button that dumps a shareable text block
(`buildDebugText`). `plans` and `trace` are also handy in tests
(`blackboard.test.ts`). Open battles trim `events` to `EVENT_CAP` so the
never-resetting log stays bounded.

**Battle snapshots** (`engine/snapshot.ts`). `serializeBattle(state)` →
`BSNAP.<base64>` token that captures everything the deterministic sim reads
(combatants, positions, cooldowns, statuses, channels, move-orders, wander
state, grid size, mode, barriers, zones, team plans, round, outcome — but not
the `events`/`trace` logs). `deserializeBattle(token)` rebuilds a ready-to-step
`BattleState`: tactics are re-resolved from their `{id,rank}` refs
(`skill:`-tactics via `makeSkillTactic`) and the function fields (`planner`,
`calculateDamage`) are restored to the defaults. Since the engine is RNG-free,
reload + advance replays **1:1**. The BattleView has a **⎘ state** button
(bottom-left, any live battle) so a player can copy a fight's exact state for a
dev to reproduce. (`snapshot.test.ts` proves the round-trip and replay
determinism.)

**Tick → round cadence** (`useGameStore.tick` → `advanceBattles`):
- The app ticks `TICKS_PER_SECOND` (5) times/sec (200 ms/tick). One engine round
  advances every `ROUND_EVERY_TICKS` (1) tick → 5 rounds/sec, but battles run at
  **`timeScale` = `ROUND_TIME_SCALE` (2)** ("finer rounds"): 2 engine rounds == one
  *logical* round, so the real-time pace is the unchanged ~2.5 logical rounds/sec
  while motion is stepped finer and combat events spread out. `timeScale` lives on
  `BattleState` (snapshot-serialized), defaults to **1** (no scaling) so the whole
  engine suite + replays are byte-identical, and is applied via a per-battle ambient
  (`engine/timescale.ts`, mirroring `arena.ts`): `moveSpeedOf` ÷ scale, cooldowns /
  channel / zone / status durations / monster dwell / draw-timeout × scale, and the
  *discrete* per-round events (basic attacks, DoT ticks) gated to once per logical
  round via `onBeat`. Bump `ROUND_TIME_SCALE` to make the sim finer/smoother at the
  same pace. (Equivalence proved in `timescale.test.ts`.)
- For each location with eligible units (`health > 0`, `recoveryTicksLeft === 0`,
  not resting) **and** at least one monster: spawn a fresh battle if none exists or
  the last one finished (after a `BATTLE_RESPAWN_TICKS` = 15 cooldown), otherwise
  advance one round.
- After each round, kills award exp, gold, and loot (each defeated monster rolls
  its `drops` by `dropRate`). Live player HP is synced back to the unit records
  every tick.
- **Exp is a pool, split by level (`splitExpByLevel`, `src/lib/offline.ts`).**
  Each kill drops 1 XP into a pool shared by the *surviving* party and divided
  **proportional to level** — a level-1 hero beside a level-99 earns ~1% of the
  pool. This is deliberate anti-power-leveling: parking a low-level hero in a
  high-level party no longer fast-tracks it. An equal-level party splits evenly;
  a solo hero takes the whole pool. Shares are fractional (exp is floored only at
  display, so tiny shares still slowly accrue). The same split runs offline.
- Player units that die in a round get `recoveryTicksLeft = RECOVERY_TICKS`.

**A round** (`advanceRound`, `src/engine/engine.ts`): tick statuses (DoT, age-out) →
tick ground zones → tick cooldowns → sort turn order by SPD desc (deterministic id
tiebreak) → each alive combatant takes a turn → evaluate `outcome`
(`victory`/`defeat`/`draw`; draw at `MAX_ROUNDS` = 200).

**Ground zones** (`BattleZone`, `state.zones`) are persistent areas dropped by a
skill's `zone` config — Lightning Storm (damage cloud), Molasses (a no-damage
`statusApplied` slow puddle). Tick damage runs through the **element matrix** vs
the target's effective armor (radiant zones shred undead/ghost). A zone is
normally fixed ground, but `zone.follow` makes it a **caster-anchored aura** that
re-centers on its `sourceId` and ends when the caster dies — **Consecration**
(instant self-cast, `targeting: 'self'`, radiant, r=2, `maxActive: 1` + long
duration ⇒ cast once and it rides along). Carried by the Mutant Lizard.
(`consecration.test.ts`.)

**Zone resolution is a D&D-style "aura turn"** (three phases across a round, so a
zone can't miss a unit that only brushes it between position snapshots —
`engine.ts` `seedZones`/`trackZones`/`applyZoneEffects`): (1) at round **start**
auras re-center on their caster, zones age out, and each survivor seeds an
*eligibility set* with whoever's already inside (*begins their turn in the aura*);
(2) after **each unit acts** a following aura re-centers immediately onto its
just-moved caster and anyone now inside is added (*enters the aura during its
turn* — and an aura sweeping over a unit when its caster strides past); (3) at
round **end** whoever's standing in it now is added (*ends their turn in the
aura*) and the effect lands **once on every eligible unit, simultaneously**
(iterated in combatant order for determinism). DoT is still gated to **once per
logical round** (`onBeat`) so finer sub-rounds don't double-tick, and a zone cast
*this* round isn't seeded, so it first bites next round. Eligibility lives in a
per-round Map (not on the zone), recomputed from positions each round, so nothing
extra is snapshot-serialized and replay stays 1:1.

**Threat & aggro (a WoW-style model).** Targeting is layered, top to bottom: (1) a
**hard taunt** — the `taunted` status (`evalTargeting` top) hard-locks the bearer
onto the taunter for ~3s, overriding *everything* including its own targeting
tactics; (2) the unit's **targeting tactics** (Tank Buster, Focus Casters, …),
first-match as before; (3) the **threat fallback** (`selectTarget`, `behavior.ts`).
The fallback scores each visible foe `threat·1 − distance·1` and locks the best,
with **hysteresis** (keep the current target unless another beats it by 25% of the
current's threat) — that stickiness is the aggro *wobble*. Threat is per-combatant
(`Combatant.threat: Record<id, number>`, symmetric across teams, snapshot-persisted):
**all damage** accrues `dmg × attacker.threatMult` on the target (the single
`applyDamageRaw` chokepoint, so basic/skill/DoT/zone all count) and **healing**
accrues `heal × 0.5 × threatMult` split across the healer's foes (`generateHealThreat`)
— so a healer can pull aggro. Before anyone's dealt damage every threat is 0, so a
fight opens on the nearest foe (old behaviour), then becomes threat-driven. The
**Taunt** skill (`taunt`, a `taunted`-applying debuff) is the tank's peel —
`selectSkillTarget` prefers a foe that's on an *ally*, and landing it vaults the
caster to the top of the target's threat table (+10%) so aggro doesn't slip the
instant the forced lock ends. (`threat.test.ts`. Showcase: **The Threat Trial**
location/scenario — three slow, tanky, low-damage **Stone Sentinels** vs a Taunt
tank + a kiter. Deferred: AoE/aura threat so a tank holds *several* mobs, and
reachability-aware targeting — see `BACKLOG.md`.)

**Defensive passives are skills, not tactics.** The old **Armored** / **Nimble** /
**Threatening Presence** tactics are gone; they're now passive skills — **Toughness**
(damage cut), **Evasion** (periodic dodge), **Defensive Stance** (threat multiplier)
— that set `Combatant.armorReduction` / `dodgePeriod` / `threatMult` via
`getDerivedStats` → the adapter (and `MonsterDef` carries the same optional fields).
`armoredFactor`/`nimblePeriod` read the combatant fields now.

**Only skills modify stats/numbers; tactics are pure behaviour.** The stat-buff
tactics are gone too: **Shield Wall** (DEF buff) and **Last Stand** (near-death
STR/SPD surge) are now **self-cast skills** (`COMBAT_SKILLS`, applying the
`shield-wall` / `last-stand` statuses, per-level). Each is "special" in that
equipping it injects its own **gated cast tactic** (`makeSkillTactic` →
`canShieldWall` / `canLastStand`): Shield Wall fires only under attack (2+ foes in
reach, or one locked onto you), Last Stand only below 20% HP with a foe up — never
while just roaming. **Swoop** is now pure positioning (no speed multiplier), and
the **Dodge AoE** tactic was removed.

**Determinism:** the engine uses no RNG — damage variation is a pure function of
round + combatant index. (Loot rolls use `Math.random` in the *store*, outside the
engine.) The same roster + tactics replays identically.

**Movement is spatial:** units move toward targets, kite at range, flank, and
body-block; `moveSpeed` is decoupled from `attackSpeed`. Barriers block movement and
line-of-sight; casters won't fire through walls (but will through cliffs); knockback
stops at walls and the arena perimeter. A caster's default kite only backs away from a
**provoked** (hostile) threat (`nearestProvokedEnemyTo`) — it won't flee a still-wandering
non-provoked monster (that just jittered it back and forth); against a passive target it
closes to cast range and opens fire (which provokes it).

### Tactics (the player's combat lever)

- Tactics are named behaviours in `TACTIC_REGISTRY`, each on exactly one **channel**:
  `movement`, `targeting`, `action`, `reaction`, or `passive`. The engine evaluates
  the equipped tactics per channel in priority order each turn.
- Each unit equips up to `MAX_UNIT_TACTICS` (4) tactics (`unit.tactics`); the party
  shares up to `MAX_PARTY_TACTICS` (2) party-scope tactics (`partyTactics`). Scope is
  enforced against `TacticDef.scope`. Priority competes **per channel** (channels are
  evaluated independently); the Units `TacticsTab` groups equipped tactics by channel
  and the ▲/▼ arrows reorder *within* a channel only.
- **Floor vs trigger** (`TacticDef.kind`, default `'trigger'`). *Floors* fire whenever
  a basic precondition holds (`tank-buster`, `flanker`, `kiter`, `guardian`); a floor
  above a trigger in the same channel would starve it, so `resolveTactics`
  (`demoteFloors`) stable-sorts floors to the bottom of their channel and the UI warns
  on a manual floor-above-trigger ordering.
- **Skills granted as tactics:** action-bar skills are injected as action-channel
  tactics via the adapter, so equipping a skill gives a unit a combat action without a
  separate tactic slot. Among the injected attack skills the action channel leads with
  the **biggest ready nuke** (`orderAttacksByPower` + `skillDamageEstimate`,
  first-match over a power-sorted list); channeled-AoE keeps its first slot + worth-it
  gate, non-attack skills keep type priority.
- **Target-aware attack selection** (`reorderAttacksForTarget`, called in `takeTurn`
  after targeting resolves): the static biggest-nuke order above is target-*independent*,
  so each turn the unit re-ranks its single-target `attack` skills against the **currently
  locked enemy** and leads with whatever hits *that* foe hardest — a mage opens Frost Bolt
  into a fire-armored enemy, Fire Bolt into an earth one. The scorer is the one extensible
  hook `estimateDamageVs(caster, target, skill)` (`damage.ts`): raw formula − the *right*
  mitigation (magic vs physical) × the **element matrix** vs the target's effective armor
  (immunity ⇒ never picked), then **amortized over the cast cycle** (`channelTime +
  cooldown`) so a fast instant that exploits a weakness (Frost Bolt) beats a bigger but
  slow-channel nuke (Lightning Bolt) — element gaps still win, near-ties break toward the
  faster spell. (Caveat: the action channel still fires the highest-priority *in-range*
  ready attack, so a longer-range lower-throughput skill can open a fight before the unit
  closes into the preferred skill's range — see BACKLOG.) Future scorers (AoE spread value, sideboard weapon swaps,
  status synergy) extend this one function — see BACKLOG. Only the single-target attack
  slots permute; channeled-AoE and non-attack action tactics keep their position. Pure &
  deterministic (id tiebreak), re-derived from the lock each turn, so it needs no snapshot
  field and replays 1:1. **Hysteresis:** switching off the static lead requires the
  target-aware best to beat it by `exploitMargin` — a conservative **15% by default** (big
  elemental gaps clear it, near-ties don't thrash), which the opt-in **Exploit Weakness**
  passive tactic drops toward 0 (rank-scaled) so the unit always takes the absolute best.
  (`exploit-weakness.test.ts`.)
- **Charger** is a movement-channel **floor** (no speed or damage modifier): with a
  locked target it dives to the **centroid of the enemy pack** within
  `CHARGER_DIVE_RADIUS` of that target (crash into the group to set up a melee AoE),
  and it **leashes** — if a fleeing foe drags it past `CHARGER_LEASH` (+per-rank)
  from the party centroid it drops the lock and regroups (cohesion over an endless
  chase). As a floor it demotes below same-channel triggers, so it can't starve them.
- **Team blackboard read side:** `teamFocus(self, state)` reads the planner's shared
  `focusTargetId` (lowest-HP visible enemy). `opportunist` (rank-scaled HP gate),
  `finish-them` (party, near-dead gate), and `focus-fire` (party, unconditional)
  read it instead of each re-scanning — the "who's hurt" + vision/stealth filtering
  lives once in `defaultPlanner`.
- **Burst kit** (opt-in, role-specific): `assassinate` (hunt the enemy healer/top
  caster), `burst` (bank a ready small skill while the heavy hitter is ≤window rounds
  out, then chain — stateless **cooldown-lookahead**, no per-unit memory bag), and the
  party-scope `focus-fire`.
- **Per-turn resolution** (`Combatant.lastResolution`, runtime-only): the eval loops
  record what fired vs why the rest were dormant (`fired`/`idle`/`starved`/`cooldown`),
  surfaced live in the BattleView DebugTab.
- Monsters may carry their own skills and tactics (see `monsterToEngineInput`).

### Combat view (a drop-in mode of the Map tab)

- There is **no standalone Combat tab.** The battlefield is a *mode* of the Map
  tab: `mapMode` is `'world'` (pannable overworld + location details) or
  `'battle'` (the drop-in viewer for `combatLocationId`). The roster carousel
  (`src/components/RosterCarousel.tsx`) stays pinned across both so the
  transition is seamless.
- **Drop in:** single-tap a map location to select it; **double-tap** a location,
  or hit the **Drop in ›** button (location detail panel / unit action bar), to
  enter battle mode (`enterBattleView`). A **⤢ Overworld** chip zooms back out
  (`exitBattleView`), re-selecting the location you were watching.
- **`UnitActionBar`** (Deploy/Here · View · Map · Drop in) shows whenever a unit
  is selected — in **both** the overworld and the battle drop-in (battle mode
  swaps the Overworld/round context bar for it while units are selected). The
  **Map** button (`focusLocationOnMap`) recentres the overworld camera on the
  unit's location.
- **Roster double-tap:** mirrors the location double-tap and is mode-aware
  (`showUnitOnMap`). In the **overworld** it frames *and recentres the camera* on
  the unit's location (`mapFocusNonce`); in **battle** mode it jumps to that
  unit's battlefield and centres the camera on them (`battleFocus`). The
  battle-view ⊙/auto control re-fits the whole party (clears the unit focus).
  Single-tap still toggles selection.
- **Combat keeps running for every location regardless of view** — but only the
  one you're *watching* runs the full per-tick spatial sim. When you've dropped
  into a battle (`mapMode === 'battle'`, `combatLocationId`), the **other**
  locations advance **off-screen**: `advanceBattles` skips their sim and credits
  rate-extrapolated rewards every `OFFSCREEN_CREDIT_TICKS` (25) via `creditOffscreen`
  (warm: `projectOfflineRewards`; cold: a one-time budgeted prime to seed the rate,
  keeping the frozen battle for drop-in) — reusing the offline machinery. In **world
  mode** (and tests) there's no watched battle, so every location full-sims as
  before. Off-screen parties earn but take no casualties (a simplification; deaths
  resume the moment you drop back in). This is the scaling lever: watch one party
  hunt while many others progress cheaply. (`offline.test.ts`.)
- The viewer is `src/components/BattleView.tsx` (`<BattleView locationId>`): live
  battle if one is running, otherwise the static form-up `Preview`. The pannable
  arena fills its space (square, centred); tokens are circles sized to ~0.9 of a
  grid cell so they scale with zoom (`chipDims` in `cqmin`, the arena is a CSS
  size-container), with a subtle front-facing arrow (`Combatant.facing`, set in
  `takeTurn`: move direction, else toward the locked target) plus a second
  chevron just ahead of it while `Combatant.moving`, floating name + HP, attack
  lines, hit flashes, floating damage/heal/DoT numbers, and **lingering cast
  labels** — a skill's name stays anchored above its caster for `CAST_LABEL_MS`
  (3s, covering the channel + a beat after it lands), keyed by caster+skill so a
  channel's start/resolve and rapid re-casts collapse to one label; multiple
  distinct casts stack newest-on-top (`animate-cast-label`).
- Monster HP bars animate down during combat and **snap to full** on respawn (no
  upward animation).
- Tapping a token opens a **dismissable bottom-sheet overlay** (name, team, HP,
  stats, per-skill cooldowns, statuses, casting line) that floats over the arena
  so it never steals arena height.

### Offline progression — Sampled "Warm Catch-up"

When the player returns after an absence, `catchUp` (`App.tsx`) converts elapsed
real time into ticks and calls `batchTick(n)` (`n > 10`). `batchTick` **does not
re-simulate** `n` ticks of spatial combat (a naive fast-forward janks — ~72k
rounds for an 8h heavy battle); it **extrapolates combat rewards from realized
rates** (`src/lib/offline.ts`).

- **Wall-clock persistence.** `worldCodec` persists `savedAt` (Date.now() at save
  time) and restores it as `lastTickAt` on load — without it `lastTickAt` would
  reset to page-load time and a full app restart would extrapolate ~zero offline
  time. Old saves migrate to `savedAt = now` (no spurious catch-up).
- **Warm extrapolation (Phase 1).** For each location with deployed units **and**
  a `locationStats` sample, `projectOfflineRewards` scales the realized rate
  (from `getLocationCombatReport`, window = `startTick`→`endTick`) by the offline
  ticks. exp/gold/kills are **deterministic** (floored EV); **loot is rolled**
  per projected kill (`rollOfflineLoot`, mirroring the live `rewardKills`) so
  rare drops aren't lost to an EV floor. The exp **pool** is split across the
  deployed party by level (`splitExpByLevel`, same anti-power-leveling rule as
  live combat); gold + loot fold into `miscItems`; `monsterDefeated` (codex) and `locationStats`
  advance so the rate stays coherent for the next catch-up.
- **Cold priming (Phase 2).** A location deployed but never sampled has no rate.
  `primeColdLocation` runs a **budgeted** slice of real combat (cap
  `PRIME_ROUND_CAP` = 300 rounds **and** `PRIME_MS_BUDGET` = 50 wall-ms) to
  settle the in-flight fight, collect its actual rewards, and seed a sample; the
  remaining offline time is then extrapolated on that fresh rate. The primed
  battle is kept in `battles[locationId]`. A Web Worker offload stays deferred
  (the BSNAP tokens already make a battle worker-portable).
- **Sampled windows (Phase 3, long absences).** A single linear extrapolation is
  smooth — it can't show a clump of monsters or a lucky/unlucky stretch. For an
  absence long enough to span ≥2 windows (`offlineWindowCount`, ~one per
  `SAMPLE_WINDOW_TICKS` = 30 min, capped at `SAMPLE_MAX_WINDOWS` = 12),
  `projectOfflineSampled` splits the span into **independent windows**: each
  simulates a short budgeted slice (`runCombatSlice`, shared with priming),
  extrapolates that slice's rate over the window, and the windows are **summed** —
  re-stocking the field (`restockField`, fresh random draws) between them so each
  is a fresh composition sample, so the total carries real variance (a varied
  monster pool → clumps; loot rolled per projected kill). It subsumes warm + cold
  for long spans (it simulates either way). **Extension seam:** `SampledOptions.
  prepareWindow(battle, windowIndex, windowStartTick)` is called before each
  window's slice — a future scheduled-event system injects a periodic boss there
  (`spawnMonsterAt`) so it's actually fought + rewarded in the windows it belongs
  to. (`offline.test.ts`.)
- **"While you were away" summary.** `batchTick` writes an `OfflineSummary`
  (runtime-only, not saved) when the absence is ≥ `OFFLINE_SUMMARY_MIN_SECS`
  (60s) and something happened; `OfflineSummary.tsx` shows it as a portal modal
  (totals + per-location breakdown + loot; cold-primed locations tagged
  "settled"), cleared via `dismissOfflineSummary`. Rewards still apply below the
  gate — the gate only suppresses the modal for brief background blips.

### Unit Selection & Detail Card

- Tapping a unit card toggles its selection. Multiple units can be selected.
- When **exactly 1 unit** is selected on the Map tab, a detail card is shown above the action bar containing:
  - Unit name and class badge.
  - Exact integer HP (color-coded: green ≥75, gold ≥40, red <40) and an HP bar.
  - Element trait badges (filtered from `getUnitTraits`).
  - Four derived stats in a grid: ATK, DEF, SPD, ACC (from `getDerivedStats`).
  - A `View ›` button that navigates to the Units tab with that unit's row expanded.
- The action bar always shows a `Move to ▾` dropdown for assigning selected units to any location or back to Unassigned.

### Expand/Collapse Persistence

All collapsible sections remember their state across tab switches via localStorage:

| Section | Store field | localStorage key | Default |
|---|---|---|---|
| Location rows | `expandedLocationIds` | `expandedLocationIds` | `[]` (all collapsed) |
| Unit rows | `expandedUnitIds` | `expandedUnitIds` | `[]` (all collapsed) |
| Inventory sections | `expandedInventorySections` | `expandedInventorySections` | all three expanded |
| Map pages | `expandedRegionIds` | `expandedRegionIds` | `["world","geffen-dungeon"]` |

### Crafting

- Learned recipes are listed in `learnedRecipes[]`; definitions live in `RECIPE_REGISTRY`.
- The Craft button is enabled only when every ingredient has sufficient quantity in `miscItems`.
- Crafting consumes the listed ingredients and produces the output item (adds to `equipment` or `miscItems`).

### Equipment

- Equipment slots per unit: `mainHand`, `offHand`, `tool`, `armor`, `accessory`.
- Equipping a 2H weapon in `mainHand` locks the `offHand` slot (cannot equip anything there).
- Equip flow: tap a slot in the Units tab → Inventory tab opens in equip-context mode → select an item → returns to Units tab with item equipped.
- Items in the equip picker show stat deltas vs the currently equipped item in that slot.
- An `↑ Upgrade` badge appears when an item's total stat score exceeds the currently equipped one.

