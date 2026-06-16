import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, getDerivedStats, getInitials, type Unit } from '@/stores/useGameStore'
import { ProtoStage } from './ProtoStage'
import { ProtoLens } from './ProtoLens'
import { useProtoStore } from './protoStore'
import { Guild } from '@/pages/Guild'
import { Reports } from '@/pages/Reports'
import { Time } from '@/pages/Time'

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

// Grouped roster: area / class / to-do bucket heroes; name/level stay flat. Each
// group renders in a light container so same-area (etc.) heroes read as a set.
interface RGroup { key: string; label: string | null; icon: string; units: Unit[]; locId?: string | null }
function groupRoster(units: Unit[], mode: SortMode, dir: SortDir, viewed: Record<string, number>, locations: { id: string; name: string }[]): RGroup[] {
  const byName = (a: Unit, b: Unit) => a.name.localeCompare(b.name)
  const bucket = () => new Map<string, Unit[]>()
  const push = (m: Map<string, Unit[]>, k: string, u: Unit) => { const a = m.get(k); if (a) a.push(u); else m.set(k, [u]) }
  const flip = (g: RGroup[]) => (dir === 'desc' ? g.reverse() : g)

  if (mode === 'location') {
    const m = bucket(); for (const u of units) push(m, u.locationId ?? '__none__', u)
    const out: RGroup[] = []
    for (const l of locations) { const a = m.get(l.id); if (a) out.push({ key: l.id, label: l.name, icon: '⌖', units: a.sort(byName), locId: l.id }) }
    const none = m.get('__none__'); if (none) out.push({ key: '__none__', label: 'Guild', icon: '⌂', units: none.sort(byName), locId: null })
    return flip(out)
  }
  if (mode === 'class') {
    const m = bucket(); for (const u of units) push(m, u.class ?? 'Novice', u)
    return flip([...m.keys()].sort().map((k) => ({ key: k, label: k, icon: CLASS_ICON[k] ?? '◆', units: m.get(k)!.sort(byName) })))
  }
  if (mode === 'attention') {
    const todo = units.filter((u) => needsAttention(u, viewed)).sort(byName)
    const ready = units.filter((u) => !needsAttention(u, viewed)).sort(byName)
    const out: RGroup[] = []
    if (todo.length) out.push({ key: 'todo', label: 'To-do', icon: '!', units: todo })
    if (ready.length) out.push({ key: 'ready', label: 'Ready', icon: '✓', units: ready })
    return flip(out)
  }
  return [{ key: 'all', label: null, icon: '', units: sortUnits(units, mode, dir, viewed) }]
}

