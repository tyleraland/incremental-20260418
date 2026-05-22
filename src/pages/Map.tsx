import { useState, type ReactElement } from 'react'
import { useGameStore, MONSTER_REGISTRY, RECOVERY_TICKS, getDerivedStats, getInitials, type Unit, type Location } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'

// ── World pages (one per region) ──────────────────────────────────────────────

const GRID_W   = 5
const GRID_H   = 5
const CELL_W   = 60
const CELL_H   = 48
const GAP_PX   = 4

const INNER_W = GRID_W * CELL_W + (GRID_W - 1) * GAP_PX
const INNER_H = GRID_H * CELL_H + (GRID_H - 1) * GAP_PX

interface PageNeighbors { left?: string; right?: string; up?: string; down?: string }
interface PageDef extends PageNeighbors {
  id: string
  name: string
  // For dungeon pages: the world location used as entry. The up-arrow exits
  // to that location's region with the entry location selected. Dungeons
  // never have left/right/down neighbors.
  isDungeon?: boolean
  entryLocationId?: string
}

const PAGES: PageDef[] = [
  // Prontera is east of Geffen.
  { id: 'geffen',         name: 'Geffen Region',   right: 'prontera', down: 'kanto' },
  { id: 'prontera',       name: 'Prontera Region', left:  'geffen',   down: 'kanto' },
  { id: 'kanto',          name: 'Kanto',           up:    'prontera' },
  { id: 'geffen-dungeon', name: 'Geffen Dungeon',  isDungeon: true,   entryLocationId: 'geffen-city' },
]

const PAGE_BY_ID: Record<string, PageDef> = Object.fromEntries(PAGES.map((p) => [p.id, p]))

// Per-region (col, row) on the 3×3 grid (0-indexed). Unknown ids fall back to auto-flow.
const LOCATION_COORDS: Record<string, [number, number]> = {
  // Prontera region
  'prontera-field-1': [0, 0], 'prontera-field-2': [1, 0], 'prontera-field-3': [2, 0],
  'kings-forest':     [0, 1], 'prontera-city':    [1, 1], 'prontera-field-4': [2, 1],
  'duskwood':         [0, 2], 'prontera-field-5': [1, 2], 'prontera-field-6': [2, 2],

  // Geffen region
  'geffen-field-1': [0, 0], 'geffen-field-2': [1, 0], 'mount-mjolnir':  [2, 0],
  'geffen-field-3': [0, 1], 'geffen-city':    [1, 1], 'geffen-field-4': [2, 1],
  'geffen-field-5': [0, 2], 'geffen-field-6': [1, 2], 'geffen-field-7': [2, 2],

  // Geffen Dungeon — top row + right column (Floor 1 top-left → Floor 5 bottom-right)
  'geffen-dungeon-1': [0, 0],
  'geffen-dungeon-2': [1, 0],
  'geffen-dungeon-3': [2, 0],
  'geffen-dungeon-4': [2, 1],
  'geffen-dungeon-5': [2, 2],

  // Kanto — 9 beaches fill the 3×3
  'beach-1': [0, 0], 'beach-2': [1, 0], 'beach-3': [2, 0],
  'beach-4': [0, 1], 'beach-5': [1, 1], 'beach-6': [2, 1],
  'beach-7': [0, 2], 'beach-8': [1, 2], 'beach-9': [2, 2],
}

function hpBarColor(hp: number) {
  if (hp > 60) return 'bg-game-green'
  if (hp > 30) return 'bg-game-gold'
  return 'bg-red-500'
}

const ELEMENT_COLORS: Record<string, string> = {
  fire:      'text-orange-400 bg-orange-950/40 border-orange-800/50',
  lightning: 'text-yellow-300 bg-yellow-950/40 border-yellow-700/50',
  ice:       'text-sky-300 bg-sky-950/40 border-sky-700/50',
  earth:     'text-amber-600 bg-amber-950/40 border-amber-700/50',
  wind:      'text-green-400 bg-green-950/40 border-green-800/50',
  water:     'text-blue-400 bg-blue-950/40 border-blue-800/50',
  neutral:   'text-game-text-dim bg-game-border/20 border-game-border/50',
}

