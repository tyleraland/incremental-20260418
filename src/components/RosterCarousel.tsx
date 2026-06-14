import { useEffect, useRef, useState } from 'react'
import { useGameStore, getDerivedStats, getInitials, type Unit } from '@/stores/useGameStore'

// Horizontal hero roster strip, pinned at the top of the Map tab in both the
// overworld and battle drop-in views so unit selection stays available and the
// transition between the two feels seamless. It's the *only* roster: in the
// overworld it shows everyone; dropped into a battle it scopes itself to the
// heroes on that battlefield and takes over the camera-follow job (tap a hero to
// lock the "Diablo cam" onto them) — there's no separate in-battle strip.

// Class → portrait glyph (mirrors BattleView's chip glyphs). Falls back to the
// unit's initials when the class has no icon.
const CLASS_ICON: Record<string, string> = {
  Fighter: '⚔',
  Ranger:  '🏹',
  Mage:    '✦',
  Cleric:  '✚',
  Rogue:   '🗡',
}

function portraitGlyph(unit: Unit): string {
  if (unit.class && CLASS_ICON[unit.class]) return CLASS_ICON[unit.class]
  return getInitials(unit.name)
}

type SortMode = 'name' | 'class' | 'level' | 'attention' | 'location'
type SortDir  = 'asc' | 'desc'
const SORT_ORDER: SortMode[] = ['attention', 'name', 'class', 'level', 'location']
const SORT_META: Record<SortMode, { icon: string; label: string; defaultDir: SortDir }> = {
  name:      { icon: 'A', label: 'Name',   defaultDir: 'asc'  },
  class:     { icon: '◆', label: 'Class',  defaultDir: 'asc'  },
  level:     { icon: '⬆', label: 'Level',  defaultDir: 'desc' },
  attention: { icon: '!', label: 'To-do',  defaultDir: 'asc'  },
  location:  { icon: '⌖', label: 'Area',   defaultDir: 'asc'  },
}

// Human-readable description of each mode's two directions, for the menu.
function dirLabel(mode: SortMode, dir: SortDir): string {
  switch (mode) {
    case 'name':
    case 'class':     return dir === 'asc' ? 'A→Z' : 'Z→A'
    case 'level':     return dir === 'asc' ? 'Low→High' : 'High→Low'
    case 'attention': return dir === 'asc' ? 'To-do first' : 'To-do last'
    case 'location':  return dir === 'asc' ? 'Grouped' : 'Reversed'
  }
}

// A unit "needs attention" when it has a visible (!) dot: unspent ability/skill
// points, or it leveled up since the player last opened its detail page.
function needsAttention(unit: Unit, viewedLevels: Record<string, number>): boolean {
  const viewed = viewedLevels[unit.id]
  return unit.abilityPoints > 0 || unit.skillPoints > 0 || (viewed !== undefined && unit.level > viewed)
}

// Ascending comparator per mode; direction is applied by the caller.
function ascCompare(mode: SortMode, a: Unit, b: Unit, viewedLevels: Record<string, number>): number {
  switch (mode) {
    case 'name':   return a.name.localeCompare(b.name)
    case 'class':  return (a.class ?? '').localeCompare(b.class ?? '') || a.name.localeCompare(b.name)
    case 'level':  return a.level - b.level
    case 'attention': {
      // To-do units sort first (rank 0); name breaks ties.
      const ra = needsAttention(a, viewedLevels) ? 0 : 1
      const rb = needsAttention(b, viewedLevels) ? 0 : 1
      return (ra - rb) || a.name.localeCompare(b.name)
    }
    case 'location': return a.name.localeCompare(b.name) // grouped view renders separately
  }
}

// Group heroes by their assigned location for the experimental "Area" view.
// Groups follow the game's location order; unassigned heroes trail at the end.
function buildLocationGroups(
  units: Unit[], locations: { id: string; name: string }[], dir: SortDir,
): { id: string; name: string; units: Unit[] }[] {
  const byLoc = new Map<string, Unit[]>()
  for (const u of units) {
    const k = u.locationId ?? '__none__'
    const arr = byLoc.get(k); if (arr) arr.push(u); else byLoc.set(k, [u])
  }
  const byName = (a: Unit, b: Unit) => a.name.localeCompare(b.name)
  const groups = locations
    .filter((l) => byLoc.has(l.id))
    .map((l) => ({ id: l.id, name: l.name, units: byLoc.get(l.id)!.slice().sort(byName) }))
  const none = byLoc.get('__none__')
  if (none) groups.push({ id: '__none__', name: 'Unassigned', units: none.slice().sort(byName) })
  if (dir === 'desc') groups.reverse()
  return groups
}

