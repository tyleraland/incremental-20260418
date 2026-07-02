import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import { COMBAT_SKILLS, serializeBattle, STATUS_REGISTRY, skillActiveCap, type BattleState, type Combatant, type StatusEffect } from '@/engine'

// The selected-unit bottom sheet + its tabs (Stats / Debug), split out of
// BattleView so the battlefield renderer stays about *drawing the field*. These
// are inspection surfaces: the unit card, status chips, tactic-resolution
// readout, trace, and the copy-to-share / BSNAP-snapshot buttons.

// Status/channel durations are stored in ENGINE rounds (buildStatus applies
// scaleRounds), and the engine runs one round per tick = TICKS_PER_SECOND engine
// rounds/sec, so dividing a duration by that yields real seconds.
const ROUNDS_PER_SEC = 5

const skillName = (id: string) => COMBAT_SKILLS[id]?.(1)?.name ?? 'Casting'

function hpColor(ratio: number): string {
  if (ratio >= 0.75) return 'bg-emerald-500'
  if (ratio >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

// Resolve a combatant id to a display name within a battle.
function nameInBattle(battle: BattleState, id: string | null | undefined): string {
  if (!id) return '—'
  return battle.combatants.find((x) => x.id === id)?.name ?? id
}

// Name + how far the referenced target is from `c`, flagged when it sits beyond
// `c`'s vision. Surfaces the "locked onto something I can't see" case at a glance
// — a stale far lock keeps a unit "engaged", which pins the team waypoint and can
// freeze the party in place. (Infinity vision in encounters never flags.)
function targetSight(battle: BattleState, c: Combatant, id: string | null | undefined): { text: string; beyond: boolean } {
  if (!id) return { text: '—', beyond: false }
  const t = battle.combatants.find((x) => x.id === id)
  if (!t) return { text: id, beyond: false }
  const d = Math.hypot(c.pos.x - t.pos.x, c.pos.y - t.pos.y)
  const beyond = d > c.visionRange
  return { text: `${t.name} @${d.toFixed(0)}${beyond ? ' ⚠out-of-sight' : ''}`, beyond }
}

// A plain-text dump of a unit's current decision state + last 15 turns, for
// pasting into a bug report. Mirrors what the Debug tab shows.
function buildDebugText(c: Combatant, battle: BattleState): string {
  const plan = battle.plans[c.team]
  const wp = plan?.waypoint
  const L: string[] = []
  L.push(`# ${c.name} (${c.team}${c.alive ? '' : ' · KO'}) — battle round ${battle.round}`)
  L.push(`hp ${Math.ceil(c.hp)}/${c.maxHp}  pos (${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)})  vision ${c.visionRange === Infinity ? '∞' : c.visionRange}`)
  L.push(`lock: ${targetSight(battle, c, c.lockedTargetId).text}  team-focus: ${nameInBattle(battle, plan?.focusTargetId)}  hunt: ${nameInBattle(battle, plan?.huntTargetId)}  waypoint: ${wp ? `(${wp.x.toFixed(0)},${wp.y.toFixed(0)})` : '—'}`)
  L.push(`tactics: ${c.tactics.map((t) => `${t.def.channel}:${t.def.name}`).join(', ') || '(none)'}`)
  if (c.lastResolution.length) {
    L.push('-- tactic resolution (most recent turn) --')
    for (const r of c.lastResolution) L.push(`  ${r.channel}:${r.name} → ${r.outcome}`)
  }
  if (c.statuses.length) L.push(`statuses: ${c.statuses.map((s) => `${s.name}(${s.duration})`).join(', ')}`)
  if (c.channel) L.push(`channeling: ${c.channel.skillId} (${c.channel.roundsLeft} left)`)
  L.push(`-- last ${Math.min(15, c.trace.length)} turns (newest first) --`)
  for (const e of c.trace.slice().reverse().slice(0, 15)) L.push(`R${e.round}: ${e.text}`)
  return L.join('\n')
}

// Per-category chip tone for status effects (buff / control / debuff).
function statusTone(s: StatusEffect): string {
  return s.category === 'buff' ? 'border-emerald-500/50 text-emerald-200'
    : s.category === 'control' ? 'border-amber-500/50 text-amber-200'
    : 'border-red-500/50 text-red-200'
}
const statusIcon = (s: StatusEffect): string => STATUS_REGISTRY[s.id]?.icon ?? '✦'
const roundsToSecs = (rounds: number): string => `${(rounds / ROUNDS_PER_SEC).toFixed(1)}s`

// Human-readable breakdown of what a status does, derived from its own fields so
// it stays correct for any status the engine builds.
function statusEffectLines(s: StatusEffect): string[] {
  const out: string[] = []
  const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n} ${unit}`
  const m = s.statModifiers
  if (m.str) out.push(signed(m.str, 'STR'))
  if (m.def) out.push(signed(m.def, 'DEF'))
  if (m.int) out.push(signed(m.int, 'INT'))
  if (m.spd) out.push(signed(m.spd, 'SPD'))
  if (m.acc) out.push(signed(m.acc, 'hit'))
  if (m.moveSpeed) out.push(signed(m.moveSpeed, 'move'))
  if (m.moveSpeedMult != null && m.moveSpeedMult !== 1) out.push(`${Math.round(m.moveSpeedMult * 100)}% move speed`)
  if (s.dotDamage) out.push(`${s.dotDamage} damage/round`)
  if (s.damageTakenMult != null && s.damageTakenMult !== 1) out.push(`${Math.round(s.damageTakenMult * 100)}% damage taken`)
  if (s.flags.includes('stunned')) out.push('Skips its turn')
  if (s.flags.includes('rooted')) out.push("Can't move")
  if (s.flags.includes('frozen')) out.push('Skips its turn; armor counts as water')
  if (s.flags.includes('stealthed')) out.push('Hidden from enemies')
  return out
}

// Tappable status chips with a per-status detail drawer (effects + time left).
// Tapping a chip toggles its detail; tapping again (or another chip) closes it.
export function StatusList({ statuses }: { statuses: StatusEffect[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const sel = open != null ? statuses[open] : null
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {statuses.map((s, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            title={`${s.name} — tap for details`}
            aria-label={s.name}
            className={`w-8 h-8 rounded-xl bg-game-bg border flex items-center justify-center text-sm ${statusTone(s)} ${open === i ? 'ring-1 ring-game-primary' : ''}`}
          >
            <span aria-hidden>{statusIcon(s)}</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="mt-1 rounded border border-game-border bg-game-bg/60 p-1.5 text-[10px] space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-game-text">{statusIcon(sel)} {sel.name}</span>
            <span className="text-game-text-dim capitalize">{sel.category ?? 'effect'}</span>
          </div>
          {STATUS_REGISTRY[sel.id]?.description && (
            <div className="text-game-text-dim">{STATUS_REGISTRY[sel.id]!.description}</div>
          )}
          <div className="text-game-text-dim tabular-nums">
            {sel.duration} round{sel.duration === 1 ? '' : 's'} left (~{roundsToSecs(sel.duration)})
          </div>
          {statusEffectLines(sel).length > 0 && (
            <ul className="text-game-text-dim list-disc list-inside">
              {statusEffectLines(sel).map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function StatsTab({ c, battle, battleOnly = false }: { c: Combatant; battle: BattleState; battleOnly?: boolean }) {
  const ratio = Math.max(0, c.hp / c.maxHp)
  return (
    <>
      {!battleOnly && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-black/50 overflow-hidden">
            <div className={`h-full ${hpColor(ratio)}`} style={{ width: `${ratio * 100}%`, transition: 'width 380ms linear' }} />
          </div>
          <div className="text-game-text-dim tabular-nums">{Math.ceil(c.hp)}/{c.maxHp}</div>
        </div>
      )}
      {!battleOnly && (
        <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-game-text-dim">
          <div>STR <span className="text-game-text tabular-nums">{c.str}</span></div>
          <div>DEF <span className="text-game-text tabular-nums">{c.def}</span></div>
          <div>INT <span className="text-game-text tabular-nums">{c.int}</span></div>
          <div>SPD <span className="text-game-text tabular-nums">{c.spd}</span></div>
        </div>
      )}
      {c.skills.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] text-game-text-dim mb-1">Skills</div>
          <div className="space-y-0.5">
            {c.skills.map((s) => {
              const scale = battle.timeScale || 1
              const left = c.skillCooldowns[s.id] ?? 0
              const ready = left <= 0
              // skillCooldowns are stored in engine rounds (cooldown × timeScale);
              // scale the denominator and the readout back to logical rounds.
              const frac = ready ? 1 : 1 - left / Math.max(1, s.cooldown * scale)
              // Skills capped to N simultaneous effects (Firewall walls, Agility
              // buff) show how many are active out of the max next to the name.
              const cap = skillActiveCap(battle, c, s)
              return (
                <div key={s.id} className="flex items-center gap-2 text-[10px]">
                  <div className="flex-1 truncate">
                    {s.name}
                    {cap && <span className={`ml-1 tabular-nums ${cap.active >= cap.max ? 'text-amber-400' : 'text-game-text-dim'}`}>({cap.active}/{cap.max})</span>}
                  </div>
                  <div className="w-20 h-1 rounded-sm bg-black/50 overflow-hidden">
                    <div className={`h-full ${ready ? 'bg-emerald-400' : 'bg-sky-500/80'}`} style={{ width: `${frac * 100}%`, transition: 'width 150ms linear' }} />
                  </div>
                  <div className="w-6 text-right tabular-nums text-game-text-dim">{ready ? 'rdy' : Math.ceil(left / scale)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {c.statuses.length > 0 && <div className="mt-2"><StatusList statuses={c.statuses} /></div>}
      {c.channel && (
        <div className="mt-2 text-[10px] text-amber-300">
          ✦ Casting {skillName(c.channel.skillId)} — {c.channel.roundsLeft} round{c.channel.roundsLeft === 1 ? '' : 's'} left
        </div>
      )}
    </>
  )
}

// Debug tab: the team blackboard, this unit's tactic resolution (flagging
// channels with competing priorities), and the last-15-turns trace. Built so a
// developer — or you, pasting the copied block into chat — can see exactly what
// the unit was deciding and why.
// How each tactic resolved last turn → dot, colour, and a one-word reason. Drives
// the "active now" readout: green ● for what fired, muted/amber ○ for the dormant.
const OUTCOME_META: Record<string, { dot: string; cls: string; note: string }> = {
  fired:    { dot: '●', cls: 'text-game-green', note: 'active' },
  idle:     { dot: '○', cls: 'text-game-muted', note: 'condition not met' },
  starved:  { dot: '○', cls: 'text-amber-300',  note: 'lower priority' },
  cooldown: { dot: '○', cls: 'text-game-muted', note: 'on cooldown' },
}
const DEBUG_CHANNEL_ORDER = ['targeting', 'movement', 'action', 'reaction', 'passive'] as const

export function DebugTab({ c, battle }: { c: Combatant; battle: BattleState }) {
  // §debug level tools (players only): grant a level / reset to a clean level-1.
  const debugLevelUp    = useGameStore((s) => s.debugLevelUp)
  const debugResetLevel = useGameStore((s) => s.debugResetLevel)
  const unit            = useGameStore((s) => s.units.find((u) => u.id === c.id))
  const plan = battle.plans[c.team]
  const wp = plan?.waypoint
  const lock = targetSight(battle, c, c.lockedTargetId)
  const focusName = nameInBattle(battle, plan?.focusTargetId)
  const huntName = nameInBattle(battle, plan?.huntTargetId)
  const divergent = c.lockedTargetId && plan?.focusTargetId && c.lockedTargetId !== plan.focusTargetId

  // Per-turn resolution (what fired vs why the rest were dormant), keyed by id.
  const resById = new Map(c.lastResolution.map((r) => [r.id, r.outcome]))
  const stepped = c.trace.length > 0   // has this unit taken a turn yet?
  // Group equipped tactics by channel in a fixed evaluation order.
  const groups = DEBUG_CHANNEL_ORDER
    .map((ch) => [ch, c.tactics.filter((t) => t.def.channel === ch)] as const)
    .filter(([, list]) => list.length > 0)
  const recent = c.trace.slice().reverse().slice(0, 15)

  return (
    <div className="mt-2 space-y-2 text-[10px]">
      {/* Blackboard */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">Blackboard · {c.team}</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-game-text-dim">
          {/* Logical round is the player-meaningful unit (one "round" of combat); the
              engine sub-steps it timeScale× for smooth motion, so show the logical
              count as the headline and the raw engine round (what the trace logs)
              muted alongside — they used to read as two different numbers. */}
          <div>round <span className="text-game-text tabular-nums">{Math.floor(battle.round / battle.timeScale)}</span> <span className="text-game-muted tabular-nums">· engine R{battle.round}</span></div>
          <div>mood <span className={c.provoked ? 'text-game-text' : 'text-amber-300'}>{c.provoked ? 'hostile' : 'passive (until hit/called)'}</span></div>
          <div>pos <span className="text-game-text tabular-nums">({c.pos.x.toFixed(1)},{c.pos.y.toFixed(1)})</span></div>
          <div>lock <span className={!c.lockedTargetId ? 'text-game-muted' : lock.beyond ? 'text-amber-300' : 'text-game-text'}>{lock.text}</span></div>
          <div>team-focus <span className={plan?.focusTargetId ? 'text-game-text' : 'text-game-muted'}>{focusName}</span></div>
          <div>hunt <span className={plan?.huntTargetId ? 'text-game-text' : 'text-game-muted'}>{huntName}</span></div>
          <div>waypoint <span className="text-game-text tabular-nums">{wp ? `(${wp.x.toFixed(0)},${wp.y.toFixed(0)})` : '—'}</span></div>
        </div>
        {lock.beyond && <div className="mt-1 text-amber-300">⚠ locked target is out of sight (it can't be reached/hit — a stale far lock keeps this unit "engaged")</div>}
        {divergent && <div className="mt-1 text-amber-300">⚠ this unit's lock ≠ team focus</div>}
      </div>

      {/* Tactic resolution — what's active now, and why the rest are dormant */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">
          Tactics {stepped ? `· resolved R${battle.round}` : '· priority order'}
        </div>
        {groups.length === 0 && <div className="text-game-muted">no tactics equipped</div>}
        {groups.map(([ch, list]) => (
          <div key={ch} className="flex items-start gap-1.5 leading-tight mb-0.5">
            <span className="shrink-0 w-16 text-game-text-dim">{ch}</span>
            <span className="flex-1 space-y-0.5">
              {list.map((t) => {
                const outcome = resById.get(t.def.id)
                const isPassive = t.def.channel === 'passive'
                // a channelled tactic with no fn of its own (e.g. a pure modifier) = always-on
                const isModifier = !isPassive && !(t.def as unknown as Record<string, unknown>)[t.def.channel]
                const meta = outcome ? OUTCOME_META[outcome]
                  : isPassive  ? { dot: '●', cls: 'text-violet-400', note: 'passive' }
                  : isModifier ? { dot: '●', cls: 'text-game-green', note: 'modifier' }
                  : stepped    ? { dot: '·', cls: 'text-game-muted', note: 'not evaluated' }
                  : { dot: '·', cls: 'text-game-text-dim', note: '' }
                const lit = outcome === 'fired' || isPassive || isModifier
                return (
                  <div key={t.def.id} className="flex items-center gap-1">
                    <span className={meta.cls}>{meta.dot}</span>
                    <span className={lit ? 'text-game-text' : 'text-game-text-dim'}>{t.def.name}</span>
                    <span className="text-game-muted">·r{t.rank}</span>
                    {meta.note && <span className={`ml-auto ${meta.cls}`}>{meta.note}</span>}
                  </div>
                )
              })}
            </span>
          </div>
        ))}
      </div>

      {/* Recent trace */}
      <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
        <div className="text-game-text-dim uppercase tracking-wide mb-1">Recent (last {recent.length}, newest first)</div>
        {recent.length === 0 && <div className="text-game-muted">no actions yet</div>}
        <div className="space-y-0.5 font-mono text-[9.5px] leading-tight max-h-32 overflow-y-auto">
          {recent.map((e, i) => (
            <div key={i} className="text-game-text-dim"><span className="text-game-muted">R{e.round}</span> {e.text}</div>
          ))}
        </div>
      </div>

      {/* Pack / logistics — players only. Shows each carried consumable's store carry
          (count/target) beside the engine's LIVE count, plus the travel behaviour, so a
          reconcile/restock divergence (the town buy→wipe loop) is visible at a glance.
          Potion USE shows in the Recent trace above ("use …"); the hunt/return status +
          loadout live in the Logistics tab. */}
      {c.team === 'player' && unit && (unit.pack?.length ?? 0) > 0 && (
        <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-game-text-dim uppercase tracking-wide">Pack</span>
            <span className="text-game-muted">travel: {unit.travelEngage ?? 'retaliate'}</span>
          </div>
          <div className="space-y-0.5">
            {unit.pack!.map((pi) => {
              const live = c.pack[pi.itemId] ?? 0
              const diverged = live !== pi.count
              return (
                <div key={pi.itemId} className="flex items-center justify-between">
                  <span className="text-game-text-dim">{pi.itemId}</span>
                  <span className={`tabular-nums ${diverged ? 'text-amber-300' : 'text-game-text'}`}>
                    carry {pi.count}{pi.target != null ? `/${pi.target}` : ''} · live {live}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Level tools (dev/testing) — players only, at the bottom of the tab. Level
          Up grants exactly enough exp for one level; Reset Level wipes to a clean
          level-1 slate (abilities included) for testing level-scaled behaviour
          like attack speed. */}
      {c.team === 'player' && unit && (
        <div className="rounded border border-game-border bg-game-bg/60 p-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-game-text-dim uppercase tracking-wide">Level tools</span>
            <span className="text-game-muted tabular-nums">Lv {unit.level} · {Math.floor(unit.exp)}/{unit.expToNext} xp</span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => debugLevelUp(unit.id)}
              className="flex-1 py-1.5 rounded text-[11px] font-semibold border border-game-primary/50 bg-game-primary/20 text-game-primary hover:bg-game-primary/30 active:scale-95 transition-colors"
            >Level Up</button>
            <button
              onClick={() => debugResetLevel(unit.id)}
              className="flex-1 py-1.5 rounded text-[11px] font-semibold border border-red-500/50 bg-red-500/15 text-red-400 hover:bg-red-500/25 active:scale-95 transition-colors"
            >Reset Level</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Selected-unit detail as a dismissable bottom-sheet overlay. Floats over the
// arena so the board keeps its full height regardless of screen size. Two tabs:
// Stats (the card) and Debug (blackboard + tactics + trace, with copy-to-share).
export function UnitDetailOverlay({ c, battle, onClose, onFollow, initialTab = 'stats' }: { c: Combatant; battle: BattleState; onClose: () => void; onFollow?: (unitId: string) => void; initialTab?: 'stats' | 'debug' }) {
  const isPlayer = c.team === 'player'
  const [tab, setTab] = useState<'stats' | 'debug'>(initialTab)
  const [copied, setCopied] = useState(false)
  const [snapCopied, setSnapCopied] = useState(false)

  const copy = () => {
    const text = buildDebugText(c, battle)
    try { navigator.clipboard?.writeText(text) } catch { /* clipboard unavailable */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  // Copy a 1:1 BSNAP token of the whole battle (bug reports / `npm run bsnap`
  // replay). Lives here in the unit debug menu so the battlefield stays clean.
  const copySnapshot = () => {
    try { navigator.clipboard?.writeText(serializeBattle(battle)) } catch { /* clipboard unavailable */ }
    setSnapCopied(true)
    setTimeout(() => setSnapCopied(false), 1200)
  }

  return createPortal(
    <>
      {/* A full bottom-half panel that reads as its OWN screen — covering the lens
          tabs beneath — so it's clearly separate from those decision surfaces.
          No backdrop catcher, so the roster + stage above stay live: tapping a
          roster hero both selects them AND dismisses this card (via closeNonce). */}
      <div className="fixed inset-x-0 bottom-0 top-1/2 z-50 flex flex-col rounded-t-2xl border-t border-game-border bg-game-surface shadow-2xl">
        <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-game-border shrink-0" />
        <div className="px-4 pb-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className={`font-semibold text-base truncate ${isPlayer ? 'text-blue-200' : 'text-red-200'}`}>{c.name}</div>
            <div className="flex items-center gap-2 shrink-0">
              {isPlayer && onFollow && (
                <button
                  onClick={() => { onFollow(c.id); onClose() }}
                  title="Select this hero in the roster and lock the camera onto them"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-game-accent/60 bg-game-accent/15 text-game-accent text-[11px] font-semibold hover:bg-game-accent/25 transition-colors"
                >🎥 Follow</button>
              )}
              <div className="text-[10px] text-game-text-dim uppercase tracking-wide">{c.team}{c.alive ? '' : ' · KO'}</div>
              <button onClick={onClose} aria-label="Close unit detail" className="w-6 h-6 flex items-center justify-center rounded border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1">
            <button onClick={() => setTab('stats')} className={`px-2 py-0.5 rounded text-[10px] border ${tab === 'stats' ? 'border-game-primary bg-game-primary/20 text-game-text' : 'border-game-border text-game-text-dim hover:bg-white/5'}`}>Stats</button>
            <button onClick={() => setTab('debug')} className={`px-2 py-0.5 rounded text-[10px] border ${tab === 'debug' ? 'border-game-primary bg-game-primary/20 text-game-text' : 'border-game-border text-game-text-dim hover:bg-white/5'}`}>Debug</button>
            {tab === 'debug' && (
              <div className="ml-auto flex items-center gap-1">
                <button onClick={copySnapshot} title="Copy a 1:1 snapshot of this battle's state (bug reports / npm run bsnap replay)" className="px-2 py-0.5 rounded text-[10px] border border-game-border text-game-text-dim hover:bg-white/5" aria-label="Copy battle state snapshot">
                  {snapCopied ? '✓ state copied' : '⎘ battle state'}
                </button>
                <button onClick={copy} className="px-2 py-0.5 rounded text-[10px] border border-game-border text-game-text-dim hover:bg-white/5" aria-label="Copy debug info">
                  {copied ? '✓ copied' : '⧉ copy last 15'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs">
          {tab === 'stats' ? <StatsTab c={c} battle={battle} /> : <DebugTab c={c} battle={battle} />}
        </div>
      </div>
    </>,
    document.body,
  )
}