// Kind symbols for the map cells & matching trait chips.
// Priority is "biggest landmark wins" — dungeon overrides city, etc.
const LOCATION_KIND: Record<string, { symbol: string; label: string; cls: string; iconCls: string }> = {
  city:     { symbol: '⌂', label: 'City',     cls: 'text-amber-300 border-amber-700/60 bg-amber-950/40',  iconCls: 'text-amber-400/80'  },
  forest:   { symbol: '♣', label: 'Forest',   cls: 'text-green-300 border-green-800/60 bg-green-950/40',  iconCls: 'text-green-400/80'  },
  mountain: { symbol: '▲', label: 'Mountain', cls: 'text-stone-300 border-stone-700/60 bg-stone-900/50', iconCls: 'text-stone-300/80'  },
  beach:    { symbol: '≈', label: 'Beach',    cls: 'text-sky-300   border-sky-800/60   bg-sky-950/40',   iconCls: 'text-sky-300/80'    },
  dungeon:  { symbol: '◆', label: 'Dungeon',  cls: 'text-rose-300  border-rose-800/60  bg-rose-950/40',  iconCls: 'text-rose-300/80'   },
  plains:   { symbol: '·', label: 'Plains',   cls: 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30', iconCls: 'text-emerald-400/60' },
}

const KIND_PRIORITY = ['dungeon', 'city', 'mountain', 'forest', 'beach', 'plains'] as const

function getLocationKind(traits: string[]) {
  for (const k of KIND_PRIORITY) if (traits.includes(k)) return { key: k, ...LOCATION_KIND[k] }
  return null
}

// ── Terrain overlay ─────────────────────────────────────────────────────────
// Every map cell gets a biome. The overlay fills the whole grid with a biome
// color + dense small motifs so you can "squint" and read forest / grass /
// water / desert / mountain at a glance. Drawn in a 0–100 × 0–80 viewBox
// (5×5 cells of 20×16) stretched to fill the grid; the interactive cells render
// on top, translucent, so this shows through. Biome grids are [row][col].

type Biome = 'grass' | 'forest' | 'hills' | 'mountain' | 'sand' | 'water' | 'city' | 'rock'
interface RegionTerrain { grid: Biome[][]; river?: string }

const CW = 20  // cell width in viewBox units
const CH = 16  // cell height in viewBox units

// Muted base tones — colorful enough to read a biome, dark enough that the
// translucent cells, glyphs and unit dots on top stay legible.
const BIOME_RGB: Record<Biome, [number, number, number]> = {
  grass:    [40, 64, 30],
  forest:   [26, 50, 22],
  hills:    [48, 72, 34],
  mountain: [58, 57, 52],
  sand:     [98, 80, 44],
  water:    [22, 54, 86],
  city:     [48, 64, 32],
  rock:     [36, 31, 38],
}

const REGION_TERRAIN: Record<string, RegionTerrain> = {
  prontera: {
    grid: [
      ['grass',  'grass', 'grass', 'grass',  'hills'],
      ['forest', 'city',  'grass', 'grass',  'hills'],
      ['forest', 'grass', 'grass', 'grass',  'mountain'],
      ['grass',  'grass', 'grass', 'forest', 'mountain'],
      ['grass',  'forest','grass', 'grass',  'grass'],
    ],
    river: 'M -2,40 C 20,34 30,52 50,44 C 70,36 86,54 102,45',
  },
  geffen: {
    grid: [
      ['grass', 'grass', 'mountain', 'mountain', 'mountain'],
      ['hills', 'city',  'grass',    'mountain', 'mountain'],
      ['hills', 'grass', 'grass',    'forest',   'forest'],
      ['grass', 'grass', 'grass',    'forest',   'grass'],
      ['grass', 'grass', 'grass',    'grass',    'grass'],
    ],
    river: 'M 30,-2 C 36,16 24,30 34,44 C 44,56 32,66 38,82',
  },
  kanto: {
    grid: [
      ['sand',  'sand',  'sand',  'water', 'water'],
      ['sand',  'sand',  'sand',  'water', 'water'],
      ['sand',  'sand',  'sand',  'water', 'water'],
      ['sand',  'sand',  'water', 'water', 'water'],
      ['water', 'water', 'water', 'water', 'water'],
    ],
  },
  'geffen-dungeon': {
    grid: [
      ['rock',     'rock', 'rock', 'mountain', 'mountain'],
      ['rock',     'rock', 'rock', 'rock',     'mountain'],
      ['mountain', 'rock', 'rock', 'rock',     'rock'],
      ['mountain', 'rock', 'rock', 'rock',     'rock'],
      ['rock',     'rock', 'mountain', 'rock', 'rock'],
    ],
  },
}

// Deterministic 0–1 hash so motif scatter is stable across renders (no flicker).
function h2(a: number, b: number) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Per-cell base fill with a small brightness jitter so neighboring same-biome
// cells don't read as flat identical tiles.
function biomeFill(b: Biome, col: number, row: number) {
  const [r, g, bl] = BIOME_RGB[b]
  const m = 0.84 + h2(col * 3 + 1, row * 7 + 2) * 0.3
  const c = (v: number) => Math.round(Math.min(255, v * m))
  return `rgba(${c(r)},${c(g)},${c(bl)},0.92)`
}

// Dense per-biome motifs filling one cell at grid (col,row).
function cellMotifs(biome: Biome, col: number, row: number): ReactElement[] {
  const x0 = col * CW, y0 = row * CH
  const out: ReactElement[] = []
  const k = (s: string) => `${col}-${row}-${s}`
  const sx = (i: number) => x0 + 2.5 + h2(col * 9 + i, row * 5 + i * 2) * (CW - 5)
  const sy = (i: number) => y0 + 2.5 + h2(col * 4 + i * 3, row * 8 + i) * (CH - 5)

  switch (biome) {
    case 'forest': {
      // Mixed conifers + round-canopy trees, varied size, drawn back-to-front.
      const n = 7 + Math.floor(h2(col, row) * 3)
      const trees = Array.from({ length: n }, (_, i) => ({
        x: sx(i), y: sy(i), i,
        s: 0.8 + h2(col + i, row * 2 + i) * 0.55,
        round: h2(col * 2 + i, row + i * 3) > 0.66,
      })).sort((a, b) => a.y - b.y)
      for (const t of trees) {
        out.push(
          <g key={k('t' + t.i)} transform={`translate(${t.x} ${t.y}) scale(${t.s})`}>
            {t.round ? (
              <>
                <circle cx="0" cy="-1" r="1.3" fill="rgba(38,100,54,0.92)" />
                <circle cx="-0.55" cy="-1.4" r="0.7" fill="rgba(60,136,78,0.85)" />
              </>
            ) : (
              <>
                <polygon points="-1.1,0.9 0,-1.4 1.1,0.9" fill="rgba(30,90,48,0.92)" />
                <polygon points="-0.85,-0.3 0,-2.4 0.85,-0.3" fill="rgba(54,128,72,0.92)" />
              </>
            )}
          </g>,
        )
      }
      break
    }
    case 'grass':
      // Soft curved blade tufts + the occasional flower fleck.
      for (let i = 0; i < 4; i++) {
        const x = sx(i), y = sy(i)
        out.push(
          <path key={k('g' + i)} d={`M ${x - 0.7},${y} q 0.25,-0.9 0.45,-1.4 M ${x},${y} q 0,-1 0.05,-1.6 M ${x + 0.7},${y} q -0.25,-0.9 -0.45,-1.4`}
            stroke="rgba(112,160,80,0.45)" strokeWidth="0.28" fill="none" strokeLinecap="round" />,
        )
      }
      if (h2(col * 5 + 3, row * 3 + 1) > 0.62) {
        out.push(<circle key={k('fl')} cx={sx(4)} cy={sy(4)} r="0.45" fill="rgba(222,202,122,0.55)" />)
      }
      break
    case 'city':
      for (let i = 0; i < 3; i++) {
        const x = sx(i), y = sy(i)
        out.push(
          <path key={k('cg' + i)} d={`M ${x},${y} l 0,-1.1`} stroke="rgba(108,158,76,0.4)" strokeWidth="0.3" strokeLinecap="round" />,
        )
      }
      ;[[-3.4, 1.2, 0.8], [3.2, 1, 0.85], [0, -0.4, 1], [1.7, 1.8, 0.62], [-1.8, 1.9, 0.62]].forEach(([dx, dy, s], i) => {
        const x = x0 + CW / 2 + dx, y = y0 + CH / 2 + dy
        out.push(
          <g key={k('h' + i)} transform={`translate(${x} ${y}) scale(${s})`}>
            <rect x="-1.5" y="-1.1" width="3" height="2.6" fill="rgba(200,170,112,0.95)" />
            <polygon points="-2,-1.1 0,-3 2,-1.1" fill="rgba(172,88,68,0.96)" />
          </g>,
        )
      })
      break
    case 'sand':
      // Varied grains + two faint dune ridges.
      for (let i = 0; i < 9; i++) {
        out.push(<circle key={k('s' + i)} cx={sx(i)} cy={sy(i)} r={0.28 + h2(col + i, row + i) * 0.26} fill="rgba(160,126,72,0.6)" />)
      }
      out.push(
        <path key={k('d1')} d={`M ${x0 + 2},${y0 + CH * 0.42} q ${CW * 0.26},-2 ${CW * 0.52},0 q ${CW * 0.24},2 ${CW * 0.44},0.3`}
          stroke="rgba(216,186,124,0.42)" strokeWidth="0.45" fill="none" strokeLinecap="round" />,
        <path key={k('d2')} d={`M ${x0 + 2.5},${y0 + CH * 0.74} q ${CW * 0.28},-1.6 ${CW * 0.55},0`}
          stroke="rgba(196,162,98,0.4)" strokeWidth="0.4" fill="none" strokeLinecap="round" />,
      )
      break
    case 'water':
      // Wavelets of varied length & spacing for a less uniform surface.
      for (let i = 0; i < 4; i++) {
        const y = y0 + 3 + i * 3.4 + h2(col, row + i) * 1.2
        const x = x0 + 2.5 + h2(col + i, row) * 5
        const w = 2.2 + h2(col * 2 + i, row + 1) * 1.8
        out.push(
          <path key={k('w' + i)} d={`M ${x},${y} q ${w / 2},-1 ${w},0 q ${w / 2},1 ${w},0`}
            stroke="rgba(124,176,224,0.38)" strokeWidth="0.38" fill="none" strokeLinecap="round" />,
        )
      }
      break
    case 'mountain':
      // Two peaks of varied height + a small foothill so cells read as a range.
      for (let i = 0; i < 2; i++) {
        const x = x0 + 5.5 + i * 8 + h2(col, i) * 1.5, y = y0 + CH * 0.66
        const ph = 3.8 + h2(col + i, row + 2) * 1.8
        out.push(
          <g key={k('m' + i)} transform={`translate(${x} ${y})`}>
            <polygon points={`-3.6,1 0,${-ph} 3.6,1`} fill="rgba(120,114,108,0.88)" />
            <polygon points={`0,${-ph} 3.6,1 1.2,1`} fill="rgba(74,70,66,0.7)" />
            <polygon points={`-1,${(-ph * 0.34).toFixed(2)} 0,${-ph} 1,${(-ph * 0.34).toFixed(2)} 0,${(-ph * 0.55).toFixed(2)}`} fill="rgba(238,240,243,0.92)" />
          </g>,
        )
      }
      out.push(
        <polygon key={k('mf')} points={`${x0 + CW * 0.5 - 2},${y0 + CH * 0.8} ${x0 + CW * 0.5},${y0 + CH * 0.56} ${x0 + CW * 0.5 + 2},${y0 + CH * 0.8}`}
          fill="rgba(96,92,86,0.7)" />,
      )
      break
    case 'hills': {
      const cx = x0 + CW / 2, cy = y0 + CH * 0.6
      out.push(<path key={k('h1')} d={`M ${cx - 6},${cy + 2.4} Q ${cx - 2},${cy - 3} ${cx + 1.5},${cy + 2.4} Z`} fill="rgba(72,106,56,0.85)" />)
      out.push(<path key={k('h2')} d={`M ${cx - 1.5},${cy + 2.4} Q ${cx + 2.5},${cy - 4} ${cx + 6.5},${cy + 2.4} Z`} fill="rgba(94,130,68,0.9)" />)
      out.push(<path key={k('hc')} d={`M ${cx + 0.2},${cy - 0.4} Q ${cx + 2.5},${cy - 3} ${cx + 4.6},${cy - 1}`} stroke="rgba(150,182,116,0.6)" strokeWidth="0.4" fill="none" strokeLinecap="round" />)
      out.push(<path key={k('hc2')} d={`M ${cx - 5},${cy + 0.6} Q ${cx - 2},${cy - 2} ${cx + 0.2},${cy + 0.4}`} stroke="rgba(150,182,116,0.4)" strokeWidth="0.35" fill="none" strokeLinecap="round" />)
      break
    }
    case 'rock':
      for (let i = 0; i < 6; i++) {
        const x = sx(i), y = sy(i)
        const s = 0.8 + h2(col + i, row + i) * 0.7
        out.push(
          <polygon key={k('r' + i)} transform={`translate(${x} ${y}) scale(${s})`}
            points="-1,0.7 -0.3,-0.8 0.8,-0.4 1.1,0.7" fill="rgba(116,108,122,0.55)" />,
        )
      }
      break
  }
  return out
}

function TerrainOverlay({ region }: { region: string }) {
  const t = REGION_TERRAIN[region]
  if (!t) return null
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 80"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none rounded-md"
    >
      {t.grid.flatMap((rowArr, row) =>
        rowArr.map((b, col) => (
          <rect key={`bg-${col}-${row}`} x={col * CW} y={row * CH} width={CW} height={CH} fill={biomeFill(b, col, row)} />
        )),
      )}
      {t.grid.flatMap((rowArr, row) => rowArr.flatMap((b, col) => cellMotifs(b, col, row)))}
      {t.river && <path d={t.river} fill="none" stroke="rgba(96,150,210,0.5)" strokeWidth="2.6" strokeLinecap="round" />}
    </svg>
  )
}