// Portrait ring colour conveys status at a glance (selection wins). Shared by
// the full roster card and the grouped portrait view.
function portraitTone(unit: Unit, isSelected: boolean): string {
  if (isSelected) return 'border-game-primary bg-game-primary/30 text-white'
  if (unit.recoveryTicksLeft > 0) return 'border-purple-500/70 bg-purple-500/10 text-purple-300'
  if (unit.isResting) return 'border-sky-500/70 bg-sky-500/10 text-sky-300'
  if (unit.locationId) return 'border-game-green/60 bg-game-green/10 text-game-text'
  return 'border-game-border bg-game-surface text-game-text'
}

// Single tap toggles selection; double-tap (within 300 ms) pops back to the
// overworld framed on the unit's location — mirrors the location double-tap.
// In battle mode a single tap *also* locks the camera onto that hero (and
// tapping the followed hero again releases back to the whole-party auto-fit),
// so the roster doubles as the follow control the old bottom strip used to be.
function useUnitTap(unitId: string): () => void {
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const showUnitOnMap    = useGameStore((s) => s.showUnitOnMap)
  const setBattleFollow  = useGameStore((s) => s.setBattleFollow)
  const lastTapRef = useRef(0)
  return () => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) { lastTapRef.current = 0; showUnitOnMap(unitId); return }
    lastTapRef.current = now
    const s = useGameStore.getState()
    const inBattle = s.mapMode === 'battle' && !!s.combatLocationId
    if (inBattle) {
      // Lock the camera onto a hero as it's selected; tapping the followed hero
      // back off releases to the whole-party auto-fit.
      if (s.selectedUnitIds.includes(unitId)) {
        if (s.battleFollowId === unitId) setBattleFollow(null)
      } else {
        setBattleFollow(unitId)
      }
    }
    toggleSelectUnit(unitId)
  }
}

function sortUnits(units: Unit[], mode: SortMode, dir: SortDir, viewedLevels: Record<string, number>): Unit[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...units].sort((a, b) => sign * ascCompare(mode, a, b, viewedLevels))
}

