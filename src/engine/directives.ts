// Combat Tactic Engine — directives (tactical-coordination.md §3.5, M4).
//
// The player's ONE party-scope lever over the planner: a directive is plain
// data the planner reads (stance/anchor/pull/target/protect emphases) plus
// optional party-scope tactic injections through the existing partyTactics
// seam. A directive REQUESTS a behavior; acumen still bounds how well the
// planner executes it (§3.2), and equipped tactics keep outranking plan
// defaults — the directive can never override a player's unit-level lever.
//
// Same pattern as TACTIC_REGISTRY (engine-pure plain exported objects, no
// store/time/data imports). A battle carries only the directive ID per team
// (`BattleState.directives`, serialized like `objectives` — absent on legacy
// tokens ⇒ shipped behavior); defs resolve through this registry on read, so
// re-tuning a directive intentionally re-tunes live saves too. Monsters use
// the same seam: a MonsterDef may carry a directive id and the host sets it
// on the enemy team — pack roles are a directive, not new machinery.

import type { BattleState, Stance, TacticRef, Team } from './types'

export interface DirectiveDef {
  id: string
  name: string
  description: string
  stanceBias?: Stance                                  // fight this way when viable
  anchorPolicy?: 'choke' | 'ambush' | 'ground' | 'none' // where the line stands
  pullDiscipline?: 'strict' | 'loose'                  // scales pullMargin (tuning.ts)
  targetPolicy?: 'dangerous' | 'wounded' | 'squishy'   // kill-order bias
  protect?: 'carry' | 'weakest'                        // force + aim the standing guard (§3.2 capability query)
  // §3.5 the ambush-combo orchestrator: a cloaked striker with a ready
  // stealth-opener (Back Stab) holds its cloak — no reveal — until the opener
  // reaches the plan's primary. Gated on ACUMEN.ambush at execution.
  ambushTiming?: boolean
  tactics?: TacticRef[]                                // party-scope tactic injections (existing seam)
}

export const DEFAULT_DIRECTIVE_ID = 'skirmish'

// The launch five (§3.5): small, legible, each mapping to a scenario the sim
// can already stage.
export const DIRECTIVE_REGISTRY: Record<string, DirectiveDef> = {
  'skirmish': {
    id: 'skirmish', name: 'Skirmish',
    description: 'The default doctrine: pick fights the party can win, converge fire, fold when losing — every planner behavior at its inferred defaults.',
    // Deliberately empty: skirmish IS the shipped planner. An explicit skirmish
    // and an absent directive behave identically — and serialize identically:
    // setTeamDirective treats the default id as "clear", keeping every
    // skirmish battle's token byte-identical to a legacy one.
  },
  'hold-the-line': {
    id: 'hold-the-line', name: 'Hold the Line',
    description: 'Anchor on the best gap or chokepoint and stand the line there. Strict pull discipline — only take fights the party comfortably wins.',
    stanceBias: 'hold', anchorPolicy: 'choke', pullDiscipline: 'strict',
  },
  'pull-to-camp': {
    id: 'pull-to-camp', name: 'Pull to Camp',
    description: 'A designated puller tags the kill target and drags it back to the line — anchored behind a sight break when the ground offers one. Strict pulls.',
    anchorPolicy: 'ambush', pullDiscipline: 'strict',
  },
  'protect': {
    id: 'protect', name: 'Protect',
    description: "A standing guard peels for the carry (the party's damage engine) in every fight — not just when someone reads as fragile.",
    protect: 'carry',
  },
  'assassinate': {
    id: 'assassinate', name: 'Assassinate',
    description: 'Kill order flips to the squishiest target — their healer first. The party converges on it, and a cloaked striker holds its cloak until Back Stab range.',
    targetPolicy: 'squishy', stanceBias: 'collapse', ambushTiming: true,
    tactics: [{ id: 'focus-fire', rank: 1 }],
  },
}

// Resolve the live directive for a team, or null (absent / unknown id ⇒
// shipped behavior — an id from a newer registry degrades safely).
export function directiveOf(state: BattleState, team: Team): DirectiveDef | null {
  const id = state.directives?.[team]
  return (id && DIRECTIVE_REGISTRY[id]) || null
}

// The adapter-injection seam (§3.5): append a directive's party-scope tactic
// injections to the host's partyTactics, deduped (an explicitly-equipped copy
// keeps its slot and rank). createBattle/addCombatant apply this at placement;
// the host's live-edit relink path composes through it too.
export function withDirectiveTactics(party: TacticRef[] = [], directiveId?: string | null): TacticRef[] {
  const def = directiveId ? DIRECTIVE_REGISTRY[directiveId] : null
  if (!def?.tactics?.length) return party
  const have = new Set(party.map((t) => t.id))
  const injected = def.tactics.filter((t) => !have.has(t.id))
  return injected.length ? [...party, ...injected] : party
}

// Host-facing setter (the future setTeamObjective's pattern, §3.6): set or
// clear a team's directive on a live battle. Passing null — or the default id
// — clears; the `directives` object itself is dropped when empty so a battle
// that never carried one serializes byte-identical to a legacy token.
export function setTeamDirective(state: BattleState, team: Team, id: string | null): void {
  const want = id && id !== DEFAULT_DIRECTIVE_ID ? id : null
  if (want) {
    if (!state.directives) state.directives = {}
    state.directives[team] = want
  } else if (state.directives) {
    delete state.directives[team]
    if (Object.keys(state.directives).length === 0) delete state.directives
  }
}
