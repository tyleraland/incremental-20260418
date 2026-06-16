import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore, getDerivedStats, getInitials, type Unit } from '@/stores/useGameStore'
import { ProtoStage } from './ProtoStage'
import { ProtoLens } from './ProtoLens'
import { useProtoStore } from './protoStore'

// ── Roster sort (ported from the production RosterCarousel) ───────────────────--
type SortMode = 'attention' | 'level' | 'class' | 'name' | 'location'
type SortDir = 'asc' | 'desc'
const SORT_MODES: { id: SortMode; label: string; icon: string; defaultDir: SortDir }[] = [
  { id: 'attention', label: 'To-do', icon: '!', defaultDir: 'asc' },
  { id: 'level',     label: 'Level', icon: '⬆', defaultDir: 'desc' },
  { id: 'class',     label: 'Class', icon: '◆', defaultDir: 'asc' },
  { id: 'name',      label: 'Name',  icon: 'A', defaultDir: 'asc' },
  { id: 'location',  label: 'Area',  icon: '⌖', defaultDir: 'asc' },
]
function sortUnits(units: Unit[], mode: SortMode, dir: SortDir, viewed: Record<string, number>): Unit[] {
  const asc = (a: Unit, b: Unit): number => {
    switch (mode) {
      case 'name':  return a.name.localeCompare(b.name)
      case 'class': return (a.class ?? '').localeCompare(b.class ?? '') || a.name.localeCompare(b.name)
      case 'level': return a.level - b.level
      case 'location': return (a.locationId ?? '~').localeCompare(b.locationId ?? '~') || a.name.localeCompare(b.name)
      case 'attention': {
        const ra = needsAttention(a, viewed) ? 0 : 1, rb = needsAttention(b, viewed) ? 0 : 1
        return (ra - rb) || a.name.localeCompare(b.name)
      }
    }
  }
  const arr = [...units].sort(asc)
  return dir === 'desc' ? arr.reverse() : arr
}

