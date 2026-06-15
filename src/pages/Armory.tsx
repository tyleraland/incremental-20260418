import { useMemo, useState } from 'react'
import {
  useGameStore, getDerivedStats, getInitials, type Unit, type EquipmentItem, type EquipSlot, type DerivedStats,
} from '@/stores/useGameStore'
import {
  DOCTRINES, type DoctrineId, type Doctrine, resolveDoctrine, defaultDoctrine,
  itemScore, quality, heroMight, itemGlyph, slotOptions, optimizeHero, optimizeArmy, optimizeColumn,
  withLoadout, type HeroPlan, STAT_SLOTS,
} from '@/lib/loadout'

// ─────────────────────────────────────────────────────────────────────────────
// THE ARMORY (prototype) — outfitting an army shouldn't be a chore.
//
// Two presentation experiments on one optimizer (src/lib/loadout.ts), switchable
// up top so they can be compared side by side:
//
//   • ATELIER — a cinematic single-hero "paper doll" (Ragnarok equip window +
//     Octopath stat panel + LoL compare tooltips). You feel each individual.
//   • MATRIX  — a dense army × slot power grid with per-column auto-fill. You
//     manage the whole army at a glance and let the machine grind the busywork.
//
// Both lean on the same loop: the optimizer PROPOSES (green ↑), you skim and
// either trust it or intervene. Drawing from Fire Emblem (convoy + auto-equip),
// League (recommended items / rich compares), Ragnarok (paper-doll, sockets,
// rarity), Octopath (clean stat readout).
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
function heroGlyph(u: Unit): string { return (u.class && CLASS_ICON[u.class]) || getInitials(u.name) }

const SLOT_META: Record<EquipSlot, { label: string; glyph: string }> = {
  mainHand: { label: 'Main Hand', glyph: '🗡' }, offHand: { label: 'Off Hand', glyph: '🛡' },
  armor: { label: 'Armor', glyph: '🥋' }, accessory: { label: 'Accessory', glyph: '💍' },
  sideboard1: { label: 'Stash', glyph: '▫' }, sideboard2: { label: 'Stash', glyph: '▫' },
}

const STAT_DELTA_KEYS = ['attack', 'defense', 'specialAttack', 'specialDefense'] as const
const STAT_DELTA_SHORT: Record<(typeof STAT_DELTA_KEYS)[number], string> = {
  attack: 'ATK', defense: 'DEF', specialAttack: 'MAG', specialDefense: 'RES',
}

// ── Shared: an item tile (Ragnarok-flavoured: quality ring + socket pips) ───────

function ItemTile({ item, size = 'md', onClick, selected }: {
  item: EquipmentItem | null; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; selected?: boolean
}) {
  const q = item ? quality(item) : null
  const px = size === 'lg' ? 'w-14 h-14 text-2xl' : size === 'sm' ? 'w-9 h-9 text-base' : 'w-11 h-11 text-xl'
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={[
        'relative rounded-lg border-2 flex items-center justify-center bg-game-bg/70 shrink-0 transition-all',
        px,
        item ? q!.ring : 'border-dashed border-game-border',
        selected ? 'ring-2 ring-game-accent scale-105' : '',
        onClick ? 'hover:scale-105 cursor-pointer' : 'cursor-default',
      ].join(' ')}
      title={item ? item.name : 'Empty'}
    >
      <span className={item ? '' : 'opacity-30'}>{item ? itemGlyph(item) : '＋'}</span>
      {/* socket pips (Ragnarok cards) */}
      {!!item?.slots && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          {Array.from({ length: item.slots }).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full bg-game-accent/80 ring-1 ring-game-bg" />
          ))}
        </span>
      )}
    </button>
  )
}

// ── Shared: the stat hexagon (Octopath-clean radar) ─────────────────────────────

