import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, MeasuringStrategy, useSensor, useSensors,
  useDraggable, useDroppable, type CollisionDetection, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  useGameStore, getDerivedStats, getInitials, type Unit, type Location,
} from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'

// ─────────────────────────────────────────────────────────────────────────────
// THE WAR TABLE — a Fire-Emblem-Awakening-flavoured tactician's command view.
//
// A prototype overhaul that abandons tab-switching: the overworld, the live
// battlefield, the hero roster, and a campaign summary all share one screen so
// the player commands the whole campaign from a single "war table". The left
// half is the THEATER (overworld board on top, the watched battlefield below);
// the right half is the COMMAND panel (tactician's assessment + roster + a
// deploy bar).
//
// Deploy is the real, satisfying lever: drag a hero straight onto a front, or
// muster a squad (tap to select) and tap-deploy from the bar. Either way it's
// genuine assignUnits — "deploy units across the world."
// ─────────────────────────────────────────────────────────────────────────────

// World-page grid layout, mirrored from Map.tsx so the board reads the same.
const WORLD_GRID = { cols: 12, rows: 8 }
const LOCATION_COORDS: Record<string, [number, number]> = {
  'geffen-city': [2, 3], 'elite-four': [2, 2], 'geffen-field-1': [3, 3],
  'prontera-field-1': [4, 3], 'prontera-city': [5, 3], 'prontera-field-3': [6, 3],
  'harpy-roost': [7, 3], 'boar-meadow': [6, 4], 'wolf-den': [7, 4],
  'prontera-field-2': [5, 4], 'beach-1': [5, 5],
  'pg-guardian-stand': [8, 2], 'pg-veiled-approach': [9, 2], 'pg-wolf-pack': [10, 2],
  'pg-threat-trial': [11, 2], 'pg-divided-hall': [8, 3], 'pg-ravine': [9, 3],
  'pg-slime-huddle': [10, 3], 'pg-bottleneck': [8, 5], 'pg-serpentine': [9, 5],
  'pg-pillared-hall': [10, 5], 'pg-moat': [8, 6], 'pg-overgrown-maze': [9, 6],
  'pg-elemental-circle': [10, 6], 'ember-hollow': [7, 7], 'cinder-dunes': [8, 7],
  'hollow-barrow': [9, 7], 'irradiated-marsh': [10, 7],
}

// Terrain glyph by trait (matches Map.tsx's kind icons).
const KIND_ICON: { trait: string; symbol: string }[] = [
  { trait: 'dungeon', symbol: '◆' }, { trait: 'arena', symbol: '⚔' },
  { trait: 'city', symbol: '⌂' }, { trait: 'mountain', symbol: '▲' },
  { trait: 'forest', symbol: '♣' }, { trait: 'beach', symbol: '≈' },
  { trait: 'plains', symbol: '·' },
]
function terrainGlyph(traits: string[]): string {
  for (const k of KIND_ICON) if (traits.includes(k.trait)) return k.symbol
  return '◦'
}

const CLASS_ICON: Record<string, string> = {
  Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡',
}
function heroGlyph(u: Unit): string {
  return (u.class && CLASS_ICON[u.class]) || getInitials(u.name)
}

type HeroStatus = 'down' | 'resting' | 'idle' | 'deployed'
function heroStatus(u: Unit): HeroStatus {
  if (u.recoveryTicksLeft > 0) return 'down'
  if (u.isResting) return 'resting'
  return u.locationId ? 'deployed' : 'idle'
}
const STATUS_META: Record<HeroStatus, { label: string; dot: string; text: string }> = {
  down:     { label: 'DOWN',     dot: 'bg-purple-500', text: 'text-purple-300' },
  resting:  { label: 'RESTING',  dot: 'bg-sky-500',    text: 'text-sky-300' },
  idle:     { label: 'RESERVE',  dot: 'bg-game-muted', text: 'text-game-text-dim' },
  deployed: { label: 'DEPLOYED', dot: 'bg-game-green', text: 'text-game-green' },
}

function hpColor(pct: number): string {
  return pct > 60 ? 'bg-game-green' : pct > 30 ? 'bg-game-gold' : 'bg-red-500'
}