function SortControl({ mode, dir, onPick }: { mode: SortMode; dir: SortDir; onPick: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false)
  const cur = SORT_MODES.find((m) => m.id === mode)!
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Sort roster"
        className="flex items-center gap-1 px-2 h-9 rounded-lg border border-game-border text-game-text-dim hover:text-game-text bg-game-bg/60"
      >
        <span className="text-xs">⇅</span>
        <span className="text-[10px] font-medium">{cur.label}</span>
        <span className="text-[8px]">{dir === 'asc' ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 left-0 w-32 rounded-lg border border-game-border bg-game-surface shadow-xl py-1">
            {SORT_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { onPick(m.id); setOpen(false) }}
                className={['w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
                  m.id === mode ? 'text-game-primary' : 'text-game-text-dim hover:text-game-text hover:bg-white/5'].join(' ')}
              >
                <span className="w-4 text-center">{m.icon}</span>
                <span className="flex-1">{m.label}</span>
                {m.id === mode && <span className="text-[8px]">{dir === 'asc' ? '▲' : '▼'}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Prototype shell ─────────────────────────────────────────────────────────--
//
// A radical re-layout exploration (gated behind ?proto=1): instead of paging
// between Map / Heroes / Inventory, the screen is split so the WORLD is always
// live on one side and a context LENS on the hero is always on the other. The
// roster rail across the top is the shared selector that drives both — pick a
// hero and the world flies to them while their dossier fills the lens.
//
// Mock-grade: it leans on the real store + BattleView, fakes the narrative lens,
// and isn't wired into the tab bar / save format. Purpose is to feel the shape.

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }

function needsAttention(u: Unit, viewed: Record<string, number>): boolean {
  const v = viewed[u.id]
  return u.abilityPoints > 0 || u.skillPoints > 0 || (v !== undefined && u.level > v)
}

function RosterChip({ unit, selected, onSelect }: { unit: Unit; selected: boolean; onSelect: () => void }) {
  const equipment = useGameStore((s) => s.equipment)
  const viewed    = useGameStore((s) => s.viewedUnitLevels)
  const ds = getDerivedStats(unit, equipment)
  const hpPct = Math.min(100, (unit.health / ds.maxHp) * 100)
  const statusColor = unit.recoveryTicksLeft > 0 ? 'bg-purple-500'
    : unit.isResting ? 'bg-sky-500'
    : unit.locationId ? 'bg-game-green'
    : 'bg-game-muted'
  // ring stroke for HP
  const ring = `conic-gradient(${hpPct > 60 ? '#10b981' : hpPct > 30 ? '#f59e0b' : '#ef4444'} ${hpPct}%, #2a2a3a 0)`

  return (
    <button
      onClick={onSelect}
      title={`${unit.name} — Lv ${unit.level} ${unit.class ?? 'Novice'}`}
      className={[
        'relative shrink-0 w-[68px] flex flex-col items-center gap-1 px-1 py-2 rounded-xl border transition-all',
        selected ? 'border-game-primary bg-game-primary/15 ring-2 ring-game-primary/30' : 'border-transparent hover:bg-white/5',
      ].join(' ')}
    >
      <div className="relative w-11 h-11 rounded-full p-[2px]" style={{ background: ring }}>
        <div className="w-full h-full rounded-full bg-game-surface border border-game-border flex items-center justify-center text-lg">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
        <span className={`absolute -bottom-0 -right-0 w-3 h-3 rounded-full border-2 border-game-bg ${statusColor}`} />
        {needsAttention(unit, viewed) && (
          <span className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-game-gold border-2 border-game-bg text-[8px] font-bold text-black flex items-center justify-center">!</span>
        )}
      </div>
      <span className="text-[10px] text-game-text font-medium leading-none truncate w-full text-center">{unit.name.split(' ')[0]}</span>
      <span className="text-[9px] text-game-text-dim leading-none">Lv {unit.level}</span>
    </button>
  )
}

export function ProtoApp() {
  const units            = useGameStore((s) => s.units)
  const locations        = useGameStore((s) => s.locations)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const paused           = useGameStore((s) => s.paused)
  const togglePause      = useGameStore((s) => s.togglePause)
  const ticks            = useGameStore((s) => s.ticks)
  const viewed           = useGameStore((s) => s.viewedUnitLevels)
  const requestZoom      = useProtoStore((s) => s.requestZoom)

  const [sortMode, setSortMode] = useState<SortMode>('attention')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const sortedUnits = useMemo(() => sortUnits(units, sortMode, sortDir, viewed), [units, sortMode, sortDir, viewed])
  function pickSort(m: SortMode) {
    if (m === sortMode) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortMode(m); setSortDir(SORT_MODES.find((x) => x.id === m)!.defaultDir) }
  }

  const deployed = units.filter((u) => u.locationId).length
  const recovering = units.filter((u) => u.recoveryTicksLeft > 0 || u.isResting).length

  // First screen = a battlefield: focus the first location that has a party and
  // fly the stage straight in. (No hero selected → the lens opens on Location.)
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || units.length === 0) return
    const firstParty = locations.find((l) => units.some((u) => u.locationId === l.id))
    const loc = firstParty ?? locations[0]
    if (!loc) return
    didInit.current = true
    useGameStore.setState({ selectedLocationId: loc.id, combatLocationId: loc.id })
    requestZoom(2)
  }, [units, locations, requestZoom])

  function selectHero(u: Unit) {
    // Single-select drives the lens (→ Hero); fly the stage to the hero's
    // battlefield and lock the camera on them so the roster commands the field.
    useGameStore.setState({
      selectedUnitIds: [u.id],
      ...(u.locationId ? { selectedLocationId: u.locationId, battleFollowId: u.id } : {}),
    })
    if (u.locationId) requestZoom(2)
  }

  const proto = new URLSearchParams(window.location.search)
  function exitProto() {
    proto.delete('proto')
    window.location.search = proto.toString()
  }

  return (
    <div className="h-full flex flex-col bg-game-bg overflow-hidden">
      {/* command bar */}
      <header className="shrink-0 flex items-center gap-3 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-bold tracking-[0.2em] text-game-text">TACTICIAN</span>
        <span className="text-[10px] uppercase tracking-widest text-game-secondary bg-game-secondary/10 border border-game-secondary/30 rounded px-1.5 py-0.5">prototype</span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-game-text-dim">
          <span title="Heroes deployed">⚔ {deployed}/{units.length}</span>
          <span title="Recovering / resting">✚ {recovering}</span>
          <span className="tabular-nums" title="Game ticks">⏱ {ticks}</span>
          <button onClick={togglePause} className="px-2 py-0.5 rounded border border-game-border hover:bg-white/5">{paused ? '▶' : '❚❚'}</button>
          <button onClick={exitProto} className="px-2 py-0.5 rounded border border-game-border hover:bg-white/5">exit</button>
        </div>
      </header>

      {/* roster rail — always visible, shared selector + sort */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-game-border bg-game-surface/40">
        <SortControl mode={sortMode} dir={sortDir} onPick={pickSort} />
        <div className="flex items-center gap-1 overflow-x-auto flex-1">
          {sortedUnits.map((u) => (
            <RosterChip key={u.id} unit={u} selected={selectedUnitIds[0] === u.id} onSelect={() => selectHero(u)} />
          ))}
        </div>
      </div>

      {/* split: world/battle stage  |  context lens */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="basis-1/2 md:basis-[58%] min-h-0 border-b md:border-b-0 md:border-r border-game-border">
          <ProtoStage />
        </div>
        <div className="basis-1/2 md:basis-[42%] min-h-0">
          <ProtoLens />
        </div>
      </div>
    </div>
  )
}
