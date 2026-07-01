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
import { makeConsumableTactic, CONSUMABLE_TACTIC_PREFIX } from './consumables'
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

// FNV-1a 32-bit over the base64 body — a tiny, dependency-free integrity tag.
// Appended to the token (`…<body>.<len>x<hash>`) so a truncated/mangled paste —
// the #1 way these long strings break in transit — fails LOUDLY with "re-copy it"
// instead of a vague decode error. Outside the compressed payload (truncation
// kills the deflate stream before it can be read).
function bodyTag(body: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
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
    } else if (ref.id.startsWith(CONSUMABLE_TACTIC_PREFIX)) {
      // §consumables: rebuilt from the combatant's own serialized specs (the
      // player's allow-list), not a global registry — same approach as skills.
      const itemId = ref.id.slice(CONSUMABLE_TACTIC_PREFIX.length)
      const spec = (snap.consumableSpecs ?? []).find((s) => s.itemId === itemId)
      if (spec) out.push({ def: makeConsumableTactic(spec), rank: ref.rank })
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
  firewalls: BattleState['firewalls']
  barriers: BattleState['barriers']
  cols: number
  rows: number
  timeScale?: number
  decisionInterval?: number
  multiAttackMax?: number
  mode: BattleState['mode']
  plans: BattleState['plans']
  round: number
  outcome: BattleState['outcome']
  stats: BattleState['stats']
  maxRounds: number
  collectEvents: boolean
}

// Serialize → a single copy-pasteable token: `BSNAP.<base64(deflate(json))>`.
// The JSON is dominated by repeated keys/strings (often dozens of combatants in
// open-world), so DEFLATE
// shrinks the token ~6× — small enough to paste into a bug report. (Legacy
// uncompressed tokens still load — see deserializeBattle.)
export function serializeBattle(state: BattleState): string {
  const snap: BattleSnapshot = {
    v: SNAPSHOT_VERSION,
    combatants: state.combatants.map(combatantToSnap),
    zones: state.zones,
    firewalls: state.firewalls,
    barriers: state.barriers,
    cols: state.cols,
    rows: state.rows,
    timeScale: state.timeScale,
    // §multi-attack: serialize ONLY when enabled (>1), unlike the motion-only
    // decisionInterval — it changes combat outcome (extra hits), so a live battle
    // with it on must replay 1:1. Omitting it when disabled keeps every existing
    // token byte-identical (absent → defaults to 1 on load).
    ...(state.multiAttackMax > 1 ? { multiAttackMax: state.multiAttackMax } : {}),
    // decisionInterval intentionally NOT serialized (prototype): keeps tokens
    // byte-identical; a restored battle defaults to 1 (re-decide every round).
    // peaceful intentionally NOT serialized (like decisionInterval): keeps tokens
    // byte-identical. It's a property of the *location* (a city), so the host
    // re-applies it from the location each tick; a restored battle defaults false.
    mode: state.mode,
    plans: state.plans,
    round: state.round,
    outcome: state.outcome,
    stats: state.stats,
    maxRounds: state.maxRounds,
    collectEvents: state.collectEvents,
  }
  const body = u8ToB64(zlibSync(strToU8(JSON.stringify(snap))))
  // …<body>.<len>x<hash> — the trailing guard lets deserialize detect a clipped
  // or mangled paste. Base64 never contains '.', so the suffix parses cleanly.
  return `${MAGIC}.${body}.${body.length.toString(36)}x${bodyTag(body).toString(36)}`
}

// Rebuild a BattleState from a token produced by serializeBattle. Throws on a
// malformed/incompatible token. The result is ready to `advanceRound`.
export function deserializeBattle(token: string): BattleState {
  const trimmed = token.trim()
  let rest = trimmed.startsWith(`${MAGIC}.`) ? trimmed.slice(MAGIC.length + 1) : trimmed
  // Pull off the integrity guard (`…<body>.<len>x<hash>`) if present, then strip
  // any whitespace a paste may have line-wrapped in (the base64 body has none).
  let guard: { len: number; hash: string } | null = null
  const lastDot = rest.lastIndexOf('.')
  if (lastDot > 0) {
    const m = /^([0-9a-z]+)x([0-9a-z]+)$/.exec(rest.slice(lastDot + 1))
    if (m) { guard = { len: parseInt(m[1], 36), hash: m[2] }; rest = rest.slice(0, lastDot) }
  }
  const body = rest.replace(/\s+/g, '')
  if (guard) {
    if (body.length < guard.len) {
      throw new Error(`Battle snapshot: token looks truncated (${body.length} of ${guard.len} chars) — re-copy the whole string`)
    }
    // Any length mismatch (short OR long — appended/garbled paste) or hash mismatch
    // is corruption; only an exact-length, exact-hash body is trusted.
    if (body.length !== guard.len || bodyTag(body).toString(36) !== guard.hash) {
      throw new Error('Battle snapshot: token looks corrupted (checksum mismatch) — re-copy it')
    }
  }
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
    const magicDef = rest.magicDef ?? 0   // legacy tokens predate magic defense
    // §threat / §passive — legacy tokens predate these; default to no threat
    // table, neutral threat multiplier, and no armor/dodge passive.
    const threat = rest.threat ?? {}
    const threatMult = rest.threatMult ?? 1
    const armorReduction = rest.armorReduction ?? 0
    const dodgePeriod = rest.dodgePeriod ?? null
    const escapeDir = rest.escapeDir ?? null   // legacy tokens predate kite-heading hysteresis
    // §minions — legacy tokens predate owned/summoned units; default to "not a minion".
    const ownerId = rest.ownerId ?? null
    const leashRange = rest.leashRange ?? null
    const summonTtl = rest.summonTtl ?? null
    const summonTag = rest.summonTag ?? null
    // §consumables: legacy tokens predate carried items — empty pack (use-item
    // tactics never fire) and empty specs, so the replay is identical to before.
    const pack = rest.pack ?? {}
    const consumableSpecs = rest.consumableSpecs ?? []
    return { ...rest, visionRange, provoked, magicDef, threat, threatMult, armorReduction, dodgePeriod, escapeDir, ownerId, leashRange, summonTtl, summonTag, pack, consumableSpecs, tactics: rebuildTactics(cs), trace: [], lastResolution: [] }
  })

  return {
    combatants,
    zones: snap.zones,
    firewalls: snap.firewalls ?? [],   // legacy tokens predate firewalls
    barriers: snap.barriers,
    cols: snap.cols,
    rows: snap.rows,
    timeScale: snap.timeScale ?? 1,   // legacy tokens predate finer rounds
    decisionInterval: snap.decisionInterval ?? 1,   // legacy tokens predate decision throttling
    multiAttackMax: snap.multiAttackMax ?? 1,   // absent / legacy tokens → disabled (single swing)
    mode: snap.mode,
    peaceful: false,   // not serialized; the host re-applies it from the location (see serializeBattle)
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