// Node discs sit tight enough to overlap on the board, so the stock pointerWithin
// resolves ties by registration order (the wrong neighbour stole drops). Pick the
// pointer-containing droppable whose CENTRE is nearest the pointer instead — exact
// for an overlapping node grid — falling back to closestCenter when the pointer is
// off every disc.
const nodeCollision: CollisionDetection = (args) => {
  const { droppableContainers, droppableRects, pointerCoordinates } = args
  if (!pointerCoordinates) return closestCenter(args)
  let best: { id: string | number } | null = null
  let bestD = Infinity
  for (const c of droppableContainers) {
    const r = droppableRects.get(c.id)
    if (!r) continue
    const inside = pointerCoordinates.x >= r.left && pointerCoordinates.x <= r.left + r.width
      && pointerCoordinates.y >= r.top && pointerCoordinates.y <= r.top + r.height
    if (!inside) continue
    const d = Math.hypot(pointerCoordinates.x - (r.left + r.width / 2), pointerCoordinates.y - (r.top + r.height / 2))
    if (d < bestD) { bestD = d; best = c }
  }
  return best ? [{ id: best.id }] : []
}

// Per-location live-battle digest read off the engine state.
type Battles = ReturnType<typeof useGameStore.getState>['battles']
interface FrontInfo { allies: number; foes: number; live: boolean; round: number }
function frontInfo(battle: Battles[string] | undefined): FrontInfo {
  if (!battle) return { allies: 0, foes: 0, live: false, round: 0 }
  let allies = 0, foes = 0
  for (const c of battle.combatants) {
    if (!c.alive) continue
    if (c.team === 'player') allies++; else foes++
  }
  return { allies, foes, live: allies > 0 && foes > 0, round: Math.floor(battle.round / (battle.timeScale || 1)) }
}

// ── Tap-or-drag (mirrors Units.tsx): a roster card both toggles selection on a
// tap and is draggable past 5px — the two are mutually exclusive. ─────────────--
function useTapDraggable(
  args: { id: string; data: Record<string, unknown> },
  onTap: () => void,
) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable(args)
  const down = useRef<{ x: number; y: number } | null>(null)
  const dndDown = (listeners as { onPointerDown?: (e: ReactPointerEvent) => void } | undefined)?.onPointerDown
  const handlers = {
    ...attributes,
    onPointerDown: (e: ReactPointerEvent) => { down.current = { x: e.clientX, y: e.clientY }; dndDown?.(e) },
    onPointerUp: (e: ReactPointerEvent) => {
      const d = down.current; down.current = null
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) onTap()
    },
  }
  return { setNodeRef, handlers, isDragging }
}

// ── Overworld board ───────────────────────────────────────────────────────────

function LocationNode({ loc, party, front, isSel, dragging, flash, onSelect }: {
  loc: Location; party: Unit[]; front: FrontInfo; isSel: boolean
  dragging: boolean; flash: number; onSelect: () => void
}) {
  const drop = useDroppable({ id: `front:${loc.id}`, data: { locId: loc.id } })
  const [col, row] = LOCATION_COORDS[loc.id]
  const left = ((col + 0.5) / WORLD_GRID.cols) * 100
  const top  = ((row + 0.5) / WORLD_GRID.rows) * 100
  const hasHeroes = party.length > 0
  const live = front.live
  const over = drop.isOver

  const ring = over
    ? 'border-game-accent ring-2 ring-game-accent'
    : isSel
    ? 'border-game-accent ring-2 ring-game-accent/60'
    : live
    ? 'border-red-500'
    : hasHeroes
    ? 'border-game-green/70'
    : 'border-game-border'
  const fill = over ? 'bg-game-accent/30'
    : live ? 'bg-red-950/60'
    : hasHeroes ? 'bg-emerald-950/50'
    : 'bg-game-surface/80'
  const anim = live ? 'animate-war-pulse' : dragging && !hasHeroes ? 'animate-war-beacon' : ''
  const showLabel = isSel || hasHeroes || live

  // The button (= droppable) is the disc itself, centred exactly on the grid
  // point; the label floats absolutely below so it never nudges the drop target
  // off-centre (which made adjacent fronts steal the drop).
  return (
    <button
      ref={drop.setNodeRef}
      onClick={onSelect}
      title={loc.name}
      key={flash}  /* remount on deploy → replays the land animation */
      className={[
        'absolute w-9 h-9 rounded-full border flex items-center justify-center text-base leading-none',
        ring, fill, anim, isSel || over ? 'scale-110' : '',
        flash ? 'animate-war-land' : '',
      ].join(' ')}
      // Centre the disc on the grid point with negative margins, NOT a CSS
      // transform — dnd-kit measures a droppable's pre-transform layout box, so a
      // translate-based centre would offset every drop target by half a disc.
      style={{ left: `${left}%`, top: `${top}%`, marginLeft: '-1.125rem', marginTop: '-1.125rem' }}
    >
      <span className="text-game-text-dim drop-shadow pointer-events-none">{terrainGlyph(loc.traits)}</span>
      {hasHeroes && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-game-green text-[9px] font-bold text-game-bg flex items-center justify-center ring-1 ring-game-bg pointer-events-none">
          {party.length}
        </span>
      )}
      {live && <span className="absolute -bottom-1 -left-1 text-[9px] leading-none pointer-events-none">⚔️</span>}
      {showLabel && (
        <span
          className={[
            'absolute top-full mt-1 left-1/2 -translate-x-1/2 max-w-[78px] truncate text-[9px] leading-tight tracking-wide px-1 rounded pointer-events-none',
            isSel ? 'text-game-accent bg-game-bg/70' : live ? 'text-red-300' : 'text-game-text-dim',
          ].join(' ')}
        >
          {loc.name}
        </span>
      )}
    </button>
  )
}