function RosterUnitCard({ unit, battleMode }: { unit: Unit; battleMode: boolean }) {
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const viewedLevels     = useGameStore((s) => s.viewedUnitLevels)
  const equipment        = useGameStore((s) => s.equipment)
  const battleFollowId   = useGameStore((s) => s.battleFollowId)
  const selOrder         = selectedUnitIds.indexOf(unit.id) // -1 if unselected
  const isSelected       = selOrder >= 0
  const isPrimary        = selOrder === 0                   // the 1st-selected drives detail panels
  const isFollowed       = battleMode && battleFollowId === unit.id
  const attention        = needsAttention(unit, viewedLevels)
  const handleTap        = useUnitTap(unit.id)
  const isRecovering = unit.recoveryTicksLeft > 0
  const isResting    = unit.isResting
  // Battle mode shows a live HP bar so the roster reads as the party readout the
  // old bottom strip provided. health is synced back from the engine each tick.
  const hpRatio = Math.max(0, Math.min(1, unit.health / getDerivedStats(unit, equipment).maxHp))
  // An alive hero bleeding out mid-fight gets a pulsing red ring so your eye
  // snaps to whoever needs help — only while actually in the fight (not KO/rest).
  const inDanger = battleMode && unit.health > 0 && !isRecovering && !isResting && hpRatio <= 0.3
  // Explicit status flag for the non-ready states; ready units stay uncluttered.
  const statusBadge = isRecovering
    ? { text: 'KO', tone: 'bg-purple-600 text-white' }
    : isResting
      ? { text: 'Rest', tone: 'bg-sky-600 text-white' }
      : null

  const tone = portraitTone(unit, isSelected)

  return (
    <button
      onClick={handleTap}
      className={[
        'shrink-0 w-[4.5rem] flex flex-col items-center gap-1 px-1 py-1.5 border-b border-r select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isFollowed
          ? 'border-emerald-400/70 bg-emerald-950/30 ring-1 ring-inset ring-emerald-400 shadow-lg shadow-emerald-500/20'
          : isPrimary
            ? 'border-game-primary bg-game-primary/25 ring-1 ring-inset ring-game-primary'
            : isSelected
              ? 'border-game-primary bg-game-primary/15'
              : 'border-game-border bg-game-surface hover:bg-white/5',
      ].join(' ')}
    >
      {/* Portrait (class icon) with a level badge corner. */}
      <div className="relative">
        <span
          className={[
            'w-11 h-11 rounded-lg flex items-center justify-center text-xl border-2',
            tone,
          ].join(' ')}
        >
          {portraitGlyph(unit)}
        </span>
        {/* Critical-HP pulse: a red ring riding the portrait while a hero is
            bleeding out in the live fight. */}
        {inDanger && (
          <span className="absolute -inset-0.5 rounded-lg ring-2 ring-red-500/80 animate-pulse pointer-events-none" />
        )}
        <span className="absolute -top-1 -left-1 flex items-center gap-1 max-w-[3.5rem] px-1 rounded-full bg-game-bg/90 border border-game-border leading-tight">
          <span className="text-[10px] font-bold text-game-text-dim">{unit.level}</span>
          {unit.class && <span className="text-[8px] text-game-text-dim truncate">{unit.class}</span>}
        </span>
        {statusBadge && (
          <span className={`absolute -top-1 -right-1 px-1 rounded-full text-[7px] font-bold leading-tight ${statusBadge.tone}`}>
            {statusBadge.text}
          </span>
        )}
        {/* Attention dot: unspent points or an unseen level-up — a gentle red
            corner dot rather than a pulsing badge. */}
        {attention && (
          <span className="absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full bg-red-500/80 border border-game-bg" />
        )}
        {/* Selection-order badge; the 1st-selected (primary) is set apart. In
            battle, the hero the camera is locked onto shows a ⊙ "watching"
            marker instead of its order number. */}
        {isSelected && (
          <span
            className={[
              'absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border',
              isFollowed
                ? 'bg-emerald-400 text-black border-emerald-200'
                : isPrimary
                  ? 'bg-game-gold text-black border-game-gold'
                  : 'bg-game-primary text-white border-game-primary',
            ].join(' ')}
          >
            {isFollowed ? '⊙' : selOrder + 1}
          </span>
        )}
      </div>
      {/* Name on the bottom. */}
      <div className="w-full text-[10px] font-semibold leading-tight text-center truncate text-game-text">
        {unit.name}
      </div>
      {/* Battle mode: a live HP bar so the strip reads as a party readout; it
          eases down with the hit (matching the arena bars) rather than snapping. */}
      {battleMode && (
        <span className="block w-full h-1 rounded-sm bg-black/50 overflow-hidden">
          <span
            className={`block h-full ${hpRatio >= 0.75 ? 'bg-game-green' : hpRatio >= 0.4 ? 'bg-game-gold' : 'bg-red-500'}`}
            style={{ width: `${hpRatio * 100}%`, transition: 'width 380ms linear' }}
          />
        </span>
      )}
    </button>
  )
}

// Compact portrait used by the grouped "Area" view — portrait-forward, with a
// small name beneath, so the location grouping reads as the primary structure.
function GroupPortrait({ unit }: { unit: Unit }) {
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)
  const viewedLevels    = useGameStore((s) => s.viewedUnitLevels)
  const selOrder   = selectedUnitIds.indexOf(unit.id)
  const isSelected = selOrder >= 0
  const isPrimary  = selOrder === 0
  const attention  = needsAttention(unit, viewedLevels)
  const handleTap  = useUnitTap(unit.id)

  return (
    <button
      onClick={handleTap}
      title={`${unit.name} · Lv.${unit.level}`}
      className={['shrink-0 w-10 flex flex-col items-center gap-0.5 select-none', unit.health <= 0 ? 'opacity-60' : ''].join(' ')}
    >
      <div className="relative">
        <span
          className={[
            'w-10 h-10 rounded-lg flex items-center justify-center text-lg border-2',
            portraitTone(unit, isSelected),
            isPrimary ? 'ring-1 ring-inset ring-game-primary' : '',
          ].join(' ')}
        >
          {portraitGlyph(unit)}
        </span>
        {attention && (
          <span className="absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full bg-red-500/80 border border-game-bg" />
        )}
        {isSelected && (
          <span
            className={[
              'absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border',
              isPrimary ? 'bg-game-gold text-black border-game-gold' : 'bg-game-primary text-white border-game-primary',
            ].join(' ')}
          >
            {selOrder + 1}
          </span>
        )}
      </div>
      <span className="w-full text-[9px] leading-tight text-center truncate text-game-text">{unit.name}</span>
    </button>
  )
}