const AXES: { key: keyof DerivedStats; label: string; max: number }[] = [
  { key: 'attack', label: 'ATK', max: 55 }, { key: 'magicAttack', label: 'MAG', max: 55 },
  { key: 'defense', label: 'DEF', max: 45 }, { key: 'attackSpeed', label: 'SPD', max: 40 },
  { key: 'magicDefense', label: 'RES', max: 35 }, { key: 'accuracy', label: 'ACC', max: 45 },
]
function hexPoints(stats: DerivedStats, scale: number, r: number): string {
  return AXES.map((ax, i) => {
    const ang = (Math.PI / 2) * -1 + (i / AXES.length) * Math.PI * 2
    const v = Math.min(1, (stats[ax.key] as number) / ax.max) * r * scale
    return `${50 + Math.cos(ang) * v},${50 + Math.sin(ang) * v}`
  }).join(' ')
}
function StatHex({ base, preview }: { base: DerivedStats; preview?: DerivedStats | null }) {
  const R = 38
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* rings */}
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon key={g} points={AXES.map((ax, i) => {
          const ang = -Math.PI / 2 + (i / AXES.length) * Math.PI * 2
          return `${50 + Math.cos(ang) * R * g},${50 + Math.sin(ang) * R * g}`
        }).join(' ')} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={0.4} />
      ))}
      {AXES.map((ax, i) => {
        const ang = -Math.PI / 2 + (i / AXES.length) * Math.PI * 2
        const lx = 50 + Math.cos(ang) * (R + 8), ly = 50 + Math.sin(ang) * (R + 8)
        return (
          <g key={ax.label}>
            <line x1={50} y1={50} x2={50 + Math.cos(ang) * R} y2={50 + Math.sin(ang) * R} stroke="rgba(148,163,184,0.15)" strokeWidth={0.3} />
            <text x={lx} y={ly} fontSize={5} fill="#64748b" textAnchor="middle" dominantBaseline="middle">{ax.label}</text>
          </g>
        )
      })}
      {preview && <polygon points={hexPoints(preview, 1, R)} fill="rgba(34,211,238,0.18)" stroke="#22d3ee" strokeWidth={0.7} strokeDasharray="1.5 1" />}
      <polygon points={hexPoints(base, 1, R)} fill="rgba(99,102,241,0.30)" stroke="#818cf8" strokeWidth={0.9} className="transition-all duration-300" />
    </svg>
  )
}

// ── Doctrine selector ───────────────────────────────────────────────────────--

function DoctrineChips({ value, onChange, includeAuto, size = 'md' }: {
  value: DoctrineId; onChange: (d: DoctrineId) => void; includeAuto?: boolean; size?: 'sm' | 'md'
}) {
  const opts: { id: DoctrineId; icon: string; name: string }[] = [
    ...(includeAuto ? [{ id: 'auto' as DoctrineId, icon: '✨', name: 'Auto' }] : []),
    ...Object.values(DOCTRINES).map((d) => ({ id: d.id as DoctrineId, icon: d.icon, name: d.name })),
  ]
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          title={o.id !== 'auto' ? DOCTRINES[o.id as Doctrine['id']].blurb : 'Each hero follows their class role'}
          className={[
            size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
            'rounded-md border transition-colors flex items-center gap-1',
            value === o.id ? 'border-game-accent bg-game-accent/15 text-game-accent' : 'border-game-border text-game-text-dim hover:border-game-primary/60',
          ].join(' ')}
        >
          <span>{o.icon}</span><span className="font-medium">{o.name}</span>
        </button>
      ))}
    </div>
  )
}

// ── Stat-delta row (LoL compare) ────────────────────────────────────────────────

function StatDeltas({ item, current }: { item: EquipmentItem | null; current: EquipmentItem | null }) {
  const deltas = STAT_DELTA_KEYS
    .map((k) => ({ k, d: (item?.stats[k] ?? 0) - (current?.stats[k] ?? 0) }))
    .filter((x) => x.d !== 0)
  const rd = (item?.stats.range ?? 0) - (current?.stats.range ?? 0)
  if (!deltas.length && !rd) return <span className="text-[10px] text-game-muted">no stat change</span>
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      {deltas.map(({ k, d }) => (
        <span key={k} className={`text-[10px] font-mono ${d > 0 ? 'text-game-green' : 'text-red-400'}`}>
          {d > 0 ? '+' : ''}{d} {STAT_DELTA_SHORT[k]}
        </span>
      ))}
      {!!rd && <span className={`text-[10px] font-mono ${rd > 0 ? 'text-game-green' : 'text-red-400'}`}>{rd > 0 ? '+' : ''}{rd} RNG</span>}
    </div>
  )
}

// ═════════════════════════════ ATELIER VIEW ═══════════════════════════════════