// ── RosterUnitCard ────────────────────────────────────────────────────────────

function RosterUnitCard({ unit }: { unit: Unit }) {
  const selectedUnitIds  = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit = useGameStore((s) => s.toggleSelectUnit)
  const equipment        = useGameStore((s) => s.equipment)
  const locations        = useGameStore((s) => s.locations)
  const isSelected       = selectedUnitIds.includes(unit.id)
  const isRecovering     = unit.recoveryTicksLeft > 0
  const isResting        = unit.isResting
  const maxHp            = getDerivedStats(unit, equipment).maxHp
  const hpPct            = Math.max(0, Math.min(100, (unit.health / maxHp) * 100))
  const recoverPct       = isRecovering ? ((RECOVERY_TICKS - unit.recoveryTicksLeft) / RECOVERY_TICKS) * 100 : 0
  const locationName     = unit.locationId ? (locations.find((l) => l.id === unit.locationId)?.name ?? null) : null

  return (
    <button
      onClick={() => toggleSelectUnit(unit.id)}
      className={[
        'shrink-0 w-28 px-3 py-2 border-b text-left select-none transition-colors duration-100',
        unit.health <= 0 ? 'opacity-60' : '',
        isSelected
          ? 'border-game-primary bg-game-primary/25 text-white'
          : 'border-game-border bg-game-surface text-game-text hover:bg-white/5',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={[
            'shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border',
            isSelected ? 'bg-game-primary/40 border-game-primary/60 text-white' : 'bg-game-primary/15 border-game-border text-game-text',
          ].join(' ')}
        >
          {getInitials(unit.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold leading-tight truncate">{unit.name}</div>
          <div className="text-[10px] text-game-text-dim leading-none mt-0.5">Lv.{unit.level}</div>
        </div>
      </div>
      <div className="w-full bg-game-border/60 rounded-full h-1.5 overflow-hidden">
        {isRecovering ? (
          <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${recoverPct}%`, transition: 'none' }} />
        ) : isResting ? (
          <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${hpPct}%`, transition: 'none' }} />
        ) : (
          <div className={`${hpBarColor(hpPct)} h-1.5 rounded-full`} style={{ width: `${hpPct}%`, transition: 'none' }} />
        )}
      </div>
      <div className="text-[10px] text-game-text-dim truncate mt-1">
        {isRecovering ? <span className="text-purple-400">KO</span>
          : isResting   ? <span className="text-sky-400">Resting</span>
          : locationName ?? <span className="text-game-muted italic">unassigned</span>}
      </div>
    </button>
  )
}

function RosterCarousel({ units }: { units: Unit[] }) {
  return (
    <div className="-mt-7 overflow-x-auto">
      <div className="flex gap-px">
        {units.map((u) => <RosterUnitCard key={u.id} unit={u} />)}
      </div>
    </div>
  )
}

// ── LocationCell ──────────────────────────────────────────────────────────────

function LocationCell({ location, units }: { location: Location; units: Unit[] }) {
  const equipment           = useGameStore((s) => s.equipment)
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const isSelected          = selectedLocationId === location.id

  const coords = LOCATION_COORDS[location.id]
  const style  = coords ? { gridColumn: coords[0] + 1, gridRow: coords[1] + 1 } : undefined
  const kind   = getLocationKind(location.traits)

  return (
    <button
      onClick={() => setSelectedLocation(isSelected ? null : location.id)}
      style={style}
      title={location.name}
      className={[
        'relative z-10 flex items-center justify-center rounded-md border transition-all overflow-hidden',
        isSelected
          ? 'border-game-primary bg-game-primary/30 ring-2 ring-game-primary/50 shadow-lg shadow-game-primary/30 scale-[1.04]'
          : 'border-game-border bg-game-surface/55 hover:border-game-primary/70 hover:bg-game-surface/75',
      ].join(' ')}
    >
      {/* kind symbol — centered glyph (name now lives in the detail panel) */}
      {kind && (
        <span
          aria-hidden
          className={`text-[22px] leading-none pointer-events-none drop-shadow ${kind.iconCls}`}
        >
          {kind.symbol}
        </span>
      )}
      {/* unit dots — bottom left, compact 3-column grid */}
      <div className="absolute bottom-1 left-1 grid grid-cols-3 gap-0.5">
        {units.slice(0, 6).map((u) => {
          const isRec = u.recoveryTicksLeft > 0
          const maxHp = getDerivedStats(u, equipment).maxHp
          const hpPct = (u.health / maxHp) * 100
          const color = isRec
            ? 'bg-purple-500'
            : u.isResting ? 'bg-sky-500'
            : hpPct > 60   ? 'bg-game-green'
            : hpPct > 30   ? 'bg-game-gold'
            : 'bg-red-500'
          return <span key={u.id} className={`w-1.5 h-1.5 rounded-full ${color}`} />
        })}
        {units.length > 6 && (
          <span className="text-[8px] text-game-text-dim leading-none self-center col-span-3">+{units.length - 6}</span>
        )}
      </div>
    </button>
  )
}

// ── PageArrow ─────────────────────────────────────────────────────────────────

function PageArrow({ direction, target, onClick }: {
  direction: 'left' | 'right' | 'up' | 'down'
  target: PageDef | null
  onClick: () => void
}) {
  const sym = direction === 'left' ? '◀' : direction === 'right' ? '▶' : direction === 'up' ? '▲' : '▼'
  const label = target?.name ?? ''
  const visible = !!target
  const horizontal = direction === 'left' || direction === 'right'

  return (
    <button
      onClick={visible ? onClick : undefined}
      disabled={!visible}
      className={[
        horizontal
          ? 'w-7 self-stretch flex flex-col items-center justify-center'
          : 'h-5 self-center flex items-center justify-center px-2 gap-1.5',
        'rounded-md border text-[10px] font-semibold uppercase tracking-wider transition-colors',
        visible
          ? 'border-game-border text-game-text-dim hover:border-game-primary/60 hover:text-game-text'
          : 'border-transparent text-transparent pointer-events-none',
      ].join(' ')}
    >
      {horizontal ? (
        <span className="text-sm leading-none">{sym}</span>
      ) : (
        <>
          <span className="leading-none">{sym}</span>
          <span className="leading-none">{label}</span>
        </>
      )}
    </button>
  )
}

// ── WorldMap ──────────────────────────────────────────────────────────────────

function WorldMap({ locations, units }: { locations: Location[]; units: Unit[] }) {
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const pageId              = useGameStore((s) => s.mapPageId)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const page = PAGE_BY_ID[pageId] ?? PAGES[0]

  // Dungeon pages: only an up arrow, which exits to the entry location's
  // region and selects the entry so the player has context. World pages use
  // their declared neighbors and clear selection on navigation.
  const dungeonExit = page.isDungeon && page.entryLocationId
    ? locations.find((l) => l.id === page.entryLocationId) ?? null
    : null

  const left  = page.isDungeon ? null : (page.left  ? PAGE_BY_ID[page.left]  : null)
  const right = page.isDungeon ? null : (page.right ? PAGE_BY_ID[page.right] : null)
  const down  = page.isDungeon ? null : (page.down  ? PAGE_BY_ID[page.down]  : null)
  const up: PageDef | null = page.isDungeon
    ? (dungeonExit ? { id: dungeonExit.region, name: dungeonExit.name } : null)
    : (page.up ? PAGE_BY_ID[page.up] : null)

  const goto = (target: PageDef | null) => {
    if (!target) return
    setMapPage(target.id)
    if (page.isDungeon && dungeonExit) {
      // Returning to the entry location — keep it selected so deploy/codex
      // are one tap away.
      setSelectedLocation(dungeonExit.id)
    } else {
      setSelectedLocation(null)
    }
  }

  const pageLocations = locations.filter((l) => l.region === page.id)

  return (
    <div className="bg-game-surface overflow-hidden">
      <div className="px-2 py-1 space-y-1">
        {/* Up arrow row */}
        <div className="flex justify-center min-h-[20px]">
          <PageArrow direction="up" target={up} onClick={() => goto(up)} />
        </div>

        {/* Middle row: left arrow, grid, right arrow */}
        <div className="flex items-center justify-center gap-1">
          <PageArrow direction="left" target={left} onClick={() => goto(left)} />
          <div className="bg-game-bg rounded-md p-1.5">
            <div className="relative" style={{ width: INNER_W, height: INNER_H }}>
              <TerrainOverlay region={page.id} />
              <div
                className="relative"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_W}, ${CELL_W}px)`,
                  gridTemplateRows:    `repeat(${GRID_H}, ${CELL_H}px)`,
                  gap: `${GAP_PX}px`,
                }}
              >
                {/* Faint placeholders keep the grid lattice readable over the
                    terrain; locations render on top via explicit gridColumn/Row. */}
                {Array.from({ length: GRID_W * GRID_H }).map((_, i) => {
                  const x = i % GRID_W
                  const y = Math.floor(i / GRID_W)
                  const occupied = pageLocations.some((l) => {
                    const c = LOCATION_COORDS[l.id]
                    return c && c[0] === x && c[1] === y
                  })
                  if (occupied) return null
                  return (
                    <div
                      key={`ph-${x}-${y}`}
                      style={{ gridColumn: x + 1, gridRow: y + 1 }}
                      className="rounded-md border border-game-border/15 pointer-events-none"
                    />
                  )
                })}
                {pageLocations.map((loc) => (
                  <LocationCell
                    key={loc.id}
                    location={loc}
                    units={units.filter((u) => u.locationId === loc.id)}
                  />
                ))}
              </div>
            </div>
          </div>
          <PageArrow direction="right" target={right} onClick={() => goto(right)} />
        </div>

        {/* Down arrow row */}
        <div className="flex justify-center min-h-[20px]">
          <PageArrow direction="down" target={down} onClick={() => goto(down)} />
        </div>
      </div>
    </div>
  )
}

// ── UnitActionBar ─────────────────────────────────────────────────────────────

function UnitActionBar() {
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  const clearSelection      = useGameStore((s) => s.clearSelection)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const assignUnits         = useGameStore((s) => s.assignUnits)
  const setActiveTab        = useGameStore((s) => s.setActiveTab)
  const setCombatLocation   = useGameStore((s) => s.setCombatLocation)
  const toggleUnit          = useGameStore((s) => s.toggleUnit)
  const expandedUnitIds     = useGameStore((s) => s.expandedUnitIds)
  const locations           = useGameStore((s) => s.locations)
  const units               = useGameStore((s) => s.units)

  const hasUnits = selectedUnitIds.length > 0

  // Always-rendered fixed-height shell so toggling content doesn't shift the
  // world map. Two rows of buttons are reserved (no horizontal scroll); items
  // wrap onto the second row as needed.
  if (!hasUnits) {
    return <div className="h-12 border-b border-game-border/40" />
  }

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id))
  const location = selectedLocationId ? (locations.find((l) => l.id === selectedLocationId) ?? null) : null
  const hasLoc = location !== null
  const sharedLocId = selectedUnits.every((u) => u.locationId === selectedUnits[0].locationId)
    ? selectedUnits[0].locationId
    : null
  const allAlreadyHere = hasLoc && selectedUnits.every((u) => u.locationId === selectedLocationId)
  const combatTargetLocId = hasLoc ? (allAlreadyHere ? selectedLocationId : null) : sharedLocId

  function handleDeploy() {
    if (!selectedLocationId || allAlreadyHere) return
    assignUnits(selectedUnitIds, selectedLocationId)
  }
  function handleViewUnit() {
    const unitId = selectedUnits[0]?.id
    if (!unitId) return
    if (!expandedUnitIds.includes(unitId)) toggleUnit(unitId)
    setActiveTab('units')
    clearSelection()
    setSelectedLocation(null)
  }
  function handleFindOnMap() {
    if (!sharedLocId) return
    const loc = locations.find((l) => l.id === sharedLocId)
    if (!loc) return
    setMapPage(loc.region)
    setSelectedLocation(sharedLocId)
  }
  function handleGoCombat() {
    if (combatTargetLocId) setCombatLocation(combatTargetLocId)
    setActiveTab('combat')
    clearSelection()
    setSelectedLocation(null)
  }

  return (
    <div className="h-12 px-3 flex items-center gap-1.5 border-b border-game-border bg-game-surface/40 overflow-hidden">
      <span className="text-xs text-game-text-dim shrink-0 mr-auto">
        {selectedUnits.length} unit{selectedUnits.length !== 1 ? 's' : ''}
      </span>
      <button
        onClick={handleDeploy}
        disabled={!hasLoc || allAlreadyHere}
        className={[
          'btn-primary text-xs py-1 px-2 shrink-0',
          (!hasLoc || allAlreadyHere) ? 'opacity-40 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {hasLoc ? (allAlreadyHere ? 'Here' : 'Deploy') : 'Deploy'}
      </button>
      {selectedUnits.length === 1 && (
        <button onClick={handleViewUnit} className="text-xs py-1 px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0">
          View
        </button>
      )}
      {sharedLocId && (
        <button onClick={handleFindOnMap} className="text-xs py-1 px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0">
          Map
        </button>
      )}
      {combatTargetLocId && (
        <button onClick={handleGoCombat} className="text-xs py-1 px-2 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors shrink-0">
          Combat
        </button>
      )}
      <button onClick={() => clearSelection()} aria-label="Clear unit selection" className="w-7 h-7 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors shrink-0">
        ✕
      </button>
    </div>
  )
}

// ── LocationDetailPanel ───────────────────────────────────────────────────────

// LocationDetailPanel — bottom panel; strictly location-only actions now
// (unit actions live in the top UnitActionBar between roster and map).
function LocationDetailPanel() {
  const selectedLocationId  = useGameStore((s) => s.selectedLocationId)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  const toggleSelectUnit    = useGameStore((s) => s.toggleSelectUnit)
  const setActiveTab        = useGameStore((s) => s.setActiveTab)
  const setCombatLocation   = useGameStore((s) => s.setCombatLocation)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const locations           = useGameStore((s) => s.locations)
  const units               = useGameStore((s) => s.units)
  const locationFamiliarity = useGameStore((s) => s.locationFamiliarity)
  const locationMonstersSeen = useGameStore((s) => s.locationMonstersSeen)
  const encounters          = useGameStore((s) => s.encounters)

  const [codexMonsterId, setCodexMonsterId] = useState<string | null>(null)
  const codexSeenCount = useGameStore((s) => codexMonsterId ? (s.monsterSeen[codexMonsterId] ?? 0) : 0)

  const location = selectedLocationId ? (locations.find((l) => l.id === selectedLocationId) ?? null) : null
  const hasLoc   = location !== null

  const dungeonEntry = location?.dungeonEntryRegion
    ? { regionId: location.dungeonEntryRegion, regionName: PAGE_BY_ID[location.dungeonEntryRegion]?.name ?? location.dungeonEntryRegion }
    : null

  // Go-to-Combat from the location panel only fires when no units are selected
  // (otherwise the unit action bar at the top owns the Go to Combat).
  const locationOnlyCombatTargetId = hasLoc && selectedUnitIds.length === 0 ? selectedLocationId : null

  function handleGoCombat() {
    if (!locationOnlyCombatTargetId) return
    setCombatLocation(locationOnlyCombatTargetId)
    setActiveTab('combat')
    setSelectedLocation(null)
  }

  function handleEnterDungeon() {
    if (!dungeonEntry) return
    setMapPage(dungeonEntry.regionId)
    setSelectedLocation(null)  // entry lives on a different page; keep unit selection so deploy stays one tap
  }

  return (
    <div className="flex flex-col bg-game-surface border-t border-game-border min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-game-border min-h-[64px] flex flex-col justify-center shrink-0">
        {location ? (
          <>
            <div className="font-semibold text-game-text mb-1">{location.name}</div>
            <p className="text-xs text-game-text-dim leading-snug">{location.description}</p>
          </>
        ) : (
          <span className="text-xs text-game-text-dim italic">Tap a location to see details</span>
        )}
      </div>

      {/* Middle: familiarity + traits + encounters, fills remaining vertical space */}
      <div className="flex-1 min-h-0 px-4 py-3 space-y-4 overflow-y-auto">
        {location ? (() => {
          const famPct  = Math.round(((locationFamiliarity[location.id] ?? 0) / location.familiarityMax) * 100)
          const seenIds = (() => {
            const saved   = (locationMonstersSeen[location.id] ?? []).filter((id) => location.monsterIds.includes(id))
            const inSlots = (encounters[location.id] ?? []).map((sl) => sl.monsterId).filter((id) => location.monsterIds.includes(id))
            return [...new Set([...saved, ...inSlots])]
          })()
          const unknownCount = location.monsterIds.length - seenIds.length
          const unitsHere = units.filter((u) => u.locationId === location.id)
          return (
            <>
              {unitsHere.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Units here</div>
                  <div className="flex flex-wrap gap-1.5">
                    {unitsHere.map((u) => {
                      const isSelected = selectedUnitIds.includes(u.id)
                      return (
                        <button
                          key={u.id}
                          onClick={() => toggleSelectUnit(u.id)}
                          className={[
                            'shrink-0 px-2 py-1 rounded border text-left transition-colors',
                            isSelected
                              ? 'border-game-primary bg-game-primary/20'
                              : 'border-game-border bg-game-bg hover:border-game-primary/50',
                          ].join(' ')}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-game-text truncate">{u.name}</span>
                            <span className="text-[9px] text-game-text-dim shrink-0">Lv.{u.level}</span>
                          </div>
                          <div className="text-[9px] text-game-text-dim leading-none mt-0.5">
                            {u.class ?? <span className="italic text-game-muted">unclassed</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="uppercase tracking-widest text-game-text-dim">Familiarity</span>
                  <span className="text-game-accent">{famPct}%</span>
                </div>
                <div className="w-full bg-game-border rounded-full h-1.5">
                  <div className="bg-game-accent h-1.5 rounded-full transition-all" style={{ width: `${famPct}%` }} />
                </div>
              </div>

              {(seenIds.length > 0 || unknownCount > 0) && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Encounters</div>
                  <div className="space-y-1">
                    {seenIds.map((id) => {
                      const m = MONSTER_REGISTRY[id]
                      if (!m) return null
                      return (
                        <button
                          key={id}
                          onClick={() => setCodexMonsterId(id)}
                          className="w-full flex items-center gap-2 bg-game-bg rounded-md px-2.5 py-1.5 border border-transparent hover:border-game-primary/50 transition-colors text-left"
                        >
                          <span className="text-xs text-game-text flex-1 truncate">{m.name}</span>
                          <span className="text-[10px] text-game-text-dim">Lv.{m.level}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${ELEMENT_COLORS[m.element] ?? ELEMENT_COLORS.neutral}`}>
                            {m.element}
                          </span>
                        </button>
                      )
                    })}
                    {unknownCount > 0 && (
                      <div className="flex items-center gap-2 bg-game-bg rounded-md px-2.5 py-1.5 opacity-50">
                        <span className="text-xs text-game-muted flex-1">+{unknownCount} unknown</span>
                        <span className="text-[10px] text-game-muted italic">explore to discover</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {location.traits.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Traits</div>
                  <div className="flex flex-wrap gap-1">
                    {location.traits.map((t) => {
                      const k = LOCATION_KIND[t]
                      if (k) {
                        return (
                          <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${k.cls}`}>
                            <span aria-hidden className="mr-1">{k.symbol}</span>{k.label}
                          </span>
                        )
                      }
                      return (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60 capitalize">
                          {t}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )
        })() : null}
      </div>

      <div className="px-4 py-3 flex items-center gap-2 flex-wrap min-h-[60px] shrink-0 border-t border-game-border/50">
        {hasLoc ? (
          <>
            <span className="text-xs text-game-text-dim mr-auto italic">Location actions</span>
            {locationOnlyCombatTargetId && (
              <button onClick={handleGoCombat} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text hover:bg-white/5 transition-colors">
                Go to Combat ›
              </button>
            )}
            {dungeonEntry && (
              <button onClick={handleEnterDungeon} className="text-sm py-1.5 px-3 rounded-lg border border-red-500/60 bg-red-600/20 text-red-200 hover:bg-red-600/30 hover:border-red-500 transition-colors">
                Enter {dungeonEntry.regionName}
              </button>
            )}
            <button onClick={() => setSelectedLocation(null)} className="text-sm py-1.5 px-3 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <span className="text-xs text-game-muted italic">Tap a location on the map to see actions.</span>
        )}
      </div>

      {codexMonsterId && MONSTER_REGISTRY[codexMonsterId] && (
        <MonsterCodex
          monster={MONSTER_REGISTRY[codexMonsterId]}
          seenCount={codexSeenCount}
          onClose={() => setCodexMonsterId(null)}
        />
      )}
    </div>
  )
}

// ── Map ───────────────────────────────────────────────────────────────────────

export function Map() {
  const units     = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)

  return (
    <div className="h-full grid grid-rows-[auto_auto_auto_minmax(0,1fr)] pt-4">
      <RosterCarousel units={units} />
      <UnitActionBar />
      <WorldMap locations={locations} units={units} />
      <LocationDetailPanel />
    </div>
  )
}