export function RosterCarousel({ units }: { units: Unit[] }) {
  // Default to the to-do sort so heroes with something to spend/review float to
  // the front each time the player returns.
  const [sortMode, setSortMode] = useState<SortMode>('attention')
  const [sortDir, setSortDir]   = useState<SortDir>(SORT_META['attention'].defaultDir)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const viewedLevels = useGameStore((s) => s.viewedUnitLevels)
  const locations    = useGameStore((s) => s.locations)
  const mapMode      = useGameStore((s) => s.mapMode)
  const combatLocationId = useGameStore((s) => s.combatLocationId)

  // Dropped into a battle: scope the roster to the heroes on that battlefield —
  // the same location filter the "Area" sort uses, just applied as a hard scope.
  // The whole-party "Area" grouping is moot here (one location), so render flat.
  const battleMode = mapMode === 'battle' && !!combatLocationId
  const shown = battleMode ? units.filter((u) => u.locationId === combatLocationId) : units
  const sorted = sortUnits(shown, sortMode, sortDir, viewedLevels)
  const groups = !battleMode && sortMode === 'location' ? buildLocationGroups(shown, locations, sortDir) : null
  const meta = SORT_META[sortMode]

  // Tapping a new mode selects it (its default direction) and closes the menu;
  // tapping the already-active mode flips its direction in place.
  function chooseMode(mode: SortMode) {
    if (mode === sortMode) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortMode(mode)
      setSortDir(SORT_META[mode].defaultDir)
      setMenuOpen(false)
    }
  }

  // Close the sort menu on any outside tap.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  return (
    <div className="flex items-stretch min-w-0 border-b border-game-border">
      {/* Sort button on the left — one tap opens a menu of sort options. */}
      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          title={`Sort: ${meta.label} (${dirLabel(sortMode, sortDir)})`}
          className="h-full w-7 flex flex-col items-center justify-center gap-0.5 border-b border-r border-game-border bg-game-surface text-game-text-dim hover:bg-white/5 select-none transition-colors duration-100"
        >
          <span className="text-sm leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
          <span className="text-[7px] leading-none uppercase tracking-wide">{meta.label}</span>
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 z-20 mt-px min-w-[11rem] rounded-md border border-game-border bg-game-surface shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-game-muted border-b border-game-border">Sort by</div>
            {SORT_ORDER.map((mode) => {
              const m = SORT_META[mode]
              const active = mode === sortMode
              // Active row shows the live direction; others preview their default.
              const rowDir = active ? sortDir : m.defaultDir
              return (
                <button
                  key={mode}
                  onClick={() => chooseMode(mode)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-left transition-colors duration-100',
                    active ? 'bg-game-primary/25 text-white' : 'text-game-text hover:bg-white/5',
                  ].join(' ')}
                >
                  <span className="w-4 text-center text-base leading-none">{m.icon}</span>
                  <span className="flex-1">{m.label}</span>
                  <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : 'text-game-muted'}`}>{dirLabel(mode, rowDir)}</span>
                  {active && <span className="text-game-primary text-sm">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {groups ? (
        // Experimental "Area" view: heroes clustered under their location. Each
        // area is a distinct panel with its members squished tight together, so
        // the grouping reads at a glance.
        <div className="overflow-x-auto flex-1 min-w-0">
          <div className="flex h-full w-max items-stretch gap-1.5 px-1.5 py-1">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col shrink-0 rounded-md bg-game-surface/50 border border-game-border/70 px-1.5 py-1">
                <div className="flex items-center gap-1 mb-1 max-w-[12rem]">
                  <span className="text-game-muted text-[10px] leading-none">{g.id === '__none__' ? '◌' : '⌖'}</span>
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-game-text-dim truncate">{g.name}</span>
                  <span className="text-[9px] text-game-muted">{g.units.length}</span>
                </div>
                <div className="flex gap-0">
                  {g.units.map((u) => <GroupPortrait key={u.id} unit={u} />)}
                </div>
              </div>
            ))}
            {groups.length === 0 && <div className="px-3 py-3 text-xs text-game-muted self-center">No heroes</div>}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto flex-1 min-w-0">
          {battleMode && sorted.length === 0 ? (
            <div className="px-3 py-3 text-xs text-game-muted italic">No heroes on this battlefield.</div>
          ) : (
            <div className="flex gap-px w-max">
              {sorted.map((u) => <RosterUnitCard key={u.id} unit={u} battleMode={battleMode} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
