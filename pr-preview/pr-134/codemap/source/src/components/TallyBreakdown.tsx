import type { CombatTally } from '@/types'
import { ELEMENT_LABELS, ELEMENT_COLORS, type Element } from '@/lib/elements'
import { TICKS_PER_SECOND } from '@/lib/time'

// Compact number: 1234 → "1.2k", 2_500_000 → "2.5M".
export function fmt(n: number): string {
  if (!isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (abs >= 100)       return Math.round(n).toString()
  if (abs >= 10)        return (Math.round(n * 10) / 10).toString()
  return (Math.round(n * 100) / 100).toString()
}

function hasAny(t: CombatTally): boolean {
  return t.damageDealt > 0 || t.damageTaken > 0 || t.healingDone > 0 ||
    t.monstersDefeated > 0 || t.hits > 0 || t.misses > 0 || t.dodges > 0 ||
    t.expGained > 0 || t.levelsGained > 0
}

function Cell({ label, value, color = 'text-game-text' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-game-border bg-game-bg/40 px-2 py-2 text-center">
      <div className={`font-mono text-base leading-none ${color}`}>{value}</div>
      <div className="text-[10px] text-game-text-dim mt-1">{label}</div>
    </div>
  )
}

// One element's slice of a damage breakdown: a coloured element chip, the raw
// amount, and a proportional bar against the breakdown's largest entry.
function ElementRow({ el, value, max }: { el: string; value: number; max: number }) {
  const label = ELEMENT_LABELS[el as Element] ?? el
  const chip  = ELEMENT_COLORS[el as Element] ?? 'bg-gray-800 text-gray-300 border-gray-600/50'
  const pct   = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 w-16 text-center ${chip}`}>{label}</span>
      <div className="flex-1 h-2 rounded bg-game-bg overflow-hidden">
        <div className="h-full bg-game-primary/60 rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-game-text-dim w-12 text-right shrink-0">{fmt(value)}</span>
    </div>
  )
}

function ElementBreakdown({ title, map }: { title: string; map: Record<string, number> }) {
  const rows = Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return null
  const max = rows[0][1]
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">{title}</div>
      <div className="space-y-1">
        {rows.map(([el, v]) => <ElementRow key={el} el={el} value={v} max={max} />)}
      </div>
    </div>
  )
}

// Effectiveness of the unit's *outgoing* damage (how the element matrix landed).
function EffectivenessRow({ eff }: { eff: CombatTally['effDealt'] }) {
  const parts: { label: string; n: number; color: string }[] = [
    { label: 'Super-effective', n: eff.effective, color: 'text-game-green' },
    { label: 'Neutral',         n: eff.neutral,   color: 'text-game-text-dim' },
    { label: 'Resisted',        n: eff.resisted,  color: 'text-game-gold' },
    { label: 'Immune',          n: eff.immune,    color: 'text-rose-400' },
  ].filter((p) => p.n > 0)
  if (parts.length === 0) return null
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Effectiveness (hits dealt)</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.label} className="text-xs">
            <span className={`font-mono ${p.color}`}>{fmt(p.n)}</span>
            <span className="text-game-text-dim ml-1">{p.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// The full per-hero battle-report breakdown for one tally (a hero's lifetime, a
// time-window, an AFK span, or a hero's slice of a location). Reused by the
// Reports tab, the per-unit report sheet, the location report, and the AFK modal.
export function TallyBreakdown({ tally, dense = false }: { tally: CombatTally; dense?: boolean }) {
  if (!hasAny(tally)) {
    return <div className="text-xs text-game-muted italic py-2">No combat recorded in this window.</div>
  }
  const swings   = tally.hits + tally.misses
  const accuracy = swings > 0 ? Math.round((tally.hits / swings) * 100) : null
  const secs     = tally.combatTicks / TICKS_PER_SECOND
  const dps      = secs > 0 ? tally.damageDealt / secs : 0

  return (
    <div className="space-y-3">
      <div className={`grid ${dense ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5`}>
        <Cell label="Kills"      value={fmt(tally.monstersDefeated)} color="text-game-primary" />
        <Cell label="Dmg dealt"  value={fmt(tally.damageDealt)} />
        <Cell label="Dmg taken"  value={fmt(tally.damageTaken)} color="text-rose-400" />
        <Cell label="Hits"       value={fmt(tally.hits)} />
        <Cell label="Misses"     value={fmt(tally.misses)} />
        <Cell label="Dodges"     value={fmt(tally.dodges)} />
        {accuracy !== null && <Cell label="Accuracy" value={`${accuracy}%`} />}
        {tally.spellDamageDealt > 0 && <Cell label="Spell dmg" value={fmt(tally.spellDamageDealt)} color="text-game-secondary" />}
        {tally.healingDone > 0 && <Cell label="Healing" value={fmt(tally.healingDone)} color="text-game-green" />}
        {dps > 0 && <Cell label="DPS" value={fmt(dps)} />}
        {tally.expGained > 0 && <Cell label="XP" value={fmt(Math.floor(tally.expGained))} color="text-game-green" />}
        {tally.levelsGained > 0 && <Cell label="Levels" value={`+${tally.levelsGained}`} color="text-game-gold" />}
      </div>

      <ElementBreakdown title="Damage dealt · by element" map={tally.dmgDealtByElement} />
      <ElementBreakdown title="Damage taken · by element" map={tally.dmgTakenByElement} />
      <EffectivenessRow eff={tally.effDealt} />
    </div>
  )
}
