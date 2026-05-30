# Combat / Tactic Engine — Backlog

Deferred work and known shortcuts for the combat engine (`src/engine`).
Implemented behavior is in `CLAUDE.md` → Feature Specifications.

## Long-horizon shape changes

- **✅ Combat lives inside the Map tab.** Done — the standalone Combat tab is
  gone; the battlefield is a `mapMode === 'battle'` drop-in of the Map tab
  (`BattleView` + `RosterCarousel`). Single-tap selects a location; double-tap
  (or the **Drop in ›** button) zooms in; the **⤢ Overworld** chip zooms back
  out. Known follow-ups:
  - *Sizing* — the arena is `aspect-square` filling its flex region; verify it
    on short / landscape viewports (the proportions differ a lot from the
    overworld layout — expect a couple more tuning passes).
  - *Roster taps in battle mode are currently inert* (no action bar there). A
    natural next step: tapping a roster hero in battle mode highlights/centres
    their chip, or surfaces a slim deploy/recall control.
- **🟡 Open world instead of single encounters (first iteration shipped).**
  A location can now set `openWorld: true` to run a *persistent* battle
  (`BattleState.mode === 'open'`) instead of the discrete wave model:
  - The battle never self-terminates — `evalOutcome` returns `'ongoing'` in
    open mode; the store owns teardown (no eligible heroes → battle removed).
  - Monsters trickle back in via the engine's new `addCombatant`, one at a
    time, up to a fixed per-location `openWorldCap`, every
    `OPEN_WORLD_SPAWN_TICKS`. Picked at random from `monsterIds`.
  - Heroes join / leave the live fight as they deploy or recover
    (`reconcileOpenPlayers`), so the party adapts to who's standing.
  - Discrete encounters are unchanged and still the default — scenarios,
    the Elite Four, cities and the dungeon stay deterministic for tests.
  Second iteration (shipped): a **large per-battle map** (`cols/rows`, default
  100×100 via `openWorldSize`), **vision-limited targeting** (`visionRange` —
  heroes 10, monsters 8), and **wander** — heroes roam a shared waypoint and
  converge on engaged allies; idle monsters lurk then hop locally. Monsters
  **scatter** across the field; the camera follows the party. Per-battle bounds
  live in `engine/arena.ts` so no movement clamp hardcodes a size.
  Follow-ups still open:
  - *Overworld travel between locations* — a deployed unit walking from one
    open-world map to a connected one (the `travelPath` field exists but isn't
    driven yet). The engine **move-order** primitive (`issueMoveOrder`, paths to
    a point / holds if blocked, instantaneous in grid steps) is the building
    block; this would make it non-instantaneous and cross-location, and likely
    add a teleport-style movement ability that satisfies an otherwise-impossible
    path (the move-order tests already model the impossible case).
  - *Smarter spawns* — per-location monster *distributions* (weights, level
    bands, time-of-day) and non-uniform spawn timers. Today it's an equal-weight
    random pick on a fixed timer, scattered uniformly across the map.
  - *Seeded RNG for determinism* — spawn picks / loot / scatter use
    `Math.random` in the store. Live open-world play is no longer "same inputs →
    same outputs"; tests pin `Math.random`. A seeded generator would make
    replays exact. (Engine wander/vision are already deterministic.)
  - *Hunt pacing* — wander is a pure roam; a strong party of 3 clears ~1
    monster / ~20s on a 100×100 field at cap 12. Vision radius, move speed, cap
    and map size are the knobs; no "track the nearest scent" heuristic yet.

## Combat content

- **Per-location quests & async choices.** Each location grows a small
  pool of quest hooks (kill X, escort Y, recover Z) and pinch-point
  choices the player resolves out-of-combat. Resolution is async — the
  party at the location ticks toward the objective in the background,
  and choice nodes surface in a notification / location panel for the
  player to answer when convenient. Folds into the open-world shape
  (above) and the location codex, so each cell is more than "the wave
  it spawns."
- **Ranger Beast Master pets** — a Ranger subclass / kit that fields a
  combat companion (wolf, hawk, bear?) that fights alongside the party.
  Needs: a pet as an extra player combatant with its own stats / tactics,
  an "owner" link for follow-the-ranger movement, summon / dismiss flow,
  and probably an action-bar pet command (sic / heel / guard) before the
  AI is interesting on its own.
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

- **🟡 Team blackboard (first iteration shipped).** Per-team scratchpad
  recomputed each round by a pluggable **planner** and stashed on
  `BattleState.plans: Partial<Record<Team, TeamPlan>>`, where
  `TeamPlan = { waypoint, focusTargetId, threat }`. Wired in so far:
  - *Wander reads the plan* — the party's shared roam `waypoint` (regroups on a
    fight, else roams the interior) lives on the blackboard; `executeWander`
    just reads it, so "wander together" is shared state, not coincidence.
  - `defaultPlanner` also computes an advisory `focusTargetId` (lowest-HP
    visible enemy) and a per-enemy `threat` score; both are exposed in the
    BattleView **Debug tab** and asserted in `blackboard.test.ts`.
  Still open: actually *consume* focus in a targeting tactic (focus-fire), add
  `disableTargetId`, and use the blackboard to replace the `HERD_BIAS` path
  detour (flanker pulling a rogue the long way around).
- **Strategies = multi-channel tactic bundles.** A `STRATEGY_REGISTRY` where
  each entry expands to TacticRefs across channels + an optional planner.
  Examples: *Assassinate* (focus-squishy + flank + cloak/back-stab),
  *Lock & Focus* (Controller + Focus Fire), *Kite* (existing + maintain LoS).
- **Ambush combo** — primitives exist (cloak, back-stab, flanker,
  focus-casters, **ambusher** — stalk-while-cloaked); needs an orchestrator
  that holds Cloak until in Back Stab range of the focus target.
- **Sneak Attack skill** — a learnable skill that scales the base
  `STEALTH_ATTACK_BONUS` (currently a flat +25% on any strike from stealth) up
  with level, so investing in stealth makes the opening ambush hit harder.
  Today the bonus is a single engine constant; the skill would read its level
  and feed a per-unit multiplier through the adapter.
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

- **Crafting loop is disconnected at the joints.** Monster drops add
  `drop-*` items to inventory, but recipes consume the starter items
  `m1`–`m4` (not the `drop-*` items), and recipe outputs are `craft-*`
  items that don't exist in `equipment.ts` — so nothing crafted is
  equippable. Closing drops → recipes → equipment is the main inventory
  gameplay gap.
- **Dead code removed** (was: `HelloWorld.tsx`, `Codex.tsx` page,
  `useResourceStore`). The codex UI lives embedded in `Map.tsx`.
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

Arena size is now **per-battle** (`BattleState.cols/rows`), defaulting to
`COLS`/`ROWS` (15×15) for encounters and set large (100×100) for open-world.
Movement clamps read the active bounds via `engine/arena.ts`
(`setArenaBounds`/`arenaClamp`), set at each engine entry point — **no movement
clamp hardcodes a size**. **No tactic may hardcode absolute coordinates** —
everything is relative to enemies/allies/edges. Tuned-for-15×15 knobs that an
*encounter* still depends on (don't blindly scale them with the open-world map):
`BASE_MOVE_SPEED`, reach bands in the adapter, `startingPosition` formations,
`SEPARATION`, `HERD_BIAS`, kiter probe distance, `DEFAULT_CAM_SIZE`. Open-world
has its own `followCamera` + `OPEN_CAM_SIZE`.