function Overworld({ locations, dragging, flash }: {
  locations: Location[]; dragging: boolean; flash: { id: string; nonce: number } | null
}) {
  const units            = useGameStore((s) => s.units)
  const battles          = useGameStore((s) => s.battles)
  const selectedLocation = useGameStore((s) => s.selectedLocationId)
  const setSelectedLoc   = useGameStore((s) => s.setSelectedLocation)

  const nodes = locations.filter((l) => LOCATION_COORDS[l.id])

  const edges = useMemo(() => {
    const seen = new Set<string>()
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const l of nodes) {
      const a = LOCATION_COORDS[l.id]
      for (const cId of l.connections ?? []) {
        const b = LOCATION_COORDS[cId]
        if (!b) continue
        const key = [l.id, cId].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        segs.push({
          x1: ((a[0] + 0.5) / WORLD_GRID.cols) * 100, y1: ((a[1] + 0.5) / WORLD_GRID.rows) * 100,
          x2: ((b[0] + 0.5) / WORLD_GRID.cols) * 100, y2: ((b[1] + 0.5) / WORLD_GRID.rows) * 100,
        })
      }
    }
    return segs
  }, [nodes])

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg border border-game-border bg-[radial-gradient(ellipse_at_30%_20%,rgba(99,102,241,0.10),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(34,211,238,0.08),transparent_55%)] bg-game-bg">
      <div
        className="absolute inset-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.25) 1px, transparent 1px)',
          backgroundSize: `${100 / WORLD_GRID.cols}% ${100 / WORLD_GRID.rows}%`,
        }}
      />
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke="rgba(148,163,184,0.28)" strokeWidth={0.4} strokeDasharray="1.4 1.4" />
        ))}
      </svg>

      {nodes.map((loc) => (
        <LocationNode
          key={loc.id}
          loc={loc}
          party={units.filter((u) => u.locationId === loc.id)}
          front={frontInfo(battles[loc.id])}
          isSel={selectedLocation === loc.id}
          dragging={dragging}
          flash={flash?.id === loc.id ? flash.nonce : 0}
          onSelect={() => setSelectedLoc(selectedLocation === loc.id ? null : loc.id)}
        />
      ))}

      <div className="absolute top-2 right-2 flex flex-col gap-1 text-[9px] text-game-text-dim bg-game-bg/70 backdrop-blur px-2 py-1.5 rounded border border-game-border">
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Active front</span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-game-green inline-block" /> Garrisoned</span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-game-accent inline-block" /> Selected</span>
      </div>

      {dragging && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-game-accent bg-game-bg/80 px-2.5 py-1 rounded-full border border-game-accent/40 animate-pulse">
          Drop on a front to deploy
        </div>
      )}
    </div>
  )
}

// ── Roster (command cards) ─────────────────────────────────────────────────────