function SortControl({ mode, dir, onPick }: { mode: SortMode; dir: SortDir; onPick: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false)
  const cur = SORT_MODES.find((m) => m.id === mode)!
  return (
    <div className="relative shrink-0">
      {/* compact icon-only trigger — keeps horizontal room for the roster */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Sort: ${cur.label} ${dir === 'asc' ? '▲' : '▼'}`}
        aria-label="Sort roster"
        className="flex flex-col items-center justify-center w-8 h-10 rounded-lg border border-game-border text-game-text-dim hover:text-game-text bg-game-bg/60"
      >
        <span className="text-xs leading-none">⇅</span>
        <span className="text-[8px] leading-none mt-0.5">{cur.icon}{dir === 'asc' ? '▲' : '▼'}</span>
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

function RosterChip({ unit, selected, here, onSelect, onFocus }: { unit: Unit; selected: boolean; here: boolean; onSelect: () => void; onFocus: () => void }) {
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
  // Single tap = quiet select; double tap (within 300ms) = focus (fly camera).
  const lastTap = useRef(0)
  function tap() {
    const now = Date.now()
    if (now - lastTap.current < 300) { lastTap.current = 0; onFocus(); return }
    lastTap.current = now; onSelect()
  }

  return (
    <button
      onClick={tap}
      title={`${unit.name} — Lv ${unit.level} ${unit.class ?? 'Novice'}${here ? ' · on the viewed battlefield' : ''}\nTap to select · double-tap to jump the camera`}
      className={[
        'relative shrink-0 w-[54px] flex flex-col items-center gap-0.5 px-0.5 py-1 rounded-lg border transition-all',
        selected
          ? (here ? 'border-game-primary bg-game-primary/15 ring-1 ring-game-primary/30' : 'border-amber-500/70 bg-amber-500/10 ring-1 ring-amber-500/30')
          : 'border-transparent hover:bg-white/5',
      ].join(' ')}
    >
      <div className="relative w-9 h-9 rounded-full p-[2px]" style={{ background: ring }}>
        <div className="w-full h-full rounded-full bg-game-surface border border-game-border flex items-center justify-center text-base">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
        <span className={`absolute -bottom-0 -right-0 w-2.5 h-2.5 rounded-full border-2 border-game-bg ${statusColor}`} />
        {needsAttention(unit, viewed) && (
          <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-game-gold border border-game-bg text-[7px] font-bold text-black flex items-center justify-center">!</span>
        )}
      </div>
      <span className="text-[9px] text-game-text font-medium leading-none truncate w-full text-center">{unit.name.split(' ')[0]}</span>
      {/* cue: this hero is on the battlefield you're currently viewing */}
      {here && <span className="absolute bottom-0 inset-x-2 h-0.5 rounded-full bg-game-accent" />}
    </button>
  )
}

// ── Top-bar global nav ─────────────────────────────────────────────────────--
type GlobalPanel = 'guild' | 'reports' | 'time' | 'settings'
const PANEL_TITLE: Record<GlobalPanel, string> = { guild: 'Guild', reports: 'Reports', time: 'Time', settings: 'Settings' }

function NavBtn({ icon, label, active, disabled, onClick }: { icon: string; label: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={[
        'flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-[11px] font-medium transition-colors',
        active ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
          : 'border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// Full-screen overlay hosting a global game screen (Guild / Reports / Time) or
// the settings placeholder. Portal so it escapes the split layout.
function GlobalOverlay({ panel, onClose, onExit }: { panel: GlobalPanel; onClose: () => void; onExit: () => void }) {
  const paused      = useGameStore((s) => s.paused)
  const togglePause = useGameStore((s) => s.togglePause)
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">{PANEL_TITLE[panel]}</span>
        <button onClick={onClose} className="ml-auto flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {panel === 'guild'   && <Guild />}
        {panel === 'reports' && <Reports />}
        {panel === 'time'    && <Time />}
        {panel === 'settings' && (
          <div className="p-4 space-y-4 max-w-md">
            <div className="text-xs text-game-text-dim">Prototype settings — placeholders for now.</div>
            <div className="space-y-2">
              {['Audio', 'Notifications', 'Display', 'Save & sync', 'Accessibility'].map((s) => (
                <div key={s} className="flex items-center justify-between rounded-lg border border-game-border bg-game-surface/40 px-3 py-2.5">
                  <span className="text-sm text-game-text">{s}</span>
                  <span className="text-[10px] uppercase tracking-widest text-game-muted">soon</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-game-border">
              <button onClick={togglePause} className="px-3 py-1.5 rounded-lg border border-game-border text-sm text-game-text hover:bg-white/5">{paused ? '▶ Resume' : '❚❚ Pause'}</button>
              <button onClick={onExit} className="px-3 py-1.5 rounded-lg border border-red-500/50 text-sm text-red-200 hover:bg-red-600/20">Exit prototype</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function ProtoApp() {
  const units            = useGameStore((s) => s.units)
  const locations        = useGameStore((s) => s.locations)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const selectedLocId    = useGameStore((s) => s.selectedLocationId)
  const viewed           = useGameStore((s) => s.viewedUnitLevels)
  const requestZoom      = useProtoStore((s) => s.requestZoom)
  const requestHeroTab   = useProtoStore((s) => s.requestHeroTab)

  const [sortMode, setSortMode] = useState<SortMode>('location')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [panel, setPanel] = useState<GlobalPanel | null>(null)
  const groups = useMemo(() => groupRoster(units, sortMode, sortDir, viewed, locations), [units, sortMode, sortDir, viewed, locations])
  function pickSort(m: SortMode) {
    if (m === sortMode) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortMode(m); setSortDir(SORT_MODES.find((x) => x.id === m)!.defaultDir) }
  }

  // On load, select the first hero in the roster — preferring a deployed one so
  // we land on (and follow the camera into) their battlefield, and the lens
  // drills into Hero. Deferred a macrotask so App.tsx's loadPersistedSave()
  // (a sibling mount effect that runs *after* this child effect) has applied the
  // real save first — otherwise we'd pick from the initial seed roster.
  // Guard lives INSIDE the timeout (not around scheduling) so StrictMode's
  // mount→cleanup→mount double-invoke — which clears the first timer — doesn't
  // skip the second one and leave us never selecting.
  const didInit = useRef(false)
  useEffect(() => {
    const id = setTimeout(() => {
      if (didInit.current) return
      const s = useGameStore.getState()
      if (s.units.length === 0) return
      didInit.current = true
      const ordered = sortUnits(s.units, sortMode, sortDir, s.viewedUnitLevels)
      const hero = ordered.find((u) => u.locationId) ?? ordered[0]
      if (!hero) return
      useGameStore.setState({
        selectedUnitIds: [hero.id],
        selectedLocationId: hero.locationId ?? null,
        combatLocationId: hero.locationId ?? null,
        battleFollowId: hero.locationId ? hero.id : null,
      })
      if (hero.locationId) requestZoom(2)
      requestHeroTab()
    }, 0)
    return () => clearTimeout(id)
  // run once on mount
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Single-tap: quiet select — change the active hero WITHOUT moving the camera
  // or the focused location, so you can pick someone to deploy/compare while
  // still looking at where you are.
  function selectQuiet(u: Unit) {
    useGameStore.setState({ selectedUnitIds: [u.id] })
  }
  // Double-tap: focus — fly the stage to the hero's battlefield, follow the
  // camera, and drill the lens into Hero.
  function focusHero(u: Unit) {
    useGameStore.setState({
      selectedUnitIds: [u.id],
      ...(u.locationId ? { selectedLocationId: u.locationId, combatLocationId: u.locationId, battleFollowId: u.id } : {}),
    })
    if (u.locationId) requestZoom(2)
    requestHeroTab()
  }

  const proto = new URLSearchParams(window.location.search)
  function exitProto() {
    proto.delete('proto')
    window.location.search = proto.toString()
  }

  return (
    <div className="h-full flex flex-col bg-game-bg overflow-hidden">
      {/* global nav bar — guild/reports/time + settings (placeholders) */}
      <header className="shrink-0 flex items-center gap-1.5 px-2 h-11 border-b border-game-border bg-game-surface/70">
        <NavBtn icon="⚜" label="Guild"   active={panel === 'guild'}   onClick={() => setPanel('guild')} />
        <NavBtn icon="📊" label="Reports" active={panel === 'reports'} onClick={() => setPanel('reports')} />
        <NavBtn icon="⏳" label="Time"    active={panel === 'time'}    onClick={() => setPanel('time')} />
        <div className="ml-auto flex items-center gap-1.5">
          <NavBtn icon="🏆" label="Achievements" disabled />
          <NavBtn icon="🔔" label="Alerts" disabled />
          <NavBtn icon="⚙" label="Settings" active={panel === 'settings'} onClick={() => setPanel('settings')} />
        </div>
      </header>

      {/* roster rail — always visible, shared selector + sort (grouped) */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-1.5 py-1 border-b border-game-border bg-game-surface/40">
        <SortControl mode={sortMode} dir={sortDir} onPick={pickSort} />
        <div className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar flex-1">
          {groups.map((g) => {
            const chips = g.units.map((u) => (
              <RosterChip
                key={u.id}
                unit={u}
                selected={selectedUnitIds[0] === u.id}
                here={!!selectedLocId && u.locationId === selectedLocId}
                onSelect={() => selectQuiet(u)}
                onFocus={() => focusHero(u)}
              />
            ))
            // Flat (name/level): no container.
            if (g.label === null) return <div key={g.key} className="flex items-center gap-0.5">{chips}</div>
            const isCurrent = g.locId !== undefined && g.locId === selectedLocId
            return (
              <div key={g.key} className={['flex flex-col rounded-lg border px-1 pb-0.5 shrink-0',
                isCurrent ? 'border-game-accent/50 bg-game-accent/5' : 'border-game-border/50 bg-white/[0.02]'].join(' ')}>
                <span className="text-[8px] uppercase tracking-wide leading-none px-0.5 pt-0.5 pb-0.5 truncate max-w-[140px] text-game-muted">
                  {g.icon} {g.label}
                </span>
                <div className="flex items-center gap-0.5">{chips}</div>
              </div>
            )
          })}
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

      {panel && <GlobalOverlay panel={panel} onClose={() => setPanel(null)} onExit={exitProto} />}
    </div>
  )
}
