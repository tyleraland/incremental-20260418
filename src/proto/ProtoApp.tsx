import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, getDerivedStats, getInitials, OFFLINE_SUMMARY_MIN_SECS, type Unit } from '@/stores/useGameStore'
import { ProtoStage } from './ProtoStage'
import { ProtoLens } from './ProtoLens'
import { useProtoStore, type QuestBoardEntry } from './protoStore'
import { QuestJournal, useQuestBoard } from './QuestJournal'
import { Town } from './Town'
import { ArmyMatrix } from './ArmyMatrix'
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
      {/* compact icon-only trigger — shares a column with the multi toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Sort: ${cur.label} ${dir === 'asc' ? '▲' : '▼'}`}
        aria-label="Sort roster"
        className="flex items-center justify-center gap-0.5 w-10 h-6 rounded-md border border-game-border text-game-text-dim hover:text-game-text bg-game-bg/60"
      >
        <span className="text-[11px] leading-none">⇅</span>
        <span className="text-[9px] leading-none">{cur.icon}{dir === 'asc' ? '▲' : '▼'}</span>
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

function RosterChip({ unit, selected, here, following, onSelect, onFocus, innerRef }: { unit: Unit; selected: boolean; here: boolean; following: boolean; onSelect: () => void; onFocus: () => void; innerRef?: React.Ref<HTMLButtonElement> }) {
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
      ref={innerRef}
      onClick={tap}
      title={`${unit.name} — Lv ${unit.level} ${unit.class ?? 'Novice'}${here ? ' · on the viewed battlefield' : ''}${following ? ' · camera is following them' : ''}\nTap to select · double-tap to jump the camera`}
      className={[
        'relative shrink-0 w-[54px] flex flex-col items-center gap-0.5 px-0.5 py-1 rounded-lg border transition-all',
        // Follow is signalled purely by the 🎥 badge below — no extra highlight,
        // so it never competes with the selection ring.
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
        {following && (
          <span
            title="Camera is following this hero"
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-game-accent border border-game-bg flex items-center justify-center text-[8px] leading-none shadow"
          >🎥</span>
        )}
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
      <ArmyMatrix squad={units} locationName="Guild" onHero={onHero} />
      <div className="flex items-center justify-between border-t border-game-border pt-3">
        <span className="text-xs text-game-text-dim">{units.length} member{units.length !== 1 ? 's' : ''} in the guild</span>
        <button onClick={recruitUnit} className="px-4 py-2 rounded-lg bg-game-primary text-white text-sm font-medium hover:bg-game-primary/80">＋ Recruit a member</button>
      </div>
    </div>
  )
}

function NavBtn({ icon, label, active, disabled, badge, onClick }: { icon: string; label: string; active?: boolean; disabled?: boolean; badge?: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={badge ? `${label} — ${badge} ready` : label}
      aria-label={label}
      className={[
        'relative flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium transition-colors',
        active ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
          : 'border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {/* nudge: a gold badge when quests are ready to collect */}
      {badge ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-game-gold text-game-bg text-[9px] font-bold flex items-center justify-center border border-game-bg tabular-nums">{badge}</span>
      ) : null}
    </button>
  )
}