function RosterCard({ unit }: { unit: Unit }) {
  const equipment       = useGameStore((s) => s.equipment)
  const locations       = useGameStore((s) => s.locations)
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)
  const toggleSelect    = useGameStore((s) => s.toggleSelectUnit)

  const selected = selectedUnitIds.includes(unit.id)
  const { setNodeRef, handlers, isDragging } = useTapDraggable(
    { id: `hero:${unit.id}`, data: { unitId: unit.id } },
    () => toggleSelect(unit.id),
  )

  const ds       = getDerivedStats(unit, equipment)
  const hpPct    = Math.max(0, Math.min(100, (unit.health / ds.maxHp) * 100))
  const status   = heroStatus(unit)
  const meta     = STATUS_META[status]
  const locName  = unit.locationId ? (locations.find((l) => l.id === unit.locationId)?.name ?? '—') : 'Guild Hall'
  const bleeding = status !== 'down' && hpPct <= 30

  return (
    <div
      ref={setNodeRef}
      {...handlers}
      style={{ touchAction: 'none' as const, opacity: isDragging ? 0.4 : 1 }}
      className={[
        'w-full text-left rounded-lg border px-2.5 py-2 transition-colors flex items-center gap-2.5 cursor-grab active:cursor-grabbing select-none',
        selected
          ? 'border-game-accent bg-game-accent/10 ring-1 ring-game-accent/50'
          : 'border-game-border bg-game-surface/70 hover:border-game-primary/60',
      ].join(' ')}
    >
      <span
        className={[
          'shrink-0 w-9 h-9 rounded-md border flex items-center justify-center text-lg bg-game-bg/60',
          bleeding ? 'border-red-500/70 animate-pulse' : 'border-game-border',
        ].join(' ')}
      >
        {heroGlyph(unit)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold text-game-text">{unit.name}</span>
          <span className="text-[10px] text-game-muted shrink-0">Lv{unit.level}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={`flex items-center gap-1 ${meta.text}`}>
            <i className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />{meta.label}
          </span>
          <span className="text-game-muted truncate">· {locName}</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-game-bg/80 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${hpColor(hpPct)}`} style={{ width: `${hpPct}%` }} />
        </div>
      </div>
      <div className="shrink-0 text-right text-[9px] leading-tight text-game-text-dim tabular-nums">
        <div>ATK {ds.attack}</div>
        <div>DEF {ds.defense}</div>
        <div>SPD {ds.attackSpeed}</div>
      </div>
    </div>
  )
}

// Floating chip shown under the cursor while dragging a hero.
function DragChip({ unit, squad }: { unit: Unit; squad: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-game-accent bg-game-surface px-2.5 py-1.5 shadow-xl shadow-black/50 ring-2 ring-game-accent/40 cursor-grabbing">
      <span className="w-8 h-8 rounded-md border border-game-border bg-game-bg/60 flex items-center justify-center text-lg">
        {heroGlyph(unit)}
      </span>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-game-text">{unit.name.split(' ')[0]}</div>
        <div className="text-[9px] text-game-accent">{squad > 1 ? `+${squad - 1} more → deploy` : 'deploy ▸'}</div>
      </div>
    </div>
  )
}

// ── Tactician's assessment (campaign summary) ──────────────────────────────────

function Assessment() {
  const units         = useGameStore((s) => s.units)
  const battles       = useGameStore((s) => s.battles)
  const locations     = useGameStore((s) => s.locations)
  const locationStats = useGameStore((s) => s.locationStats)

  const counts = useMemo(() => {
    const c = { total: units.length, deployed: 0, idle: 0, recovering: 0 }
    for (const u of units) {
      const s = heroStatus(u)
      if (s === 'deployed') c.deployed++
      else if (s === 'idle') c.idle++
      else c.recovering++
    }
    return c
  }, [units])

  const fronts = useMemo(() => {
    return locations
      .map((l) => {
        const party = units.filter((u) => u.locationId === l.id)
        if (party.length === 0) return null
        const front = frontInfo(battles[l.id])
        return { id: l.id, name: l.name, heroes: party.length, live: front.live, foes: front.foes, round: front.round }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => Number(b.live) - Number(a.live) || b.heroes - a.heroes)
  }, [locations, units, battles])

  const totals = useMemo(() => {
    let gold = 0, kills = 0
    for (const s of Object.values(locationStats)) {
      gold += s.goldEarned
      for (const n of Object.values(s.monstersDefeated)) kills += n
    }
    return { gold, kills, activeFronts: fronts.filter((f) => f.live).length }
  }, [locationStats, fronts])

  const tile = (label: string, value: number | string, tone = 'text-game-text') => (
    <div className="rounded-md border border-game-border bg-game-bg/50 px-2 py-1.5 text-center">
      <div className={`text-lg font-bold leading-none tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-game-muted">{label}</div>
    </div>
  )

  return (
    <div className="rounded-lg border border-game-border bg-game-surface/60 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-game-accent">❖</span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-game-text-dim">Tactician's Assessment</h3>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {tile('Heroes', counts.total)}
        {tile('Deployed', counts.deployed, 'text-game-green')}
        {tile('Reserve', counts.idle, 'text-game-text-dim')}
        {tile('Mending', counts.recovering, 'text-purple-300')}
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-1.5">
        {tile('Fronts', totals.activeFronts, totals.activeFronts > 0 ? 'text-red-400' : 'text-game-muted')}
        {tile('Gold', totals.gold, 'text-game-gold')}
        {tile('Kills', totals.kills, 'text-game-accent')}
      </div>

      <div className="mt-2.5">
        <div className="text-[9px] uppercase tracking-wider text-game-muted mb-1">Front Lines</div>
        {fronts.length === 0 ? (
          <div className="text-[11px] italic text-game-muted py-1">No squads deployed. Drag a hero onto a front.</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-0.5">
            {fronts.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-[11px] rounded border border-game-border/60 bg-game-bg/40 px-2 py-1">
                <span className={`w-1.5 h-1.5 rounded-full ${f.live ? 'bg-red-500 animate-pulse' : 'bg-game-green'}`} />
                <span className="flex-1 truncate text-game-text-dim">{f.name}</span>
                <span className="text-game-muted">{f.heroes} hero{f.heroes > 1 ? 'es' : ''}</span>
                {f.live && <span className="text-red-400">· {f.foes} foe{f.foes > 1 ? 's' : ''}</span>}
                {f.live && <span className="text-game-muted tabular-nums">R{f.round}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Deploy bar (the real lever: send selected heroes to the selected front) ─────

function DeployBar({ deploy }: { deploy: (ids: string[], locId: string | null) => void }) {
  const units            = useGameStore((s) => s.units)
  const locations        = useGameStore((s) => s.locations)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const selectedLocation = useGameStore((s) => s.selectedLocationId)
  const clearSelection   = useGameStore((s) => s.clearSelection)

  const selected = units.filter((u) => selectedUnitIds.includes(u.id))
  const target   = locations.find((l) => l.id === selectedLocation) ?? null
  const canDeploy = selected.length > 0 && !!target

  return (
    <div className="rounded-lg border border-game-border bg-game-surface/90 p-2.5">
      {selected.length === 0 ? (
        <div className="text-[11px] text-game-muted text-center py-1.5">
          Drag a hero onto a front — or tap heroes to muster a squad, then deploy.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-game-muted">Squad ({selected.length})</span>
            {selected.map((u) => (
              <span key={u.id} className="text-[10px] px-1.5 py-0.5 rounded bg-game-accent/15 border border-game-accent/40 text-game-accent">
                {heroGlyph(u)} {u.name.split(' ')[0]}
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              disabled={!canDeploy}
              onClick={() => target && deploy(selectedUnitIds, target.id)}
              className={[
                'flex-1 rounded-md py-2 text-sm font-semibold transition-colors',
                canDeploy
                  ? 'bg-game-primary hover:bg-indigo-500 text-white'
                  : 'bg-game-border/50 text-game-muted cursor-not-allowed',
              ].join(' ')}
            >
              {target ? `Deploy ▸ ${target.name}` : 'Select a front ▸'}
            </button>
            <button
              onClick={() => deploy(selectedUnitIds, null)}
              className="rounded-md px-3 py-2 text-sm font-medium border border-game-border text-game-text-dim hover:border-game-primary/60"
              title="Recall to the Guild Hall"
            >
              Recall
            </button>
            <button
              onClick={clearSelection}
              className="rounded-md px-3 py-2 text-sm font-medium border border-game-border text-game-muted hover:text-game-text-dim"
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── The Battlefield stage ───────────────────────────────────────────────────────

function BattlefieldStage() {
  const selectedLocation = useGameStore((s) => s.selectedLocationId)
  const locations        = useGameStore((s) => s.locations)
  const battles          = useGameStore((s) => s.battles)
  const location = locations.find((l) => l.id === selectedLocation) ?? null
  const front = frontInfo(selectedLocation ? battles[selectedLocation] : undefined)

  return (
    <div className="relative flex-1 min-h-0 flex flex-col rounded-lg border border-game-border bg-game-bg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-game-border bg-game-surface/70 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-game-accent text-sm">▣</span>
          <span className="text-xs font-semibold uppercase tracking-widest text-game-text-dim truncate">
            {location ? location.name : 'Battlefield'}
          </span>
        </div>
        {front.live ? (
          <span className="text-[10px] text-red-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> ENGAGED · {front.allies}v{front.foes} · R{front.round}
          </span>
        ) : (
          <span className="text-[10px] text-game-muted">{location ? 'standing by' : 'no front selected'}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {location ? (
          <BattleView locationId={location.id} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-game-muted text-xs px-6">
            Select a front on the overworld to watch the engagement.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────--

export function WarTable() {
  const units            = useGameStore((s) => s.units)
  const locations        = useGameStore((s) => s.locations)
  const assignUnits      = useGameStore((s) => s.assignUnits)
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const setSelectedLoc   = useGameStore((s) => s.setSelectedLocation)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [dragUnit, setDragUnit] = useState<Unit | null>(null)
  const [flash, setFlash] = useState<{ id: string; nonce: number } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The single deploy chokepoint: order the move + fire the satisfying landing
  // flash on the destination node.
  function deploy(ids: string[], locId: string | null) {
    assignUnits(ids, locId)
    if (locId) {
      setSelectedLoc(locId)
      setFlash({ id: locId, nonce: Date.now() })
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setFlash(null), 750)
    }
  }

  const roster = useMemo(() => {
    const order: Record<HeroStatus, number> = { down: 0, resting: 1, deployed: 2, idle: 3 }
    return [...units].sort((a, b) => order[heroStatus(a)] - order[heroStatus(b)] || b.level - a.level)
  }, [units])

  function onDragStart(e: DragStartEvent) {
    const id = (e.active.data.current as { unitId?: string } | undefined)?.unitId
    setDragUnit(units.find((u) => u.id === id) ?? null)
  }
  function onDragEnd(e: DragEndEvent) {
    setDragUnit(null)
    const unitId = (e.active.data.current as { unitId?: string } | undefined)?.unitId
    const locId  = (e.over?.data.current as { locId?: string } | undefined)?.locId
    if (!unitId || !locId) return
    // Dragging a hero that's part of the mustered squad sends the whole squad;
    // dragging a loose hero sends just that one.
    const ids = selectedUnitIds.includes(unitId) ? selectedUnitIds : [unitId]
    deploy(ids, locId)
  }

  // Drag-squad size for the floating chip count.
  const squadSize = dragUnit && selectedUnitIds.includes(dragUnit.id) ? selectedUnitIds.length : 1

  return (
    <DndContext sensors={sensors} collisionDetection={nodeCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragUnit(null)}>
      <div className="h-full flex flex-col animate-war-rise">
        {/* ── Banner ── */}
        <header className="shrink-0 px-3 py-2 border-b border-game-border bg-gradient-to-r from-game-surface via-game-bg to-game-surface flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">⚔️</span>
            <div className="min-w-0">
              <h1
                className="text-base sm:text-lg font-black tracking-[0.2em] uppercase bg-clip-text text-transparent bg-[linear-gradient(110deg,#e2e8f0,45%,#22d3ee,55%,#e2e8f0)] bg-[length:250%_100%]"
                style={{ animation: 'war-sheen 6s linear infinite' }}
              >
                The War Table
              </h1>
              <p className="text-[10px] text-game-muted tracking-wide -mt-0.5">Tactician's Command · prototype</p>
            </div>
          </div>
          <span className="text-[10px] text-game-text-dim text-right hidden sm:block leading-tight">
            Overworld · Battlefield · Roster<br />all in one command screen
          </span>
        </header>

        {/* ── Body: Theater | Command ── */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2 p-2 overflow-y-auto lg:overflow-hidden">
          {/* THEATER */}
          <section className="flex flex-col gap-2 lg:flex-[1.5] lg:min-h-0 min-w-0">
            <div className="h-[240px] lg:h-[46%] shrink-0">
              <Overworld locations={locations} dragging={!!dragUnit} flash={flash} />
            </div>
            <div className="flex flex-col min-h-[340px] lg:min-h-0 lg:flex-1">
              <BattlefieldStage />
            </div>
          </section>

          {/* COMMAND */}
          <aside className="flex flex-col gap-2 lg:w-[360px] shrink-0 lg:min-h-0">
            <Assessment />
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-game-text-dim">Roster</h3>
              <span className="text-[10px] text-game-muted">drag onto a front ▸</span>
            </div>
            <div className="lg:flex-1 lg:min-h-[120px] lg:overflow-y-auto flex flex-col gap-1.5 pr-0.5">
              {roster.map((u) => <RosterCard key={u.id} unit={u} />)}
            </div>
            <DeployBar deploy={deploy} />
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragUnit ? <DragChip unit={dragUnit} squad={squadSize} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
