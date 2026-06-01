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
import { zlibSync, unzlibSync, strToU8, strFromU8 } from 'fflate'
import type { BattleState, Combatant, ResolvedTactic, TacticRef } from './types'

const SNAPSHOT_VERSION = 1
const MAGIC = 'BSNAP'   // human-identifiable prefix on the copied string

// Binary ⇄ base64 (browser + jsdom + node; chunked so a big array can't blow the
// call stack via spread). btoa/atob work on Latin-1 byte strings, which is what
// these produce/consume.
function u8ToB64(u8: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK))
  return btoa(s)
}
function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64)
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return u8
}

// A combatant minus its resolved-tactic objects (functions); tactics travel as
// {id, rank} refs and are re-resolved on load.
type CombatantSnap = Omit<Combatant, 'tactics' | 'trace' | 'lastResolution'> & { tacticRefs: TacticRef[] }

function combatantToSnap(c: Combatant): CombatantSnap {
  const { tactics, trace: _trace, lastResolution: _res, ...rest } = c
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

// Serialize → a single copy-pasteable token: `BSNAP.<base64(deflate(json))>`.
// The JSON is dominated by repeated keys/strings (~12 combatants), so DEFLATE
// shrinks the token ~6× — small enough to paste into a bug report. (Legacy
// uncompressed tokens still load — see deserializeBattle.)
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
  return `${MAGIC}.${u8ToB64(zlibSync(strToU8(JSON.stringify(snap))))}`
}

// Rebuild a BattleState from a token produced by serializeBattle. Throws on a
// malformed/incompatible token. The result is ready to `advanceRound`.
export function deserializeBattle(token: string): BattleState {
  const trimmed = token.trim()
  const body = (trimmed.startsWith(`${MAGIC}.`) ? trimmed.slice(MAGIC.length + 1) : trimmed).trim()
  let snap: BattleSnapshot
  try {
    const bytes = b64ToU8(body)
    // Compressed (DEFLATE/zlib) tokens start with the zlib header byte 0x78;
    // legacy uncompressed tokens are raw UTF-8 JSON, starting with '{' (0x7B).
    const json = bytes[0] === 0x78 ? strFromU8(unzlibSync(bytes)) : strFromU8(bytes)
    snap = JSON.parse(json)
  } catch {
    throw new Error('Battle snapshot: not a valid token')
  }
  if (snap.v !== SNAPSHOT_VERSION) throw new Error(`Battle snapshot: unsupported version ${snap.v}`)

  const combatants: Combatant[] = snap.combatants.map((cs) => {
    const { tacticRefs, ...rest } = cs
    // JSON has no Infinity — `JSON.stringify(Infinity)` emits `null`. Encounter
    // units carry `visionRange: Infinity` (no fog-of-war), so restore it here or
    // a reloaded fight would treat them as blind (visionRange null ⇒ sees nothing)
    // and diverge from the original run.
    const visionRange = rest.visionRange == null ? Infinity : rest.visionRange
    // §aggression: legacy tokens predate `provoked` — those monsters were all
    // hostile, so a missing flag defaults to true (don't reload them as passive).
    const provoked = rest.provoked ?? true
    return { ...rest, visionRange, provoked, tactics: rebuildTactics(cs), trace: [], lastResolution: [] }
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