// The Quests nav button carries a live "ready to collect" badge as the nudge.
function QuestsNavButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const board = useQuestBoard()
  const ready = board.reduce((n, e) => n + (e.status === 'ready' ? 1 : 0), 0)
  return <NavBtn icon="📜" label="Quests" active={active} badge={ready} onClick={onClick} />
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
        <button onClick={onClose} className="ml-auto flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
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
      requestZoom(1)
      requestLocationTab()
    }
    setPanel(null)
  }

  const [sortMode, setSortMode] = useState<SortMode>('location')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [panel, setPanel] = useState<GlobalPanel | null>(null)
  // Split emphasis: lean the layout toward the battlefield (Field) or the dossier
  // (Lens) without ever hiding either — the field stays watchable while you do
  // deep-edit work, and vice versa. 50/50 by default.
  const [emphasis, setEmphasis] = useState<'field' | 'split' | 'lens'>('split')
  const stageBasis = emphasis === 'field' ? '72%' : emphasis === 'lens' ? '28%' : '50%'
  const lensBasis  = emphasis === 'field' ? '28%' : emphasis === 'lens' ? '72%' : '50%'
  // Multi-select: when on, single-tap toggles a hero in/out of the selection for
  // bulk deploy (Location lens). Off = single-select (tap replaces).
  const [multi, setMulti] = useState(false)
  const groups = useMemo(() => groupRoster(units, sortMode, sortDir, viewed, locations), [units, sortMode, sortDir, viewed, locations])
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
      // Returning after a real absence pops the offline report. Don't ALSO dive the
      // camera world→battle behind it — that rapid zoom under the modal is jarring.
      // Land calm: selecting the hero's location just centers the world map there
      // (no zoom), so the report reads over a still map and the player zooms in when
      // ready. `lastTickAt` here is the restored `savedAt` (this runs after the save
      // loads but before catch-up), so the gap matches when the report will show.
      const awaySecs = (Date.now() - s.lastTickAt) / 1000
      if (hero.locationId && awaySecs < OFFLINE_SUMMARY_MIN_SECS) requestZoom(2)
    }, 0)
    return () => clearTimeout(id)
  // run once on mount
  }, [])

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
    if (u.locationId) requestZoom(2)
    requestHeroTab()
    dismissBattleCard()
    useProtoStore.getState().clearFoe()
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
      {/* global nav bar — guild/reports/time + settings (placeholders) */}
      <header className="shrink-0 flex items-center gap-1.5 px-2 h-11 border-b border-game-border bg-game-surface/70">
        <NavBtn icon="⚜" label="Guild"   active={panel === 'guild'}   onClick={() => setPanel('guild')} />
        <NavBtn icon="🏪" label="Town"    active={panel === 'town'}    onClick={() => setPanel('town')} />
        <QuestsNavButton active={panel === 'quests'} onClick={() => setPanel('quests')} />
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
        {/* filter (sort) + multi-select share a column to the left of the roster */}
        <div className="flex flex-col gap-1 shrink-0">
          <SortControl mode={sortMode} dir={sortDir} onPick={pickSort} />
          {/* multi-select toggle — build a selection for bulk deploy */}
          <button
            onClick={() => setMulti((v) => !v)}
            title={multi ? 'Multi-select on — tap heroes to add; deploy them from the Location lens' : 'Multi-select heroes for bulk deploy'}
            aria-label="Toggle multi-select"
            className={['flex items-center justify-center gap-0.5 w-10 h-6 rounded-md border',
              multi ? 'border-game-primary bg-game-primary/15 text-game-text' : 'border-game-border text-game-text-dim hover:text-game-text bg-game-bg/60'].join(' ')}
          >
            <span className="text-[11px] leading-none">{multi ? '✓' : '⊕'}</span>
            <span className="text-[9px] leading-none">{multi ? selectedUnitIds.length : 'multi'}</span>
          </button>
        </div>
        <div className="relative flex-1 min-w-0">
          <div ref={rosterScrollRef} className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar h-full">
            {groups.map((g) => {
              const chips = g.units.map((u) => (
                <RosterChip
                  key={u.id}
                  unit={u}
                  selected={multi ? selectedUnitIds.includes(u.id) : selectedUnitIds[0] === u.id}
                  here={!!selectedLocId && u.locationId === selectedLocId}
                  following={battleFollowId === u.id}
                  innerRef={battleFollowId === u.id ? followChipRef : undefined}
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
                  onSelect={() => selectQuiet(followUnit)}
                  onFocus={() => focusHero(followUnit)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* split: world/battle stage  |  context lens. Basis is driven by the
          emphasis control so either half can lean larger while both stay live. */}
      <div className="relative flex-1 min-h-0 flex flex-col md:flex-row">
        <div style={{ flexBasis: stageBasis }} className="min-h-0 min-w-0 border-b md:border-b-0 md:border-r border-game-border transition-[flex-basis] duration-200">
          <ProtoStage />
        </div>
        <div style={{ flexBasis: lensBasis }} className="min-h-0 min-w-0 transition-[flex-basis] duration-200">
          <ProtoLens />
        </div>

        {/* Emphasis toggle — parked on the split seam (centered on mobile's
            horizontal divider, right edge on desktop's vertical one). */}
        <div className="absolute z-30 top-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-lg border border-game-border bg-game-surface/90 backdrop-blur px-0.5 py-0.5 shadow">
          {([['field', 'Field'], ['split', 'Split'], ['lens', 'Lens']] as const).map(([e, label]) => (
            <button
              key={e}
              onClick={() => setEmphasis(e)}
              title={`Favor the ${label}`}
              className={['px-2 h-5 rounded-md text-[10px] font-medium leading-none transition-colors',
                emphasis === e ? 'bg-game-primary/25 text-game-text' : 'text-game-text-dim hover:text-game-text'].join(' ')}
            >{label}</button>
          ))}
        </div>
      </div>

      {panel === 'quests'
        ? <QuestJournal onClose={() => setPanel(null)} onGoto={gotoQuest} />
        : panel === 'town'
        ? <Town onClose={() => setPanel(null)} />
        : panel && <GlobalOverlay panel={panel} onClose={() => setPanel(null)} onExit={exitProto} />}
    </div>
  )
}
