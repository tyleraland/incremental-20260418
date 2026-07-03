import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, getInitials, getDerivedStats, OFFLINE_SUMMARY_MIN_SECS, type Unit } from '@/stores/useGameStore'
import { DeploySheetHost } from './DeploySheet'
import { ProtoStage } from './ProtoStage'
import { ProtoLens, PartyDoctrine } from './ProtoLens'
import { useExpeditionDriver } from './expeditionDriver'
import { ArmyMatrix } from './ArmyMatrix'
import { useProtoStore, type QuestBoardEntry } from './protoStore'
import { QuestJournal, useQuestBoard } from './QuestJournal'
import { Town } from './Town'
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

// Grouped roster: assignment / class / to-do bucket heroes; name/level stay flat.
// Each group renders in a light container so same-area (etc.) heroes read as a set.
interface RGroup { key: string; label: string | null; icon: string; units: Unit[]; locId?: string | null }
function groupRoster(units: Unit[], mode: SortMode, dir: SortDir, viewed: Record<string, number>, locations: { id: string; name: string; traits?: string[] }[]): RGroup[] {
  const byName = (a: Unit, b: Unit) => a.name.localeCompare(b.name)
  const bucket = () => new Map<string, Unit[]>()
  const push = (m: Map<string, Unit[]>, k: string, u: Unit) => { const a = m.get(k); if (a) a.push(u); else m.set(k, [u]) }
  const flip = (g: RGroup[]) => (dir === 'desc' ? g.reverse() : g)

  // §orchestration: the default grouping is by ASSIGNMENT — per-location hunting
  // packs (cities marked ⌂), then in-transit heroes, then the idle bench. The
  // strip answers "where is everyone?" at a glance.
  if (mode === 'location') {
    const m = bucket(); const travel: Unit[] = []
    for (const u of units) {
      if (u.travelPath && u.travelPath.length > 0) travel.push(u)
      else push(m, u.locationId ?? '__none__', u)
    }
    const out: RGroup[] = []
    for (const l of locations) {
      const a = m.get(l.id)
      if (a) out.push({ key: l.id, label: l.name, icon: l.traits?.includes('city') ? '⌂' : '⌖', units: a.sort(byName), locId: l.id })
    }
    if (travel.length) out.push({ key: '__travel__', label: 'Traveling', icon: '➟', units: travel.sort(byName), locId: null })
    const none = m.get('__none__'); if (none) out.push({ key: '__none__', label: 'Idle', icon: '·', units: none.sort(byName), locId: null })
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
      {/* compact trigger naming the active mode — shares a column with the
          multi toggle (the old icon-glyph pair read as a cipher) */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Sort: ${cur.label} ${dir === 'asc' ? '▲' : '▼'}`}
        aria-label="Sort roster"
        className="flex items-center justify-center gap-1 w-12 h-6 rounded-md border border-game-border text-game-text-dim hover:text-game-text bg-game-bg/60"
      >
        <span className="text-[10px] leading-none">⇅</span>
        <span className="text-[9px] leading-none">{cur.label}{dir === 'asc' ? '▲' : '▼'}</span>
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

// "Needs attention" = the hero has gained a level since you last spent a resource
// on them (ability point or skill). `viewedUnitLevels[id]` records the level at the
// last spend; once you spend *anything* it clears until the next level-up — so we
// nudge on fresh growth without nagging about leftover/remainder points.
function needsAttention(u: Unit, viewed: Record<string, number>): boolean {
  return u.level > (viewed[u.id] ?? 0)
}

// State → ring color: fighting green, traveling amber, resting sky, recovering
// purple, idle gray. The ring's sweep is the hero's HP fraction — one glyph
// carries condition + state, replacing the old corner status dot.
function unitStateColor(u: Unit): { color: string; state: string } {
  if (u.recoveryTicksLeft > 0) return { color: '#a855f7', state: 'recovering' }
  if (u.isResting) return { color: '#38bdf8', state: 'resting' }
  if (u.travelPath && u.travelPath.length > 0) return { color: '#f59e0b', state: 'traveling' }
  if (u.locationId) return { color: '#34d399', state: 'fighting' }
  return { color: '#9ca3af', state: 'idle' }
}

function RosterChip({ unit, selected, here, following, compact, onSelect, onFocus, innerRef }: { unit: Unit; selected: boolean; here: boolean; following: boolean; compact?: boolean; onSelect: () => void; onFocus: () => void; innerRef?: React.Ref<HTMLButtonElement> }) {
  const viewed    = useGameStore((s) => s.viewedUnitLevels)
  const equipment = useGameStore((s) => s.equipment)
  const { color, state } = unitStateColor(unit)
  const maxHp = getDerivedStats(unit, equipment).maxHp
  const hpPct = Math.max(0.04, Math.min(1, maxHp > 0 ? unit.health / maxHp : 0))
  // Single tap = quiet select; double tap (within 300ms) = focus (fly camera).
  const lastTap = useRef(0)
  function tap() {
    const now = Date.now()
    if (now - lastTap.current < 300) { lastTap.current = 0; onFocus(); return }
    lastTap.current = now; onSelect()
  }

  return (
    <button
      ref={innerRef}
      onClick={tap}
      title={`${unit.name} — Lv ${unit.level} ${unit.class ?? 'Novice'} · ${state} · ${Math.floor(unit.health)}/${maxHp} HP${here ? ' · on the viewed battlefield' : ''}${following ? ' · camera is following them' : ''}\nTap to select · double-tap to jump the camera`}
      className={[
        'relative shrink-0 flex flex-col items-center border transition-all',
        // Compact = the avatar IS the chip (the name lives in the command bar and
        // the tooltip); expanded adds the name row.
        compact ? 'rounded-full p-0.5' : 'w-[54px] gap-0.5 px-0.5 py-1 rounded-lg',
        // Follow is signalled purely by the 🎥 badge below — no extra highlight,
        // so it never competes with the selection ring.
        selected
          ? (here ? 'border-game-primary bg-game-primary/15 ring-1 ring-game-primary/30' : 'border-amber-500/70 bg-amber-500/10 ring-1 ring-amber-500/30')
          : 'border-transparent hover:bg-white/5',
      ].join(' ')}
    >
      {/* HP/condition ring: sweep = HP fraction, color = state */}
      <div
        className="rounded-full p-[2px]"
        style={{ background: `conic-gradient(${color} ${hpPct * 360}deg, rgba(255,255,255,0.10) 0deg)` }}
      >
        <div className="relative w-8 h-8 rounded-full bg-game-surface flex items-center justify-center text-base">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
      </div>
      {following && (
        <span
          title="Camera is following this hero"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-game-accent border border-game-bg flex items-center justify-center text-[8px] leading-none shadow"
        >🎥</span>
      )}
      {needsAttention(unit, viewed) && (
        <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-game-gold border border-game-bg text-[7px] font-bold text-black flex items-center justify-center">!</span>
      )}
      {!compact && <span className="text-[10px] text-game-text font-medium leading-none truncate w-full text-center">{unit.name.split(' ')[0]}</span>}
    </button>
  )
}

// ── Top-bar global nav ─────────────────────────────────────────────────────--
type GlobalPanel = 'guild' | 'reports' | 'time' | 'settings' | 'quests' | 'town'
const PANEL_TITLE: Record<GlobalPanel, string> = { guild: 'Guild', reports: 'Reports', time: 'Time', settings: 'Settings', quests: 'Quests', town: 'Town' }

// The Guild board folds in the Party spreadsheet (all heroes grouped by location).
// Tapping a hero now drills straight into the lens's Hero tab (the single hero
// deep-dive) rather than a separate overlay — the aggregate→deep-dive bridge.
// Recruit is parked at the bottom.
function GuildBoard({ onHero }: { onHero: (id: string) => void }) {
  const units = useGameStore((s) => s.units)
  const recruitUnit = useGameStore((s) => s.recruitUnit)
  return (
    <div className="p-3 max-w-3xl w-full mx-auto space-y-4">
      {/* Party doctrine — the shared, party-wide tactics, edited here on the
          roster board rather than inside a single hero's Tactics lens. */}
      <div className="rounded-lg border border-game-border bg-game-surface/40 px-3 py-2.5">
        <PartyDoctrine />
      </div>
      <ArmyMatrix squad={units} locationName="Guild" onHero={onHero} />
      <div className="flex items-center justify-between border-t border-game-border pt-3">
        <span className="text-xs text-game-text-dim">{units.length} member{units.length !== 1 ? 's' : ''} in the guild</span>
        <button onClick={recruitUnit} className="px-4 py-2 rounded-lg bg-game-primary text-white text-sm font-medium hover:bg-game-primary/80">＋ Recruit a member</button>
      </div>
    </div>
  )
}

function NavBtn({ icon, label, active, disabled, badge, onClick, className }: { icon: string; label: string; active?: boolean; disabled?: boolean; badge?: number; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={badge ? `${label} — ${badge} ready` : label}
      aria-label={label}
      className={[
        // Icon over an always-visible label (icon-only buttons read as mystery
        // meat on a phone); inactive buttons drop their outline so the row
        // doesn't read as eight competing boxes.
        'relative shrink-0 flex flex-col items-center justify-center gap-0.5 min-w-[50px] px-1.5 h-10 rounded-lg border transition-colors',
        active ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
          : 'border-transparent text-game-text-dim hover:text-game-text hover:bg-white/5',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        className ?? '',
      ].join(' ')}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[9px] font-medium leading-none">{label}</span>
      {/* nudge: a gold badge when quests are ready to collect */}
      {badge ? (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-game-gold text-game-bg text-[9px] font-bold flex items-center justify-center border border-game-bg tabular-nums">{badge}</span>
      ) : null}
    </button>
  )
}

// ── Decisions inbox ──────────────────────────────────────────────────────────--
// One actionable surface replacing scattered alert dots: everything that wants a
// player decision, with severity and a "go" action. red = blocked/hurt, gold =
// spendable/collectable, gray = informational.
type Decision = { id: string; severity: 'red' | 'gold' | 'info'; icon: string; text: string; go: () => void }

function useDecisions(gotoQuest: (e: QuestBoardEntry) => void): Decision[] {
  const units = useGameStore((s) => s.units)
  const board = useQuestBoard()
  const out: Decision[] = []
  const first = (u: Unit) => u.name.split(' ')[0]
  // A decision tap drills into the hero (hero scope + the right lens tab).
  const goHero = (u: Unit) => {
    useGameStore.setState({ selectedUnitIds: [u.id], ...(u.locationId ? { selectedLocationId: u.locationId } : {}) })
    useProtoStore.getState().setScopeFocus('hero')
    useProtoStore.getState().requestHeroTab()
  }
  for (const u of units) {
    if (u.recoveryTicksLeft > 0) out.push({ id: `ko-${u.id}`, severity: 'red', icon: '✚', text: `${first(u)} was knocked out — recovering`, go: () => goHero(u) })
    if (u.skillPoints > 0) out.push({ id: `sp-${u.id}`, severity: 'gold', icon: '✦', text: `${first(u)} has ${u.skillPoints} skill point${u.skillPoints > 1 ? 's' : ''} to spend`, go: () => goHero(u) })
    if (u.abilityPoints > 0) out.push({ id: `ap-${u.id}`, severity: 'gold', icon: '◈', text: `${first(u)} has ${u.abilityPoints} ability point${u.abilityPoints > 1 ? 's' : ''} to spend`, go: () => goHero(u) })
  }
  for (const e of board) {
    if (e.status === 'ready') out.push({ id: `q-${e.id}`, severity: 'gold', icon: '📜', text: `Quest ready: ${e.title} — ${e.locationName}`, go: () => gotoQuest(e) })
    else if (e.status === 'available') out.push({ id: `qa-${e.id}`, severity: 'info', icon: '📜', text: `New quest at ${e.locationName}: ${e.title}`, go: () => gotoQuest(e) })
  }
  for (const u of units) {
    if (!u.locationId && !u.isResting && u.recoveryTicksLeft <= 0) out.push({ id: `idle-${u.id}`, severity: 'info', icon: '·', text: `${first(u)} is idle — deploy them?`, go: () => goHero(u) })
  }
  const rank = { red: 0, gold: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

const SEV_CLS: Record<Decision['severity'], string> = {
  red:  'border-rose-600/50 bg-rose-950/30 text-rose-200',
  gold: 'border-game-gold/50 bg-game-gold/10 text-game-gold',
  info: 'border-game-border bg-game-bg text-game-text-dim',
}

function DecisionsInbox({ decisions, onClose }: { decisions: Decision[]; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">⚑ Decisions</span>
        <span className="text-[11px] text-game-text-dim">{decisions.length} waiting</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-sm">✕</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="max-w-xl w-full mx-auto space-y-1.5" style={{ zoom: 1.12 }}>
          {decisions.length === 0 && (
            <div className="text-center py-10">
              <div className="text-3xl mb-2 opacity-40">✓</div>
              <div className="text-sm text-game-text-dim">Nothing needs you right now.</div>
            </div>
          )}
          {decisions.map((d) => (
            <button
              key={d.id}
              onClick={() => { d.go(); onClose() }}
              className={`w-full flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-xs hover:brightness-125 transition-all ${SEV_CLS[d.severity]}`}
            >
              <span className="w-5 text-center shrink-0">{d.icon}</span>
              <span className="flex-1 leading-snug">{d.text}</span>
              <span className="shrink-0 opacity-60">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Nav drawer — the low-frequency global destinations live here, off the bar ──
function NavDrawer({ onPick, onClose }: { onPick: (p: GlobalPanel) => void; onClose: () => void }) {
  const items: { id: GlobalPanel; icon: string; label: string; sub: string }[] = [
    { id: 'guild',    icon: '⚜', label: 'Guild',    sub: 'roster spreadsheet · doctrine · recruit' },
    { id: 'quests',   icon: '📜', label: 'Quests',   sub: 'the full journal, all locations' },
    { id: 'reports',  icon: '📊', label: 'Reports',  sub: 'combat + progression history' },
    { id: 'time',     icon: '⏳', label: 'Time',     sub: 'pace, offline rules, debug' },
    { id: 'settings', icon: '⚙', label: 'Settings', sub: 'preferences · classic UI' },
  ]
  return createPortal(
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-72 max-w-[80vw] h-full bg-game-surface border-r border-game-border flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-game-border">
          <span className="text-sm font-semibold text-game-text">Menu</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:text-game-text text-sm">✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it.id)}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
            >
              <span className="text-lg w-6 text-center">{it.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm text-game-text font-medium">{it.label}</span>
                <span className="block text-[10px] text-game-muted truncate">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Full-screen overlay hosting a global game screen (Guild / Reports / Time) or
// the settings placeholder. Portal so it escapes the split layout.
function GlobalOverlay({ panel, onClose, onExit }: { panel: GlobalPanel; onClose: () => void; onExit: () => void }) {
  const paused      = useGameStore((s) => s.paused)
  const togglePause = useGameStore((s) => s.togglePause)
  // Aggregate → deep-dive: a Guild-matrix hero tap selects them, drills the lens
  // into Hero, and dismisses the board so the split is revealed beneath it.
  function openHeroInLens(id: string) {
    const u = useGameStore.getState().units.find((x) => x.id === id)
    useGameStore.setState({ selectedUnitIds: [id], ...(u?.locationId ? { selectedLocationId: u.locationId } : {}) })
    useProtoStore.getState().requestHeroTab()
    onClose()
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">{PANEL_TITLE[panel]}</span>
        <button onClick={onClose} aria-label="Close" className="ml-auto w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-sm">✕</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ zoom: 1.15 }}>
        {panel === 'guild'   && <GuildBoard onHero={openHeroInLens} />}
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
              <button onClick={onExit} className="px-3 py-1.5 rounded-lg border border-game-border text-sm text-game-text-dim hover:bg-white/5" title="Switch to the legacy tab-bar UI">↩ Classic UI</button>
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
  const battleFollowId   = useGameStore((s) => s.battleFollowId)
  const offlineSummary   = useGameStore((s) => s.offlineSummary)
  const viewed           = useGameStore((s) => s.viewedUnitLevels)
  const requestZoom      = useProtoStore((s) => s.requestZoom)
  const requestHeroTab   = useProtoStore((s) => s.requestHeroTab)
  const requestLocationTab = useProtoStore((s) => s.requestLocationTab)
  const dismissBattleCard = useProtoStore((s) => s.dismissBattleCard)

  // Quest Journal "go to location": focus the map on the quest's site and open
  // its Location lens (where you expand the quest's row), then close the journal.
  function gotoQuest(e: QuestBoardEntry) {
    const loc = locations.find((l) => l.id === e.locationId)
    if (loc) {
      useGameStore.getState().setMapPage(loc.region)
      useGameStore.getState().setSelectedLocation(e.locationId)
      useProtoStore.getState().setScopeFocus('location')
      requestZoom(1)
      requestLocationTab()
    }
    setPanel(null)
  }

  // The Decisions inbox (top-right) aggregates everything that wants the player.
  const decisions = useDecisions(gotoQuest)
  const urgent = decisions.filter((d) => d.severity !== 'info').length

  const [sortMode, setSortMode] = useState<SortMode>('location')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [panel, setPanel] = useState<GlobalPanel | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [decisionsOpen, setDecisionsOpen] = useState(false)
  useExpeditionDriver()   // §expedition: advance deployed heroes' runs each tick
  // Multi-select: when on, single-tap toggles a hero in/out of the selection for
  // bulk deploy (Location lens). Off = single-select (tap replaces).
  const [multi, setMulti] = useState(false)
  // Roster density: compact (default) = a slim avatar-only strip for glancing +
  // switching; expanded adds names, group labels, and the sort/multi tools for
  // managing. Ephemeral UI state — its own localStorage key, like tab state.
  const [rosterExpanded, setRosterExpanded] = useState(() => {
    try { return localStorage.getItem('proto-roster-expanded') === '1' } catch { return false }
  })
  function toggleRoster() {
    setRosterExpanded((v) => {
      const next = !v
      try { localStorage.setItem('proto-roster-expanded', next ? '1' : '0') } catch { /* private mode */ }
      if (!next) setMulti(false)   // multi-select is an expanded-mode tool
      return next
    })
  }
  const groups = useMemo(() => groupRoster(units, sortMode, sortDir, viewed, locations), [units, sortMode, sortDir, viewed, locations])
  // Publish the rail's flat visual order so the scope bar's ‹ › hero cycling
  // steps through heroes in the same order the player sees here.
  const setRosterOrder = useProtoStore((s) => s.setRosterOrder)
  useEffect(() => {
    setRosterOrder(groups.flatMap((g) => g.units.map((u) => u.id)))
  }, [groups, setRosterOrder])
  function pickSort(m: SortMode) {
    if (m === sortMode) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortMode(m); setSortDir(SORT_MODES.find((x) => x.id === m)!.defaultDir) }
  }

  // Followed-hero sticky: keep the camera-followed chip ALWAYS visible in the
  // rail. Its chip stays in its natural slot; when it scrolls off an edge we pin
  // a clone to that edge (`pin`), so the followed hero is reachable no matter how
  // far you scroll. Measured from the live geometry on scroll/resize.
  const rosterScrollRef = useRef<HTMLDivElement>(null)
  const followChipRef   = useRef<HTMLButtonElement | null>(null)
  const [pin, setPin] = useState<'left' | 'right' | null>(null)
  const followUnit = battleFollowId ? units.find((u) => u.id === battleFollowId) ?? null : null

  // Follow across maps: while the camera is locked on a hero, bring the stage along
  // when THEY move maps (route home / cross a portal / redeploy) — instead of
  // staying parked on the field they left. Keyed off the followed hero's location
  // CHANGING (a ref tracks the last seen one), so it never fights the player tapping
  // a different location to glance around while still following. Only moves the
  // focus (selected/combat location + map page); the stage zoom persists, so the
  // battle-altitude follow carries over.
  const followLocId = followUnit?.locationId ?? null
  const prevFollowLocRef = useRef<string | null>(null)
  useEffect(() => {
    if (!battleFollowId) { prevFollowLocRef.current = null; return }
    const prev = prevFollowLocRef.current
    prevFollowLocRef.current = followLocId
    if (!followLocId || followLocId === prev) return   // hero hasn't changed maps
    const s = useGameStore.getState()
    // Sync the map page + BOTH camera targets to the followed hero's new map.
    // NB: check selectedLocationId AND combatLocationId — an instant redeploy /
    // return-to-town can leave selectedLocationId already pointing at the new map
    // while combatLocationId (the WATCHED battle) still points at the old field, so
    // gating only on selectedLocationId used to strand the battle-view camera on the
    // map they left (follow silently dropped across the transition).
    const loc = s.locations.find((l) => l.id === followLocId)
    if (loc && loc.region !== s.mapPageId) s.setMapPage(loc.region)
    const patch: Partial<{ selectedLocationId: string; combatLocationId: string }> = {}
    if (s.selectedLocationId !== followLocId) patch.selectedLocationId = followLocId
    if (s.combatLocationId !== followLocId) patch.combatLocationId = followLocId
    if (Object.keys(patch).length) useGameStore.setState(patch)
  }, [battleFollowId, followLocId])

  const measurePin = useCallback(() => {
    const sc = rosterScrollRef.current
    const ch = followChipRef.current
    if (!sc || !ch || !battleFollowId) { setPin(null); return }
    const s = sc.getBoundingClientRect()
    const c = ch.getBoundingClientRect()
    // Pin the instant the chip would start clipping at an edge, so a full chip
    // stays parked there (it never scrolls partway off before sticking).
    if (c.left < s.left - 0.5) setPin('left')
    else if (c.right > s.right + 0.5) setPin('right')
    else setPin(null)
  }, [battleFollowId])

  useEffect(() => {
    const sc = rosterScrollRef.current
    if (!sc) return
    measurePin()
    const onScroll = () => measurePin()
    sc.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { sc.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  // re-run when the list or follow target changes (groups re-derives from units)
  }, [measurePin, groups])

  // On load, select the first hero in the roster — preferring a deployed one so
  // we land on (and follow the camera into) their battlefield. The lens stays on
  // its default Location tab (you've just dropped onto a battlefield — show the
  // site, not the hero dossier; double-tapping a roster hero still drills to Hero).
  // Deferred a macrotask so App.tsx's loadPersistedSave()
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
      // Land on the LOCATION scope (the site they're at) rather than the hero
      // dossier — you've just dropped onto a battlefield; show where you are.
      if (hero.locationId) useProtoStore.getState().setScopeFocus('location')
      // Returning after a real absence pops the offline report. Don't dive the
      // camera world→battle BEHIND the modal — that rapid zoom under the report is
      // jarring. Land calm: selecting the hero's location centers the world map
      // there (no zoom) so the report reads over a still map; the dive into the
      // followed hero's battlefield fires when the report is dismissed (effect
      // below). A short absence has no report, so dive straight in here.
      // `lastTickAt` here is the restored `savedAt` (this runs after the save loads
      // but before catch-up), so the gap matches when the report will show.
      const awaySecs = (Date.now() - s.lastTickAt) / 1000
      if (hero.locationId && awaySecs < OFFLINE_SUMMARY_MIN_SECS) requestZoom(2)
    }, 0)
    return () => clearTimeout(id)
  // run once on mount
  }, [])

  // Dismissing the offline report drops into the followed hero's battlefield —
  // the dive we deferred above so it didn't animate behind the modal. Fires only
  // on the report's open→closed edge, and only when a deployed hero is followed.
  const reportWasOpen = useRef(false)
  useEffect(() => {
    const wasOpen = reportWasOpen.current
    reportWasOpen.current = !!offlineSummary
    if (!wasOpen || offlineSummary) return
    const s = useGameStore.getState()
    if (s.battleFollowId && s.combatLocationId) requestZoom(2)
  }, [offlineSummary, requestZoom])

  // Single-tap: quiet select — change the active hero WITHOUT moving the camera
  // or the focused location, so you can pick someone to deploy/compare while
  // still looking at where you are. In multi-select mode it toggles membership.
  function selectQuiet(u: Unit) {
    if (multi) {
      useGameStore.setState((s) => ({
        selectedUnitIds: s.selectedUnitIds.includes(u.id)
          ? s.selectedUnitIds.filter((id) => id !== u.id)
          : [...s.selectedUnitIds, u.id],
      }))
    } else {
      useGameStore.setState({ selectedUnitIds: [u.id] })
    }
    // A roster pick dismisses any open battlefield detail card (it isn't a modal)
    // and clears an inspected foe so the Unit tab shows the picked hero.
    useProtoStore.getState().setScopeFocus('hero')
    dismissBattleCard()
    useProtoStore.getState().clearFoe()
  }
  // Double-tap: focus — fly the stage to the hero's battlefield, follow the
  // camera, and drill the lens into Hero.
  function focusHero(u: Unit) {
    useGameStore.setState({
      selectedUnitIds: [u.id],
      ...(u.locationId ? { selectedLocationId: u.locationId, combatLocationId: u.locationId, battleFollowId: u.id } : {}),
    })
    useProtoStore.getState().setScopeFocus('hero')
    if (u.locationId) requestZoom(2)
    requestHeroTab()
    dismissBattleCard()
    useProtoStore.getState().clearFoe()
  }

  // Tap a roster group label → select that location (location scope) so the
  // strip doubles as a location picker, not just a hero picker.
  function pickGroupLocation(locId: string) {
    const loc = locations.find((l) => l.id === locId)
    if (loc && loc.region !== useGameStore.getState().mapPageId) useGameStore.getState().setMapPage(loc.region)
    useGameStore.getState().setSelectedLocation(locId)
    useProtoStore.getState().setScopeFocus('location')
  }

  // Drop to the legacy tab-bar UI (kept as a fallback behind ?classic=1).
  function exitProto() {
    const q = new URLSearchParams(window.location.search)
    q.delete('proto')
    q.set('classic', '1')
    window.location.search = q.toString()
  }

  return (
    <div className="h-full flex flex-col bg-game-bg overflow-hidden">
      {/* global bar — field play keeps only what it needs always-on: the menu
          drawer (Guild/Quests/Reports/Time/Settings), Town (a real game
          destination), and the Decisions inbox. Everything else moved off the bar. */}
      <header className="shrink-0 flex items-center gap-1 px-1.5 h-12 border-b border-game-border bg-game-surface/70">
        <NavBtn icon="☰" label="Menu" active={drawer} onClick={() => setDrawer(true)} />
        <div className="ml-auto flex items-center gap-1">
          <NavBtn icon="🏪" label="Town" active={panel === 'town'} onClick={() => setPanel('town')} />
          <NavBtn icon="⚑" label="Decisions" active={decisionsOpen} badge={urgent} onClick={() => setDecisionsOpen(true)} />
        </div>
      </header>

      {/* roster rail — always pinned (it's the shared selector driving stage +
          lens), but defaults to a slim avatar-only strip; the ▸ handle expands
          it into the managing view (names, group labels, sort, multi-select). */}
      <div className="shrink-0 flex items-stretch gap-1.5 px-1.5 py-1 border-b border-game-border bg-game-surface/40">
        <button
          onClick={toggleRoster}
          title={rosterExpanded ? 'Collapse the roster to a slim strip' : 'Expand the roster — names, groups, sort & multi-select'}
          aria-label={rosterExpanded ? 'Collapse roster' : 'Expand roster'}
          className="shrink-0 w-5 self-stretch rounded-md border border-game-border/60 bg-game-bg/40 text-game-text-dim hover:text-game-text flex items-center justify-center"
        >
          <span className="text-[10px] leading-none">{rosterExpanded ? '▾' : '▸'}</span>
        </button>
        {/* sort + multi-select are managing tools — they ride expanded mode only */}
        {rosterExpanded && (
          <div className="flex flex-col gap-1 shrink-0">
            <SortControl mode={sortMode} dir={sortDir} onPick={pickSort} />
            <button
              onClick={() => setMulti((v) => !v)}
              title={multi ? 'Multi-select on — tap heroes to add; deploy them from the Location lens' : 'Multi-select heroes for bulk deploy'}
              aria-label="Toggle multi-select"
              className={['flex items-center justify-center gap-0.5 w-12 h-6 rounded-md border',
                multi ? 'border-game-primary bg-game-primary/15 text-game-text' : 'border-game-border text-game-text-dim hover:text-game-text bg-game-bg/60'].join(' ')}
            >
              <span className="text-[11px] leading-none">{multi ? '✓' : '⊕'}</span>
              <span className="text-[9px] leading-none">{multi ? selectedUnitIds.length : 'multi'}</span>
            </button>
          </div>
        )}
        <div className="relative flex-1 min-w-0">
          <div ref={rosterScrollRef} className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar h-full snap-x scroll-px-1">
            {groups.map((g, gi) => {
              const chips = g.units.map((u) => (
                <RosterChip
                  key={u.id}
                  unit={u}
                  selected={multi ? selectedUnitIds.includes(u.id) : selectedUnitIds[0] === u.id}
                  here={!!selectedLocId && u.locationId === selectedLocId}
                  following={battleFollowId === u.id}
                  compact={!rosterExpanded}
                  innerRef={battleFollowId === u.id ? followChipRef : undefined}
                  onSelect={() => selectQuiet(u)}
                  onFocus={() => focusHero(u)}
                />
              ))
              // Flat (name/level): no container.
              if (g.label === null) return <div key={g.key} className="flex items-center gap-0.5">{chips}</div>
              const isCurrent = g.locId !== undefined && g.locId === selectedLocId
              // Compact: no group chrome — a hairline divider between groups and a
              // soft tint under the currently-viewed location's heroes. The group
              // name rides the tooltip.
              if (!rosterExpanded) {
                return (
                  <div
                    key={g.key}
                    title={g.label ?? undefined}
                    className={['flex items-center gap-0.5 shrink-0 snap-start rounded-full px-0.5',
                      isCurrent ? 'bg-game-accent/10' : '',
                      gi > 0 ? 'border-l border-game-border/60 pl-1.5 rounded-l-none' : ''].join(' ')}
                  >{chips}</div>
                )
              }
              return (
                <div key={g.key} className={['flex flex-col rounded-lg px-1 pb-0.5 shrink-0 snap-start',
                  isCurrent ? 'bg-game-accent/10' : 'bg-white/[0.03]'].join(' ')}>
                  {g.locId ? (
                    <button
                      onClick={() => pickGroupLocation(g.locId!)}
                      title={`Select ${g.label} (location scope)`}
                      className="text-[9px] uppercase tracking-wide leading-none px-0.5 pt-0.5 pb-0.5 truncate max-w-[140px] text-left text-game-muted hover:text-game-text"
                    >{g.icon} {g.label}</button>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wide leading-none px-0.5 pt-0.5 pb-0.5 truncate max-w-[140px] text-game-muted">
                      {g.icon} {g.label}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5">{chips}</div>
                </div>
              )
            })}
          </div>

          {/* pinned clone of the followed hero — appears at whichever edge the
              real chip has scrolled past, so it's always on screen + tappable. */}
          {pin && followUnit && (
            <div className={['absolute top-0 bottom-0 z-10 flex items-center pointer-events-none', pin === 'left' ? 'left-0 pr-3' : 'right-0 pl-3'].join(' ')}>
              <div className={['flex items-center h-full pointer-events-auto bg-game-surface', pin === 'left' ? 'pr-2 bg-gradient-to-r from-game-surface via-game-surface to-transparent' : 'pl-2 bg-gradient-to-l from-game-surface via-game-surface to-transparent'].join(' ')}>
                <RosterChip
                  unit={followUnit}
                  selected={multi ? selectedUnitIds.includes(followUnit.id) : selectedUnitIds[0] === followUnit.id}
                  here={!!selectedLocId && followUnit.locationId === selectedLocId}
                  following
                  compact={!rosterExpanded}
                  onSelect={() => selectQuiet(followUnit)}
                  onFocus={() => focusHero(followUnit)}
                />
              </div>
            </div>
          )}
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

      {panel === 'quests'
        ? <QuestJournal onClose={() => setPanel(null)} onGoto={gotoQuest} />
        : panel === 'town'
        ? <Town onClose={() => setPanel(null)} />
        : panel && <GlobalOverlay panel={panel} onClose={() => setPanel(null)} onExit={exitProto} />}

      {drawer && <NavDrawer onPick={(p) => { setDrawer(false); setPanel(p) }} onClose={() => setDrawer(false)} />}
      {decisionsOpen && <DecisionsInbox decisions={decisions} onClose={() => setDecisionsOpen(false)} />}
      <DeploySheetHost />
    </div>
  )
}
