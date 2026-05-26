# Combat / Tactic Engine — Backlog

Deferred work and known shortcuts for the combat engine (`src/engine`).
Implemented behavior is in `CLAUDE.md` → Feature Specifications (which is
itself behind — see *Spec drift* below).

## Combat content

- **Pneuma / protective zones** — friendly zone that blocks (or halves) ranged
  damage to allies inside. Needs `blocksRanged` on `BattleZone`.
- **Reaction-channel skills** — Counter and Pneuma as equippable skills (we
  still only have the built-in `counterattacker` tactic). Extend
  `makeSkillTactic` to emit reaction-channel tactics.
- **Type-conditional / vs-type skills** — Turn Undead-style instant defeat
  vs a *type*. The element matrix covers radiant×undead damage already;
  the type flag is separate (`monsterType` on Combatant + `vsType` on
  EngineSkill).
- **Element on DoT / zones** — Poison and Firewall ticks bypass the matrix;
  a fire-immune enemy still burns in a Firewall.
- **Weapon-imbue from traits** — `element` trait category exists; not wired
  through `getUnitTraits` → `getDerivedStats`.
- **Per-unit elemental resistances** beyond a single armor element.
- **Combat UI for elements** — `resisted / 2×` indicator on damage numbers;
  show effective vs current armor element on the card.
- **Combat log UI** — event stream is rich (every hit, heal, status,
  interrupt); only floating numbers render. No history of "Aldric hit Slime
  for 24."

## AI & coordination

The biggest open chunk. Today every unit picks targets and paths
independently; `HERD_BIAS = 4` is a one-line hack that approximates "go the
same way" by penalising left-side detours.

- **Team blackboard.** Per-team scratchpad computed once at round start and
  stashed on `BattleState`:
  ```
  state.plans: Record<Team, TeamPlan>
  TeamPlan = { focusTargetId, disableTargetId, threat: Record<id, number> }
  ```
  Tactics *read* the plan instead of recomputing, so "A disables X while B+C
  focus-fire Y" falls out. Produced by a pluggable **planner** — that's the
  injection point (a team's AI = planner + tactic loadout). Replaces
  HERD_BIAS with real coordination; also fixes flanker pulling a rogue the
  long way around.
- **Strategies = multi-channel tactic bundles.** A `STRATEGY_REGISTRY` where
  each entry expands to TacticRefs across channels + an optional planner.
  Examples: *Assassinate* (focus-squishy + flank + cloak/back-stab),
  *Lock & Focus* (Controller + Focus Fire), *Kite* (existing + maintain LoS).
- **Ambush combo** — primitives exist (cloak, back-stab, flanker,
  focus-casters); needs an orchestrator that holds Cloak until in Back Stab
  range of the focus target.
- **LoS-aware positioning** — kiter holds *distance* but doesn't relocate to
  gain a clear shot if a wall is between it and the target. Casters can
  silently stall behind a cross arm.
- **1v1 chase circling** — a lone chaser orbits a barrier after a fleeing
  target forever. Multi-unit fights converge so this rarely bites in
  practice; would need a "cut the corner" intercept.

## Engine inconsistencies & gaps

- **Channeled spells don't recheck LoS at resolve time** — a target can step
  behind a wall mid-channel and still get hit on resolve.
- **Heal / buff / reveal don't check LoS** — only enemy targeting does.
  Probably desirable, but inconsistent.
- **`enforceSeparation` against walls** — corners can briefly produce
  two-unit pile-ups before things resolve.
- **Visibility graph rebuilt per nav call** — fine at this scale; cache
  corner-corner edges per battle if terrain grows.

## Heuristic shortcuts

- `HERD_BIAS = 4` — numeric fudge for path side-picking. The team blackboard
  is the real fix.
- **Magic focus `range` stat** — rod / wand / staff carry `range` to make
  casters ranged in the engine. Class (Mage / Cleric) should set this, not
  weapons.
- **`MAX_UNIT_TACTICS = 4`** — caused awkward swap-outs (Lyra lost `nimble`
  for `flanker`). Bumping to 5–6 might be more honest now.

## Data / spec drift

- **`CLAUDE.md` Feature Specifications** still documents the pre-engine
  combat (KO recovery, monster-behavior dropdowns, encounter slots). The
  tactic engine replaced most of it. The doc lags.
- **Per-location terrain** is a single hardcoded map (`LOCATION_TERRAIN`)
  and `arenaBarriers()` returns one fixed cross regardless of location.
- **No save migrations** — recent INITIAL_UNITS overhaul, new skills, new
  equipment fields (range on rod/wand/staff) would invalidate any saved
  state if persistence is added later.

## Verification gaps — spot-check until codified

Behaviors not covered by automated tests; apt to regress silently. Run
through after relevant changes (or before any release-worthy commit),
then promote to a real test once stable.

**Combat view** (after `Combat.tsx` / render changes):

- Unit token at the arena edge stays fully on-screen (no clipping).
- Tap a chip opens a detail card with: name + team, HP bar + integer,
  STR/DEF/INT/SPD, per-skill cooldown meters with remaining rounds,
  statuses with duration, casting line when channeling. Tap the same
  chip again closes it.
- Walls render solid stone; cliffs render dashed / translucent.
- Channeling unit gets an amber "✦ \<spell\>" badge + ring.
- Floating numbers — red damage / green heal / fuchsia DoT; amber
  "interrupted" on disrupted casts.
- Hit flashes and attack arc lines appear and fade per round.
- Preview chips render before the wave starts; no leftover slice-to-5.

**Combat feel** (after engine / tactic / skill changes — run one Geffen
Dungeon Floor 2 fight and one open-field fight):

- Party files around the central cross at Geffen 2 without piling up;
  no permanent outliers taking the long way (the `HERD_BIAS` heuristic
  still doing its job).
- Open-field combat is clean: no units stalling, melee converges.
- Kiter holds at spell range, backs straight off in the open, arcs
  along walls instead of pinning into a corner.
- Faster units (high `spd`) visibly outpace slower ones over a few
  rounds.
- Casters refuse to fire through walls (Theron behind a cross arm);
  do fire through cliffs when a location uses them.
- Knockback stops against barriers AND the arena perimeter; nothing
  leaves the map.
- Frozen units skip a turn but stay frozen; stunned units skip and the
  stun is consumed.
- Stealthed units can't be targeted by enemies; basic attacks reveal
  the attacker after the strike.

**Catalog / data** (after `INITIAL_UNITS`, equipment, or skill catalog
edits):

- All six heroes have a class and a deep, role-built loadout; casters
  and the archer deploy back-line, melee front-line.
- Geffen 2 wave (3 tough-slime + 2 bat) still resolves without stalling.
- New active skills appear in the skill tree and the action-bar drag
  picker.

**Persistence** (whenever save/load lands):

- New skills, new equipment fields (e.g. `range` on rod / wand / staff),
  and reshuffled `INITIAL_UNITS` need a migration story or they'll
  silently corrupt old saves.

## Grid-size independence (invariant — keep)

`COLS`/`ROWS` are the only size knobs. **No tactic may hardcode absolute
coordinates** — everything is relative to enemies/allies/edges. Things to
re-tune (not re-architect) when the grid grows: `BASE_MOVE_SPEED`, reach
bands in the adapter, `startingPosition` formations, `SEPARATION`,
`HERD_BIAS`, kiter probe distance, `CAM_SIZE`.