function PaperDoll({ unit, equipById, onSlot, openSlot }: {
  unit: Unit; equipById: Map<string, EquipmentItem>; onSlot: (s: EquipSlot) => void; openSlot: EquipSlot | null
}) {
  const get = (slot: EquipSlot) => {
    const id = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
    return id ? equipById.get(id) ?? null : null
  }
  const twoH = get('mainHand')?.category === 'weapon-2h'
  const slotBtn = (slot: EquipSlot, locked?: boolean) => {
    const item = get(slot)
    return (
      <div className="flex flex-col items-center gap-1">
        <ItemTile item={item} size="lg" selected={openSlot === slot} onClick={locked ? undefined : () => onSlot(slot)} />
        <span className="text-[9px] uppercase tracking-wider text-game-muted">{SLOT_META[slot].label}</span>
        {item && <span className={`text-[10px] leading-none max-w-[68px] truncate ${quality(item).text}`}>{item.name}</span>}
        {locked && <span className="text-[9px] text-game-muted italic">2H locks</span>}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center gap-4 sm:gap-7">
      <div className="flex flex-col gap-4">{slotBtn('mainHand')}{slotBtn('armor')}</div>
      {/* portrait */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="w-20 h-20 rounded-xl border-2 border-game-primary/50 bg-gradient-to-b from-game-surface to-game-bg flex items-center justify-center text-4xl shadow-lg shadow-game-primary/10">
          {heroGlyph(unit)}
        </div>
        <div className="text-sm font-bold text-game-text leading-none">{unit.name}</div>
        <div className="text-[10px] text-game-muted">{unit.class ?? 'Novice'} · Lv{unit.level}</div>
      </div>
      <div className="flex flex-col gap-4">{slotBtn('offHand', twoH)}{slotBtn('accessory')}</div>
    </div>
  )
}

function SlotPicker({ unit, slot, units, equipment, doctrine, onHover }: {
  unit: Unit; slot: EquipSlot; units: Unit[]; equipment: EquipmentItem[]; doctrine: Doctrine
  onHover: (item: EquipmentItem | null) => void
}) {
  const equipItem = useGameStore((s) => s.equipItem)
  const equipById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const currentId = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
  const current = currentId ? equipById.get(currentId) ?? null : null
  const options = useMemo(() => slotOptions(unit, slot, units, equipment, doctrine), [unit, slot, units, equipment, doctrine])
  const baseMight = heroMight(unit, equipment)

  function equip(item: EquipmentItem | null) {
    const id = item?.id ?? null
    equipItem(unit.id, slot, id)
    // A 2H main hand frees the off hand.
    if (slot === 'mainHand' && item?.category === 'weapon-2h') equipItem(unit.id, 'offHand', null)
    onHover(null)
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-game-text-dim">{SLOT_META[slot].label} · options</h4>
        {current && <button onClick={() => equip(null)} className="text-[10px] text-game-muted hover:text-red-400">unequip</button>}
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
        {options.length === 0 && <div className="text-[11px] italic text-game-muted py-2">No eligible gear in the convoy for this slot.</div>}
        {options.map((item) => {
          const equipped = item.id === currentId
          const mightAfter = heroMight(withLoadout(unit, { [slot]: item.id }), equipment)
          const dMight = mightAfter - baseMight
          const q = quality(item)
          return (
            <button
              key={item.id}
              onMouseEnter={() => onHover(item)}
              onMouseLeave={() => onHover(null)}
              onClick={() => !equipped && equip(item)}
              className={[
                'text-left rounded-lg border px-2 py-1.5 flex items-center gap-2 transition-colors',
                equipped ? 'border-game-primary bg-game-primary/10 cursor-default' : `${q.ring} bg-game-surface/60 hover:bg-game-surface`,
              ].join(' ')}
            >
              <ItemTile item={item} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold truncate ${q.text}`}>{item.name}</span>
                  <span className={`text-[9px] uppercase ${q.text} opacity-70`}>{q.label}</span>
                  {equipped && <span className="text-[9px] text-game-primary ml-auto shrink-0">Equipped</span>}
                  {!equipped && dMight > 0 && <span className="text-[10px] text-game-green font-bold ml-auto shrink-0">↑ +{dMight}</span>}
                  {!equipped && dMight < 0 && <span className="text-[10px] text-red-400 font-bold ml-auto shrink-0">↓ {dMight}</span>}
                </div>
                <StatDeltas item={item} current={current} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AtelierView({ units, equipment, selectedId, doctrineFor, plan, onApplyHero }: {
  units: Unit[]; equipment: EquipmentItem[]; selectedId: string
  doctrineFor: (u: Unit) => Doctrine; plan: Record<string, HeroPlan> | null
  onApplyHero: (id: string) => void
}) {
  const [openSlot, setOpenSlot] = useState<EquipSlot | null>(null)
  const [hoverItem, setHoverItem] = useState<EquipmentItem | null>(null)
  const equipById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const unit = units.find((u) => u.id === selectedId) ?? units[0]
  const doctrine = doctrineFor(unit)
  const base = getDerivedStats(unit, equipment)
  const preview = openSlot && hoverItem ? getDerivedStats(withLoadout(unit, { [openSlot]: hoverItem.id }), equipment) : null
  const heroPlan = plan?.[unit.id]

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 p-3 overflow-y-auto lg:overflow-hidden">
      {/* CENTER — paper doll + hexagon */}
      <section className="flex flex-col items-center gap-3 lg:flex-1 lg:min-h-0">
        <div className="w-full rounded-xl border border-game-border bg-gradient-to-b from-game-surface/60 to-game-bg p-4 flex flex-col items-center gap-4">
          <PaperDoll unit={unit} equipById={equipById} onSlot={(s) => setOpenSlot((p) => (p === s ? null : s))} openSlot={openSlot} />
          <div className="flex items-center gap-4 w-full justify-center">
            <div className="w-40 h-40 shrink-0"><StatHex base={base} preview={preview} /></div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] uppercase tracking-widest text-game-muted">Might</div>
              <div className="text-4xl font-black text-game-text leading-none tabular-nums">{heroMight(unit, equipment)}</div>
              <div className="text-[10px] text-game-text-dim">role: <span className="text-game-accent">{doctrine.icon} {doctrine.name}</span></div>
              {preview && (
                <div className="text-[10px] text-game-accent">preview: {hoverItem?.name}</div>
              )}
              <button
                onClick={() => onApplyHero(unit.id)}
                className="mt-1 rounded-md bg-game-primary hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5"
              >⚡ Optimize {unit.name.split(' ')[0]}</button>
            </div>
          </div>
        </div>
        {heroPlan && (
          <div className="w-full rounded-lg border border-game-green/40 bg-game-green/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-game-green mb-1">Proposed loadout</div>
            <div className="flex flex-col gap-1">
              {heroPlan.changes.map((c) => (
                <div key={c.slot} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 text-game-muted">{SLOT_META[c.slot].label}</span>
                  <span className="text-game-text-dim truncate">{c.from ? equipById.get(c.from)?.name ?? '—' : '∅'}</span>
                  <span className="text-game-green">→</span>
                  <span className={`truncate ${c.to ? quality(equipById.get(c.to)!).text : 'text-game-muted'}`}>{c.to ? equipById.get(c.to)?.name : '∅'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* RIGHT — slot picker (LoL compare) */}
      <aside className="lg:w-[340px] shrink-0 rounded-xl border border-game-border bg-game-surface/40 p-3 flex flex-col min-h-[200px] lg:min-h-0">
        {openSlot ? (
          <SlotPicker unit={unit} slot={openSlot} units={units} equipment={equipment} doctrine={doctrine} onHover={setHoverItem} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-game-muted">
            <span className="text-3xl opacity-40">🛡</span>
            <p className="text-xs max-w-[200px]">Tap a gear slot to browse the convoy with live stat comparisons, or hit <span className="text-game-accent">Optimize</span> to let the quartermaster propose a build.</p>
          </div>
        )}
      </aside>
    </div>
  )
}

// ═════════════════════════════ MATRIX VIEW ════════════════════════════════════

function MatrixCell({ item, onClick }: { item: EquipmentItem | null; onClick: () => void }) {
  const q = item ? quality(item) : null
  return (
    <button
      onClick={onClick}
      className={[
        'w-full rounded-md border px-1.5 py-1 flex items-center gap-1.5 transition-colors text-left',
        item ? `${q!.ring} bg-game-bg/40 hover:bg-game-surface` : 'border-dashed border-game-border/60 hover:border-game-primary/50',
      ].join(' ')}
      title={item?.name ?? 'Empty — click to fill'}
    >
      <span className="text-sm shrink-0">{item ? itemGlyph(item) : '＋'}</span>
      <span className={`text-[10px] truncate ${item ? q!.text : 'text-game-muted'}`}>{item?.name ?? 'empty'}</span>
      {!!item?.slots && <span className="ml-auto text-[8px] text-game-accent shrink-0">◦{item.slots}</span>}
    </button>
  )
}

function MatrixView({ units, equipment, doctrineFor, onPickCell, onColumn }: {
  units: Unit[]; equipment: EquipmentItem[]; doctrineFor: (u: Unit) => Doctrine
  onPickCell: (unitId: string, slot: EquipSlot) => void
  onColumn: (slot: EquipSlot) => void
}) {
  const equipById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const get = (u: Unit, slot: EquipSlot) => {
    const id = slot === 'mainHand' || slot === 'offHand' ? u.weaponSets[u.activeWeaponSet][slot] : u.equipment[slot]
    return id ? equipById.get(id) ?? null : null
  }
  const totalMight = units.reduce((a, u) => a + heroMight(u, equipment), 0)
  const cols: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'accessory']

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <div className="min-w-[640px]">
        {/* header */}
        <div className="grid items-center gap-2 px-1 pb-2 sticky top-0 z-10 bg-game-bg" style={{ gridTemplateColumns: '150px 64px repeat(4, 1fr)' }}>
          <div className="text-[10px] uppercase tracking-widest text-game-muted">Hero</div>
          <div className="text-[10px] uppercase tracking-widest text-game-muted text-center">Might</div>
          {cols.map((slot) => (
            <div key={slot} className="flex items-center justify-between gap-1">
              <span className="text-[10px] uppercase tracking-wider text-game-text-dim flex items-center gap-1">{SLOT_META[slot].glyph} {SLOT_META[slot].label}</span>
              <button onClick={() => onColumn(slot)} title={`Auto-fill the army's ${SLOT_META[slot].label.toLowerCase()}`}
                className="text-[9px] px-1 py-0.5 rounded bg-game-primary/20 text-game-accent hover:bg-game-primary/40 border border-game-primary/30">⚡</button>
            </div>
          ))}
        </div>
        {/* rows */}
        <div className="flex flex-col gap-1.5">
          {units.map((u) => {
            const d = doctrineFor(u)
            return (
              <div key={u.id} className="grid items-center gap-2 rounded-lg border border-game-border bg-game-surface/40 px-1 py-1.5" style={{ gridTemplateColumns: '150px 64px repeat(4, 1fr)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-md border border-game-border bg-game-bg/60 flex items-center justify-center text-base shrink-0">{heroGlyph(u)}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-game-text truncate">{u.name}</div>
                    <div className="text-[9px] text-game-muted">{d.icon} {u.class ?? 'Novice'}</div>
                  </div>
                </div>
                <div className="text-center text-lg font-bold tabular-nums text-game-text">{heroMight(u, equipment)}</div>
                {cols.map((slot) => (
                  <MatrixCell key={slot} item={get(u, slot)} onClick={() => onPickCell(u.id, slot)} />
                ))}
              </div>
            )
          })}
        </div>
        {/* footer */}
        <div className="mt-3 flex items-center justify-end gap-2 px-1">
          <span className="text-[10px] uppercase tracking-widest text-game-muted">Army Might</span>
          <span className="text-xl font-black text-game-accent tabular-nums">{totalMight}</span>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════ PAGE SHELL ═════════════════════════════════════

export function Armory() {
  const units      = useGameStore((s) => s.units)
  const equipment  = useGameStore((s) => s.equipment)
  const equipItem  = useGameStore((s) => s.equipItem)

  const [mode, setMode]               = useState<'atelier' | 'matrix'>('atelier')
  const [selectedId, setSelectedId]   = useState(units[0]?.id ?? '')
  const [armyDoctrine, setArmyDoctrine] = useState<DoctrineId>('auto')
  const [heroDoctrine, setHeroDoctrine] = useState<Record<string, DoctrineId>>({})
  const [locked, setLocked]           = useState<Set<string>>(new Set())
  const [plan, setPlan]               = useState<Record<string, HeroPlan> | null>(null)
  // Matrix picker target (re-uses the Atelier slot picker as an overlay).
  const [matrixPick, setMatrixPick]   = useState<{ unitId: string; slot: EquipSlot } | null>(null)

  const equipById = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment])
  const doctrineFor = (u: Unit): Doctrine => resolveDoctrine(heroDoctrine[u.id] ?? armyDoctrine, u)

  // Apply a HeroPlan's changes through the real equip mutation.
  function applyPlan(p: HeroPlan, unitId: string) {
    for (const c of p.changes) {
      equipItem(unitId, c.slot, c.to)
      if (c.slot === 'mainHand' && c.to && equipById.get(c.to)?.category === 'weapon-2h') equipItem(unitId, 'offHand', null)
    }
  }
  function runArmy() {
    const p = optimizeArmy(units, equipment, doctrineFor, (u) => locked.has(u.id))
    setPlan(p)
  }
  function applyAll() {
    if (!plan) return
    for (const [id, p] of Object.entries(plan)) if (!locked.has(id)) applyPlan(p, id)
    setPlan(null)
  }
  function optimizeOne(id: string) {
    const u = units.find((x) => x.id === id); if (!u) return
    const p = optimizeHero(u, units, equipment, doctrineFor(u))
    if (p.changes.length) applyPlan(p, id)
  }
  function runColumn(slot: EquipSlot) {
    const picks = optimizeColumn(slot, units, equipment, doctrineFor)
    for (const [id, itemId] of Object.entries(picks)) {
      equipItem(id, slot, itemId)
      if (slot === 'mainHand' && equipById.get(itemId)?.category === 'weapon-2h') equipItem(id, 'offHand', null)
    }
  }
  function applyHeroFromPlan(id: string) {
    const p = plan?.[id]
    if (p) { applyPlan(p, id); setPlan((prev) => { const n = { ...prev }; delete n![id]; return Object.keys(n!).length ? n : null }) }
    else optimizeOne(id)
  }

  const planTotals = useMemo(() => {
    if (!plan) return null
    let dMight = 0, heroes = 0
    for (const [id, p] of Object.entries(plan)) {
      const u = units.find((x) => x.id === id); if (!u) continue
      dMight += heroMight(withLoadout(u, p.loadout), equipment) - heroMight(u, equipment)
      heroes++
    }
    return { dMight, heroes }
  }, [plan, units, equipment])

  const selected = units.find((u) => u.id === selectedId) ?? units[0]

  return (
    <div className="h-full flex flex-col animate-war-rise">
      {/* ── Banner ── */}
      <header className="shrink-0 px-3 py-2 border-b border-game-border bg-gradient-to-r from-game-surface via-game-bg to-game-surface flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🛡</span>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-[0.18em] uppercase text-game-text">The Armory</h1>
            <p className="text-[10px] text-game-muted tracking-wide -mt-0.5">Quartermaster · prototype</p>
          </div>
          {/* mode toggle */}
          <div className="ml-2 flex rounded-lg border border-game-border overflow-hidden">
            {(['atelier', 'matrix'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-2.5 py-1 text-xs font-medium capitalize ${mode === m ? 'bg-game-primary/25 text-game-accent' : 'text-game-muted hover:text-game-text-dim'}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-game-muted">Doctrine</span>
          <DoctrineChips value={armyDoctrine} onChange={(d) => { setArmyDoctrine(d); setPlan(null) }} includeAuto size="sm" />
          <button onClick={runArmy} className="rounded-md bg-game-primary hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 flex items-center gap-1">⚡ Auto-Outfit Army</button>
        </div>
      </header>

      {/* ── Review banner (pending plan) ── */}
      {plan && planTotals && (
        <div className="shrink-0 px-3 py-1.5 bg-game-green/10 border-b border-game-green/30 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-game-green">
            Proposed: <b className="font-bold">+{planTotals.dMight} Might</b> across {planTotals.heroes} hero{planTotals.heroes !== 1 ? 'es' : ''}
            <span className="text-game-muted"> · review per-hero or apply all</span>
          </span>
          <div className="flex gap-1.5">
            <button onClick={applyAll} className="rounded-md bg-game-green hover:bg-emerald-500 text-game-bg text-xs font-bold px-3 py-1">Apply All ✓</button>
            <button onClick={() => setPlan(null)} className="rounded-md border border-game-border text-game-text-dim text-xs px-3 py-1 hover:border-red-400/60 hover:text-red-300">Discard</button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Roster rail (shared) */}
        <aside className="lg:w-[220px] shrink-0 border-b lg:border-b-0 lg:border-r border-game-border bg-game-surface/30 flex flex-col">
          <div className="px-3 py-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-game-text-dim">Army</h3>
            <span className="text-[10px] text-game-muted">{units.length}</span>
          </div>
          <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto px-2 pb-2">
            {units.map((u) => {
              const isSel = u.id === selectedId
              const p = plan?.[u.id]
              const dMight = p ? heroMight(withLoadout(u, p.loadout), equipment) - heroMight(u, equipment) : 0
              const lock = locked.has(u.id)
              return (
                <div key={u.id}
                  className={[
                    'shrink-0 lg:shrink rounded-lg border px-2 py-1.5 flex items-center gap-2 cursor-pointer transition-colors min-w-[150px]',
                    isSel ? 'border-game-accent bg-game-accent/10' : 'border-game-border bg-game-bg/40 hover:border-game-primary/50',
                  ].join(' ')}
                  onClick={() => { setSelectedId(u.id); if (mode === 'matrix') setMode('atelier') }}
                >
                  <span className="w-8 h-8 rounded-md border border-game-border bg-game-bg/60 flex items-center justify-center text-lg shrink-0">{heroGlyph(u)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-game-text truncate">{u.name}</div>
                    <div className="text-[10px] text-game-muted flex items-center gap-1">
                      <span className="tabular-nums text-game-text-dim">⚔{heroMight(u, equipment)}</span>
                      {dMight > 0 && <span className="text-game-green font-bold">↑{dMight}</span>}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setLocked((s) => { const n = new Set(s); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n }) }}
                    title={lock ? 'Locked — excluded from Auto-Outfit' : 'Lock this hero'}
                    className={`shrink-0 text-sm ${lock ? 'text-game-gold' : 'text-game-muted/50 hover:text-game-text-dim'}`}
                  >{lock ? '🔒' : '🔓'}</button>
                </div>
              )
            })}
          </div>
          {/* per-hero doctrine override for the selected hero */}
          {mode === 'atelier' && selected && (
            <div className="mt-auto border-t border-game-border px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-game-muted mb-1">{selected.name.split(' ')[0]}'s role</div>
              <DoctrineChips
                value={heroDoctrine[selected.id] ?? 'auto'}
                onChange={(d) => setHeroDoctrine((m) => ({ ...m, [selected.id]: d }))}
                includeAuto size="sm"
              />
              <div className="text-[9px] text-game-muted mt-1">default: {DOCTRINES[defaultDoctrine(selected)].name}</div>
            </div>
          )}
        </aside>

        {/* Main view */}
        {mode === 'atelier' ? (
          <AtelierView units={units} equipment={equipment} selectedId={selectedId} doctrineFor={doctrineFor} plan={plan} onApplyHero={applyHeroFromPlan} />
        ) : (
          <MatrixView units={units} equipment={equipment} doctrineFor={doctrineFor}
            onPickCell={(unitId, slot) => setMatrixPick({ unitId, slot })}
            onColumn={runColumn} />
        )}
      </div>

      {/* Matrix cell picker overlay */}
      {matrixPick && (() => {
        const u = units.find((x) => x.id === matrixPick.unitId)
        if (!u) return null
        return (
          <div className="fixed inset-0 z-50 bg-game-bg/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => setMatrixPick(null)}>
            <div className="w-full max-w-md max-h-[70vh] rounded-xl border border-game-border bg-game-surface p-3 flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-md border border-game-border bg-game-bg/60 flex items-center justify-center text-lg">{heroGlyph(u)}</span>
                  <span className="text-sm font-semibold text-game-text">{u.name}</span>
                </div>
                <button onClick={() => setMatrixPick(null)} className="text-game-muted hover:text-game-text text-lg leading-none">✕</button>
              </div>
              <SlotPicker unit={u} slot={matrixPick.slot} units={units} equipment={equipment} doctrine={doctrineFor(u)} onHover={() => {}} />
            </div>
          </div>
        )
      })()}
    </div>
  )
}
