// Battle snapshot (§debug) — serialize a live BattleState to a compact string
// and rebuild it 1:1, so a player can copy the exact state of a location's fight
// and a developer can reload it to reproduce/debug.
//
// What's preserved: every combatant's stats/position/cooldowns/statuses/channel/
// move-order/wander state, the grid size, mode, barriers, zones, team plans,
// round, and outcome — i.e. everything the deterministic sim reads. What's
// dropped (regenerated, not read by advanceRound): the `events` log and each
// combatant's debug `trace`. The non-serializable function fields (`planner`,
// `calculateDamage`, and each tactic's behaviour fns) are rebuilt from defaults
// and the tactic ids on load. Since the engine uses no RNG, reload + advance
// reproduces the original run exactly.

import { TACTIC_REGISTRY } from './tactics'
import { makeSkillTactic } from './skills'
import { defaultCalculateDamage } from './damage'
import { defaultPlanner } from './engine'
import { MAX_ROUNDS } from './constants'
import type { BattleState, Combatant, ResolvedTactic, TacticRef } from './types'

const SNAPSHOT_VERSION = 1
const MAGIC = 'BSNAP'   // human-identifiable prefix on the copied string

// Unicode-safe base64 (works in browser + jsdom + node).
function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)))
}

// A combatant minus its resolved-tactic objects (functions); tactics travel as
// {id, rank} refs and are re-resolved on load.
type CombatantSnap = Omit<Combatant, 'tactics' | 'trace'> & { tacticRefs: TacticRef[] }

function combatantToSnap(c: Combatant): CombatantSnap {
  const { tactics, trace: _trace, ...rest } = c
  return { ...rest, tacticRefs: tactics.map((t) => ({ id: t.def.id, rank: t.rank })) }
}

// Rebuild a combatant's resolved tactics from refs. Behavioural tactics come
// from TACTIC_REGISTRY; skill-granted tactics (`skill:<id>`) are rebuilt from
// the combatant's own (already-deserialized) skill list via makeSkillTactic, so
// they don't depend on a global skill registry.
function rebuildTactics(snap: CombatantSnap): ResolvedTactic[] {
  const out: ResolvedTactic[] = []
  for (const ref of snap.tacticRefs) {
    if (ref.id.startsWith('skill:')) {
      const skillId = ref.id.slice('skill:'.length)
      const sk = snap.skills.find((s) => s.id === skillId)
      if (sk) out.push({ def: makeSkillTactic(sk), rank: ref.rank })
    } else {
      const def = TACTIC_REGISTRY[ref.id]
      if (def) out.push({ def, rank: ref.rank })
    }
  }
  return out
}

interface BattleSnapshot {
  v: number
  combatants: CombatantSnap[]
  zones: BattleState['zones']
  barriers: BattleState['barriers']
  cols: number
  rows: number
  mode: BattleState['mode']
  plans: BattleState['plans']
  round: number
  outcome: BattleState['outcome']
  stats: BattleState['stats']
  maxRounds: number
  collectEvents: boolean
}

// Serialize → a single copy-pasteable token: `BSNAP.<base64-json>`.
export function serializeBattle(state: BattleState): string {
  const snap: BattleSnapshot = {
    v: SNAPSHOT_VERSION,
    combatants: state.combatants.map(combatantToSnap),
    zones: state.zones,
    barriers: state.barriers,
    cols: state.cols,
    rows: state.rows,
    mode: state.mode,
    plans: state.plans,
    round: state.round,
    outcome: state.outcome,
    stats: state.stats,
    maxRounds: state.maxRounds,
    collectEvents: state.collectEvents,
  }
  return `${MAGIC}.${b64encode(JSON.stringify(snap))}`
}

// Rebuild a BattleState from a token produced by serializeBattle. Throws on a
// malformed/incompatible token. The result is ready to `advanceRound`.
export function deserializeBattle(token: string): BattleState {
  const trimmed = token.trim()
  const body = trimmed.startsWith(`${MAGIC}.`) ? trimmed.slice(MAGIC.length + 1) : trimmed
  let snap: BattleSnapshot
  try {
    snap = JSON.parse(b64decode(body.trim()))
  } catch {
    throw new Error('Battle snapshot: not a valid token')
  }
  if (snap.v !== SNAPSHOT_VERSION) throw new Error(`Battle snapshot: unsupported version ${snap.v}`)

  const combatants: Combatant[] = snap.combatants.map((cs) => {
    const { tacticRefs, ...rest } = cs
    return { ...rest, tactics: rebuildTactics(cs), trace: [] }
  })

  return {
    combatants,
    zones: snap.zones,
    barriers: snap.barriers,
    cols: snap.cols,
    rows: snap.rows,
    mode: snap.mode,
    plans: snap.plans,
    planner: defaultPlanner,
    round: snap.round,
    outcome: snap.outcome,
    events: [],
    stats: snap.stats,
    maxRounds: snap.maxRounds ?? MAX_ROUNDS,
    collectEvents: snap.collectEvents,
    calculateDamage: defaultCalculateDamage,
  }
}
