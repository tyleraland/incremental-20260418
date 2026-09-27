# AI logic seams — a map

A terse map of the layers the party-coordination AI is built from: what each
seam is *for* and *why* it exists as its own layer. Names point at the code;
the *what* (mechanics, formulas, milestone history) lives in the design docs —
this file is the index, not the manual.

- **Full design:** `tactical-coordination.md` (the team half) and
  `movement-action-coupling.md` (the unit half).
- **Live status + mechanics:** `src/engine/CLAUDE.md` §coordination (per-milestone).

## The stack (top decides, bottom executes)

```
objective   (store: why is the team here at all)      ── reserved seam, M5
directive   (player: which emphasis)                  ── DIRECTIVE_REGISTRY
   ↓ both are INPUTS the planner reads
planner     (the one writer)          sense→appraise→decide→assign→publish
   ↓ writes
blackboard  (TeamPlan on BattleState.plans)           ── shared team intent
   ↓ read by
read side   (per unit, as the DEFAULT layer)   selectTarget · executeMovement · scoreCandidate
   ↓ priced by
scorers     (pure, matchup-relative, memoized)  estimateDamageVs · threatProfile · exposureAt
```

Player-equipped tactics sit *above* the read side's plan-default layer: the
plan advises, the lever wins.

## The seams

- **Blackboard** — `TeamPlan` on `BattleState.plans`. *Why:* one place for the
  team to hold cross-round **commitment** and derived intent, so six units stop
  each deciding alone. Serialized, so commitment survives a replay.
- **Planner pipeline** — `defaultPlanner` → `decideEngagement` (`teamplan.ts`),
  staged sense→appraise→decide→assign→publish. *Why:* separate "what should the
  team do" (once per team per decision round) from "execute it" (per unit); each
  stage is a pure, independently testable function, and it's the **only** writer
  of the blackboard (one writer, many readers).
- **Capabilities + acumen** — `computeCapability`, `teamAcumen` (`teamplan.ts`).
  *Why:* the planner asks "who tanks / pulls / carries best *here*" as
  **relative** queries (top/median/outlier), never absolute stat bars, so one
  tuning works at level 2 and level 90; acumen gates *how smart the team is
  allowed to be*, so smart members diegetically make a smart party (and killing
  the enemy's scholar collapses its coordination).
- **Pull model** — `pullSetOf` + the mutual-TTK race (`teamplan.ts`). *Why:* the
  single predictive primitive for "what will hitting this actually cost," so the
  team can choose fight / avoid / pull. Shares the engine's *real* aggro
  predicates (no-drift): a prediction that diverged from reality would be worse
  than none.
- **Read side** — `selectTarget` (`behavior.ts`), `executeMovement`
  (`engine.ts`), `scoreCandidate` (`plan.ts`). *Why:* units consume the plan as
  their **default** layer (below equipped tactics, above the vacuum); three small
  uniform hooks — target / move / score — express every assignment without new
  engine machinery.
- **Scorers** — `estimateDamageVs`, `threatProfile`, `forecastAction`,
  `exposureAt`, `preferredAttackVs` (`damage.ts`/`plan.ts`). *Why:* the shared,
  pure, matchup-relative pricing every decision reads; one place to make the
  whole AI honest — or, through the mask, honestly uncertain.
- **Intel mask** — `knownView` (`damage.ts`). *Why:* one wrapper makes every
  scorer read a *masked* view of an enemy, so imperfect information flows through
  the entire AI with **zero** changes to any consumer; damage *resolution* keeps
  true stats (reality doesn't care what you know).
- **Directive** — `DIRECTIVE_REGISTRY` (`directives.ts`), one persisted party
  slot. *Why:* the single coarse **player** lever; a directive is *data the
  planner reads* (requests an emphasis — stance, pulls, kill-order, guard),
  acumen bounds how well it's executed, equipped tactics still outrank it. Not a
  script, not an override.
- **Objective** — `TeamObjective` (types; reserved, M5). *Why:* lets the
  **store** say why the team is here (escort / hold / work) without new engine
  modes; cross-*location* coordination is the store's job, spoken through this
  one field. Present as a seam, not yet populated.
- **Commitment + hysteresis** — `engagement.sinceRound`, `rout`, `ENGAGE_EXIT`,
  abandon predicates (`teamplan.ts`, `tuning.ts`). *Why:* cross-round memory is
  what plans need most — commitment is the **fast path** (skip the wide appraise
  while an engagement holds), and the abandon predicates are the one place
  "pursue → notice failure → switch/flee" lives.
- **Tuning columns** — `POSTURES`, `ACUMEN`, named margins (`tuning.ts`). *Why:*
  a new consideration is a new **column/row of data**, not a new mechanism —
  keeps behavior legible on the Debug panel and tunable in the browser without
  touching logic.
- **Determinism / serialization** — snapshot optional-when-set fields
  (`snapshot.ts`). *Why:* the invariant that lets every layer above evolve —
  each new plan field replays 1:1, absent ⇒ shipped behavior, so behavior changes
  are deliberate and test-pinned, never accidental replay drift.
- **Debug seam** — Plan panel (`BattleUnitSheet`) + `bsnap -i` (`scripts/bsnap.mjs`).
  *Why:* plans are plain data a human reads off the panel — *legibility over
  machinery* is a hard design rule; extend the inspect line, never hand-roll a
  dump.

## Why it's layered this way (the one idea)

Every hard thing the team does — converge fire, don't over-pull, hold a choke,
guard the carry, flee a lost fight, misjudge an unknown foe — is the **same**
loop: the planner writes intent to the blackboard once, units read it as their
default, and shared scorers price it all. New behavior is a new planner stage +
a read-side hook + a tuning column, never a new subsystem. What we deliberately
*don't* build (GOAP/HTN/behavior trees, per-unit message passing, a blackboard
write API for tactics) is listed in `tactical-coordination.md` §9.
