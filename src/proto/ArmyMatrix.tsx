import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useGameStore, getInitials, getDerivedStats, getAvailableSkills, SKILL_REGISTRY,
  TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS, type Unit, type DerivedStats,
} from '@/stores/useGameStore'
import { SLOT_LABELS, SLOT_COMPATIBLE } from '@/data/equipment'
import { ACTION_SLOT_COUNT } from '@/types'
import type { EquipSlot, EquipmentItem, WeaponRecord, ActionSlotEntry } from '@/types'
// ── Army Matrix ────────────────────────────────────────────────────────────--
//
// The squad command surface beside the battlefield. One grid, three facets you
// toggle between — Equipment (gear slots), Skills (action-bar slots), and Tactics
// (channel rows) — with the battlefield party as columns. Every cell is tappable
// to assign. ✨ Suggest ghosts a recommended pick per cell (class-fit tactics /
// best-scoring gear); the player taps an individual ghost cell to apply just that one.

type Facet = 'gear' | 'skills' | 'tactics'
const FACETS: { id: Facet; label: string }[] = [
  { id: 'gear', label: 'Equipment' }, { id: 'skills', label: 'Skills' }, { id: 'tactics', label: 'Tactics' },
]
// Action-bar columns for the Skills facet (slot index → header label).
const SKILL_COLS = Array.from({ length: ACTION_SLOT_COUNT }, (_, i) => ({ id: `slot:${i}`, label: `${i + 1}` }))
const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }
const CHANNELS: { id: string; label: string }[] = [
  { id: 'movement', label: 'Move' }, { id: 'targeting', label: 'Target' },
  { id: 'action', label: 'Action' }, { id: 'reaction', label: 'React' }, { id: 'passive', label: 'Passive' },
]
const GEAR_ROWS: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'accessory']

// ── shared gear helpers ───────────────────────────────────────────────────────
function itemFor(unit: Unit, slot: EquipSlot, equipment: EquipmentItem[]): EquipmentItem | undefined {
  const id = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
  return equipment.find((e) => e.id === id)
}
function withItem(unit: Unit, slot: EquipSlot, itemId: string | null): Unit {
  if (slot === 'mainHand' || slot === 'offHand') {
    const weaponSets = unit.weaponSets.map((ws, i) =>
      i === unit.activeWeaponSet ? { ...ws, [slot]: itemId } : ws) as [WeaponRecord, WeaponRecord]
    return { ...unit, weaponSets }
  }
  return { ...unit, equipment: { ...unit.equipment, [slot]: itemId } }
}
// Crude, class-weighted fit score so Optimize can pick "best in slot" for the
// mock: casters value magic stats, martials value physical (so a Mage isn't
// handed a bow over a staff). Range is excluded so a long-but-weak bow doesn't
// outscore stronger weapons.
function itemScore(it: EquipmentItem, unit: Unit): number {
  const s = it.stats
  const caster = unit.class === 'Mage' || unit.class === 'Cleric'
  const atkW = caster ? 0.3 : 1, matkW = caster ? 1 : 0.3
  return (s.attack ?? 0) * atkW + (s.defense ?? 0) + (s.specialAttack ?? 0) * matkW + (s.specialDefense ?? 0)
}
function bestInSlot(unit: Unit, slot: EquipSlot, equipment: EquipmentItem[]): EquipmentItem | null {
  const cur = itemFor(unit, slot, equipment)
  // Upgrade within the worn item's category (don't hand a Fighter a bow); only
  // an empty slot is free to take the best of any compatible category.
  const compat = equipment.filter((e) =>
    SLOT_COMPATIBLE[slot].includes(e.category)
    && (!cur || e.category === cur.category)
    && !((e.stats.range ?? 0) > 10 && unit.class !== 'Ranger')) // no bows for melee
  if (compat.length === 0) return null
  const best = compat.reduce((a, b) => (itemScore(b, unit) > itemScore(a, unit) ? b : a))
  if (cur && (best.id === cur.id || itemScore(best, unit) <= itemScore(cur, unit))) return null
  return best
}

export function ArmyMatrix({ squad, locationName, onHero }: { squad: Unit[]; locationName: string; onHero?: (id: string) => void }) {
  const equipment     = useGameStore((s) => s.equipment)
  const locations     = useGameStore((s) => s.locations)
  const partyTactics  = useGameStore((s) => s.partyTactics)
  const equipTactic   = useGameStore((s) => s.equipTactic)
  const unequipTactic = useGameStore((s) => s.unequipTactic)
  const equipItem     = useGameStore((s) => s.equipItem)
  const setActionSlot = useGameStore((s) => s.setActionSlot)

  const [facet, setFacet] = useState<Facet>('gear')
  // Suggest just ghosts one recommended pick per cell; the player taps an
  // individual ghost cell to apply (or change) it — no bulk commit.
  const [suggesting, setSuggesting] = useState(false)
  const [picker, setPicker] = useState<{ unit: Unit; key: string } | null>(null)
  const pickFacet = (f: Facet) => { setFacet(f); setSuggesting(false) }

  if (squad.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-center">
        <div>
          <div className="text-4xl mb-2 opacity-40">☷</div>
          <div className="text-sm text-game-text-dim">No party on this battlefield</div>
          <div className="text-xs text-game-muted mt-1 max-w-[16rem]">Deploy heroes here (World → Deploy) or focus a location with heroes to command them.</div>
        </div>
      </div>
    )
  }

  // What-if proposals for the active facet (non-locked heroes only).
  // tactics: heroId → tacticIds to add · gear: heroId → {slot: itemId}
  const tacticProps: Record<string, string[]> = {}
  const gearProps: Record<string, Partial<Record<EquipSlot, string>>> = {}
  for (const u of squad) {
    if (facet === 'tactics') {
      // Placeholder "intelligence": casters kite, everyone else charges. The real
      // recommendation engine lands later (see BACKLOG.md → UI Tactician shell).
      const want = (u.class === 'Mage' || u.class === 'Cleric') ? 'kiter' : 'charger'
      const equipped = new Set(u.tactics.map((t) => t.id))
      const free = MAX_UNIT_TACTICS - u.tactics.length
      if (TACTIC_REGISTRY[want] && !equipped.has(want) && free > 0) tacticProps[u.id] = [want]
    } else if (facet === 'gear') {
      const g: Partial<Record<EquipSlot, string>> = {}
      for (const slot of GEAR_ROWS) {
        const mh = itemFor(u, 'mainHand', equipment)
        if (slot === 'offHand' && mh?.category === 'weapon-2h') continue
        const best = bestInSlot(u, slot, equipment)
        if (best) g[slot] = best.id
      }
      if (Object.keys(g).length) gearProps[u.id] = g
    }
    // skills: no auto proposal yet (the bar is hand-tuned).
  }
  const hasProps = facet === 'tactics'
    ? Object.values(tacticProps).some((a) => a.length)
    : facet === 'gear'
    ? Object.values(gearProps).some((g) => Object.keys(g).length)
    : false

  // Columns = the facet types (gear slots / action-bar slots / tactic channels),
  // laid out horizontally; heroes are the rows and scroll vertically.
  const cols = facet === 'tactics' ? CHANNELS.map((c) => ({ id: c.id, label: c.label }))
    : facet === 'gear' ? GEAR_ROWS.map((s) => ({ id: s, label: SLOT_LABELS[s] }))
    : SKILL_COLS

  // Hero rows grouped by where they are (deployed locations, then idle at guild).
  const groupMap = new Map<string, Unit[]>()
  for (const u of squad) { const k = u.locationId ?? '__guild__'; const a = groupMap.get(k); if (a) a.push(u); else groupMap.set(k, [u]) }
  const heroGroups = [...groupMap.entries()]
    .map(([k, us]) => ({ k, name: k === '__guild__' ? 'Guild · idle' : (locations.find((l) => l.id === k)?.name ?? k), units: us }))
    .sort((a, b) => (a.k === '__guild__' ? 1 : 0) - (b.k === '__guild__' ? 1 : 0) || a.name.localeCompare(b.name))

  return (
    <div className="space-y-3">
      {/* command bar: facet toggle + Suggest (ghosts; tap a ghost cell to apply) */}
      <div className="flex items-center gap-1.5">
        {FACETS.map((f) => (
          <button
            key={f.id}
            onClick={() => pickFacet(f.id)}
            className={['text-xs px-3 py-1 rounded-lg border transition-colors', facet === f.id
              ? 'border-game-primary/60 bg-game-primary/15 text-game-text'
              : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}
          >{f.label}</button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => setSuggesting((v) => !v)}
            disabled={!hasProps && !suggesting}
            title={suggesting ? 'Hide suggestions' : 'Suggest a loadout — ghosts one pick per cell; tap a ghost cell to apply just that one'}
            className={['text-xs px-3 py-1 rounded-lg border transition-colors',
              suggesting ? 'border-game-accent bg-game-accent/20 text-game-accent'
                : hasProps ? 'border-game-accent/60 bg-game-accent/10 text-game-accent hover:bg-game-accent/20'
                : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
          >{suggesting ? 'Suggesting' : 'Suggest'}</button>
        </div>
      </div>

      {partyTactics.length > 0 && facet === 'tactics' && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-game-secondary/30 bg-game-secondary/5 px-3 py-2">
          <span className="text-[11px] uppercase tracking-wider text-game-secondary">Party</span>
          {partyTactics.map((t) => (
            <span key={t.id} className="text-xs px-2 py-1 rounded bg-game-secondary/15 text-game-text" title={TACTIC_REGISTRY[t.id]?.description}>{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
          ))}
        </div>
      )}

      {/* matrix — heroes are rows (vertical scroll); facet types are columns */}
      <div className="overflow-x-auto -mx-3 px-3">
        <div className="min-w-max">
          {/* column header row: hero label + facet-type columns (multi-word labels
              like "Main Hand" stack to keep the columns narrow) */}
          <div className="flex border-b-2 border-game-border">
            <div className="w-24 shrink-0 py-2 text-xs uppercase tracking-wider text-game-text-dim sticky left-0 bg-game-surface z-10">Hero</div>
            {cols.map((col) => (
              <div key={col.id} className="w-20 shrink-0 px-1.5 py-1.5 text-[10px] uppercase tracking-wider text-game-text-dim border-l border-game-border/40 leading-tight text-center">
                {col.label.split(' ').map((w) => <div key={w}>{w}</div>)}
              </div>
            ))}
          </div>

          {/* heroes grouped by location; one row per hero */}
          {heroGroups.map((g) => (
          <div key={g.k}>
            {/* location group header (label parked in the sticky hero column) */}
            <div className="flex border-t-2 border-game-border">
              <div className="w-24 shrink-0 px-2 py-1 text-[11px] uppercase tracking-wider text-game-text-dim sticky left-0 bg-game-bg z-10 truncate">⌖ {g.name} <span className="text-game-muted normal-case tracking-normal">({g.units.length})</span></div>
              {cols.map((col) => <div key={col.id} className="w-20 shrink-0 bg-game-bg/40" />)}
            </div>
            {g.units.map((u) => (
              <div key={u.id} className="flex border-t border-game-border/50">
                {/* hero cell (sticky on horizontal scroll) */}
                <div className="w-24 shrink-0 py-1.5 pr-1 flex items-center gap-1.5 sticky left-0 z-10 bg-game-surface">
                  <button onClick={() => onHero ? onHero(u.id) : useGameStore.setState({ selectedUnitIds: [u.id], ...(u.locationId ? { selectedLocationId: u.locationId } : {}) })}
                    title={onHero ? 'Open in the Hero lens' : undefined}
                    className="w-9 h-9 rounded-full bg-game-bg border border-game-border flex items-center justify-center text-base shrink-0">
                    {u.class && CLASS_ICON[u.class] ? CLASS_ICON[u.class] : getInitials(u.name)}
                  </button>
                  <button onClick={() => onHero ? onHero(u.id) : useGameStore.setState({ selectedUnitIds: [u.id], ...(u.locationId ? { selectedLocationId: u.locationId } : {}) })} className="min-w-0 flex-1 text-left">
                    <span className="text-sm font-medium text-game-text truncate block">{u.name.split(' ')[0]}</span>
                    <span className="text-[11px] text-game-text-dim truncate block">{u.class ?? 'Novice'}{facet === 'tactics' ? ` · ${u.tactics.length}/${MAX_UNIT_TACTICS}` : facet === 'skills' ? ` · ${(u.actionSlots ?? []).filter(Boolean).length}/${ACTION_SLOT_COUNT}` : ''}</span>
                  </button>
                </div>

                {cols.map((col) => {
                  let body: React.ReactNode
                  if (facet === 'tactics') {
                    const inCh = u.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === col.id)
                    const prop = (tacticProps[u.id] ?? []).filter((id) => TACTIC_REGISTRY[id]?.channel === col.id)
                    body = (
                      <>
                        {inCh.length === 0 && (!suggesting || prop.length === 0) && <span className="text-sm text-game-muted">＋</span>}
                        {inCh.map((t, i) => (
                          <div key={t.id} className="flex items-center justify-center gap-1 min-w-0">
                            <span className="text-[10px] text-game-muted tabular-nums shrink-0">{i + 1}</span>
                            <span className="text-xs text-game-text leading-tight line-clamp-2">{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
                          </div>
                        ))}
                        {suggesting && prop.map((id) => (
                          <div key={id} className="flex items-center justify-center gap-1 min-w-0 rounded border border-dashed border-game-accent/60 bg-game-accent/5 px-1">
                            <span className="text-[10px] text-game-accent shrink-0">+</span>
                            <span className="text-xs text-game-accent leading-tight line-clamp-2">{TACTIC_REGISTRY[id]?.name ?? id}</span>
                          </div>
                        ))}
                      </>
                    )
                  } else if (facet === 'gear') {
                    const slot = col.id as EquipSlot
                    const mh = itemFor(u, 'mainHand', equipment)
                    const slotLocked = slot === 'offHand' && mh?.category === 'weapon-2h'
                    const it = itemFor(u, slot, equipment)
                    const propId = suggesting ? gearProps[u.id]?.[slot] : undefined
                    const propItem = propId ? equipment.find((e) => e.id === propId) : undefined
                    body = slotLocked ? <span className="text-xs text-game-muted italic">2H</span> : (
                      <>
                        <span className={['text-xs leading-tight block line-clamp-2', it ? 'text-game-text' : 'text-game-muted italic'].join(' ')}>{it?.name ?? '＋'}</span>
                        {propItem && (
                          <div className="flex items-center justify-center gap-1 min-w-0 rounded border border-dashed border-game-accent/60 bg-game-accent/5 px-1 mt-0.5">
                            <span className="text-[10px] text-game-accent shrink-0">→</span>
                            <span className="text-xs text-game-accent leading-tight line-clamp-2">{propItem.name}</span>
                          </div>
                        )}
                      </>
                    )
                  } else {
                    // skills: one column per action-bar slot — show what's loaded there.
                    const idx = Number(col.id.split(':')[1])
                    const entry = (u.actionSlots ?? [])[idx] ?? null
                    const name = entry
                      ? (entry.kind === 'skill' ? (SKILL_REGISTRY[entry.id]?.name ?? entry.id) : entry.id)
                      : null
                    body = <span className={['text-xs leading-tight block line-clamp-2', name ? 'text-game-text' : 'text-game-muted italic'].join(' ')}>{name ?? '＋'}</span>
                  }
                  return (
                    <button
                      key={col.id}
                      data-cell={`${u.id}:${col.id}`}
                      onClick={() => setPicker({ unit: u, key: col.id })}
                      className="w-20 shrink-0 min-h-[2.25rem] py-1.5 px-2 text-center space-y-0.5 border-l border-game-border/30 hover:bg-white/5 transition-colors overflow-hidden"
                    >{body}</button>
                  )
                })}
              </div>
            ))}
          </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-game-muted italic">
        Tap a cell to assign · ✨ Suggest ghosts a pick per cell; tap a ghost to apply just it.
      </div>

      {picker && facet === 'tactics' && createPortal(
        <TacticPicker unit={picker.unit} channel={picker.key}
          suggestedId={suggesting ? (tacticProps[picker.unit.id] ?? []).find((id) => TACTIC_REGISTRY[id]?.channel === picker.key) : undefined}
          onAdd={(id) => equipTactic(picker.unit.id, id)} onRemove={(id) => unequipTactic(picker.unit.id, id)}
          onClose={() => setPicker(null)} />, document.body)}
      {picker && facet === 'gear' && createPortal(
        <GearPicker unit={picker.unit} slot={picker.key as EquipSlot} equipment={equipment}
          suggestedId={suggesting ? gearProps[picker.unit.id]?.[picker.key as EquipSlot] : undefined}
          onEquip={(id) => equipItem(picker.unit.id, picker.key as EquipSlot, id)}
          onClose={() => setPicker(null)} />, document.body)}
      {picker && facet === 'skills' && createPortal(
        <SkillSlotPicker unit={picker.unit} slotIdx={Number(picker.key.split(':')[1])}
          onAssign={(entry) => setActionSlot(picker.unit.id, Number(picker.key.split(':')[1]), entry)}
          onClose={() => setPicker(null)} />, document.body)}
    </div>
  )
}

// ── pickers (portal modals) ───────────────────────────────────────────────────
function Modal({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full sm:max-w-sm max-h-[70vh] flex flex-col bg-game-surface border border-game-border rounded-t-2xl sm:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-game-border flex items-center gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-game-text-dim">{title}</div>
            <div className="text-xs text-game-text-dim">{sub}</div>
          </div>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function TacticPicker({ unit, channel, suggestedId, onAdd, onRemove, onClose }: {
  unit: Unit; channel: string; suggestedId?: string; onAdd: (id: string) => void; onRemove: (id: string) => void; onClose: () => void
}) {
  const live = useGameStore((s) => s.units.find((u) => u.id === unit.id)) ?? unit
  const chLabel = CHANNELS.find((c) => c.id === channel)?.label ?? channel
  const equipped = live.tactics.filter((t) => TACTIC_REGISTRY[t.id]?.channel === channel)
  const equippedIds = new Set(live.tactics.map((t) => t.id))
  // The suggested pick floats to the top so it's a single tap away.
  const available = listTactics('unit').filter((d) => d.channel === channel && !equippedIds.has(d.id))
    .sort((a, b) => (a.id === suggestedId ? -1 : 0) - (b.id === suggestedId ? -1 : 0))
  const atCap = live.tactics.length >= MAX_UNIT_TACTICS
  return (
    <Modal title={`${chLabel} · ${live.name.split(' ')[0]}`} sub={`${live.tactics.length}/${MAX_UNIT_TACTICS} tactics`} onClose={onClose}>
      {equipped.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-game-text-dim mb-1">Equipped (priority)</div>
          <div className="space-y-1">
            {equipped.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border border-game-primary/40 bg-game-primary/10 px-2 py-1.5">
                <span className="text-[10px] text-game-muted tabular-nums">{i + 1}</span>
                <span className="text-xs text-game-text flex-1">{TACTIC_REGISTRY[t.id]?.name ?? t.id}</span>
                <button onClick={() => onRemove(t.id)} className="text-[10px] text-red-300 hover:text-red-200">remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-game-text-dim mb-1">{atCap ? 'Slots full — remove one to add' : 'Available'}</div>
        <div className="space-y-1">
          {available.length === 0 && <div className="text-xs text-game-muted italic">No more {chLabel.toLowerCase()} tactics.</div>}
          {available.map((d) => (
            <button key={d.id} disabled={atCap} onClick={() => onAdd(d.id)}
              className={['w-full text-left rounded-md border px-2 py-1.5 transition-colors',
                atCap ? 'border-game-border opacity-40 cursor-not-allowed'
                  : d.id === suggestedId ? 'border-game-accent/60 bg-game-accent/10 hover:border-game-accent'
                  : 'border-game-border bg-game-bg hover:border-game-primary/50'].join(' ')}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-game-text">{d.name}</span>
                {d.id === suggestedId && <span className="text-[8px] px-1 rounded bg-game-accent/20 text-game-accent">✨ suggested</span>}
                {d.kind === 'floor' && <span className="text-[8px] px-1 rounded bg-game-border text-game-text-dim">floor</span>}
              </div>
              <div className="text-[10px] text-game-text-dim leading-snug">{d.description}</div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// Assign one of a hero's learned active skills to an action-bar slot (or clear
// it). Mirrors the Skills lens's slot picker, scoped to skills for the matrix.
function SkillSlotPicker({ unit, slotIdx, onAssign, onClose }: {
  unit: Unit; slotIdx: number; onAssign: (entry: ActionSlotEntry | null) => void; onClose: () => void
}) {
  const live = useGameStore((s) => s.units.find((u) => u.id === unit.id)) ?? unit
  const slots = live.actionSlots ?? Array<ActionSlotEntry | null>(ACTION_SLOT_COUNT).fill(null)
  const onBar = new Set(slots.filter((e): e is ActionSlotEntry => !!e && e.kind === 'skill').map((e) => e.id))
  const current = slots[slotIdx]
  // Learned ACTIVE skills not already on another slot are the assignable pool.
  const pool = getAvailableSkills(live)
    .filter((e) => e.current > 0 && e.skill.type === 'active')
    .filter((e) => !onBar.has(e.skill.id) || (current?.kind === 'skill' && current.id === e.skill.id))
  return (
    <Modal title={`Slot ${slotIdx + 1} · ${live.name.split(' ')[0]}`} sub="action-bar skill" onClose={onClose}>
      {current && (
        <button onClick={() => { onAssign(null); onClose() }} className="w-full flex items-center justify-between rounded-md border border-game-border/60 bg-game-bg px-2.5 py-1.5 hover:border-red-500/50">
          <span className="text-xs text-game-text-dim italic">Clear {SKILL_REGISTRY[current.id]?.name ?? current.id}</span>
          <span className="text-[10px] text-red-300">remove</span>
        </button>
      )}
      {pool.length === 0 && <div className="text-xs text-game-muted italic">No learned active skills — learn some in the hero's Skill tree.</div>}
      {pool.map(({ skill, current: lvl }) => {
        const equipped = current?.kind === 'skill' && current.id === skill.id
        return (
          <button key={skill.id} onClick={() => { onAssign({ kind: 'skill', id: skill.id }); onClose() }}
            className={['w-full rounded-md border px-2.5 py-2 text-left transition-colors', equipped ? 'border-game-primary/60 bg-game-primary/10' : 'border-game-border bg-game-bg hover:border-game-primary/50'].join(' ')}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-game-text font-medium truncate">{skill.name}</span>
              {equipped ? <span className="text-[10px] text-game-primary shrink-0">on bar</span> : <span className="text-[10px] text-game-text-dim shrink-0">assign ›</span>}
            </div>
            {skill.description && <div className="text-[10px] text-game-text-dim leading-snug mt-0.5">{skill.description(lvl)}</div>}
          </button>
        )
      })}
    </Modal>
  )
}

const GEAR_DELTAS: [keyof DerivedStats, string][] = [
  ['attack', 'ATK'], ['defense', 'DEF'], ['magicAttack', 'M.ATK'], ['magicDefense', 'M.DEF'], ['attackRange', 'RNG'],
]
function GearPicker({ unit, slot, equipment, suggestedId, onEquip, onClose }: {
  unit: Unit; slot: EquipSlot; equipment: EquipmentItem[]; suggestedId?: string; onEquip: (id: string | null) => void; onClose: () => void
}) {
  const live = useGameStore((s) => s.units.find((u) => u.id === unit.id)) ?? unit
  const base = getDerivedStats(live, equipment)
  const current = itemFor(live, slot, equipment)
  // The suggested pick floats to the top so it's a single tap away.
  const candidates = equipment.filter((e) => SLOT_COMPATIBLE[slot].includes(e.category))
    .sort((a, b) => (a.id === suggestedId ? -1 : 0) - (b.id === suggestedId ? -1 : 0))
  return (
    <Modal title={`${SLOT_LABELS[slot]} · ${live.name.split(' ')[0]}`} sub={current ? `worn: ${current.name}` : 'empty'} onClose={onClose}>
      {current && (
        <button onClick={() => onEquip(null)} className="w-full flex items-center justify-between rounded-md border border-game-border/60 bg-game-bg px-2.5 py-1.5 hover:border-red-500/50">
          <span className="text-xs text-game-text-dim italic">Unequip {current.name}</span>
          <span className="text-[10px] text-red-300">remove</span>
        </button>
      )}
      {candidates.length === 0 && <div className="text-xs text-game-muted italic">No compatible items in stash.</div>}
      {candidates.map((it) => {
        const equipped = current?.id === it.id
        const after = getDerivedStats(withItem(live, slot, it.id), equipment)
        const chips = GEAR_DELTAS.map(([k, l]) => {
          const d = Math.round(after[k] as number) - Math.round(base[k] as number)
          return d !== 0 ? { l, d } : null
        }).filter(Boolean) as { l: string; d: number }[]
        const suggested = it.id === suggestedId && !equipped
        return (
          <button key={it.id} onClick={() => onEquip(it.id)}
            className={['w-full rounded-md border px-2.5 py-2 text-left transition-colors',
              equipped ? 'border-game-primary/60 bg-game-primary/10'
                : suggested ? 'border-game-accent/60 bg-game-accent/10 hover:border-game-accent'
                : 'border-game-border bg-game-bg hover:border-game-primary/50'].join(' ')}>
            <div className="flex items-center justify-between mb-1 gap-1.5">
              <span className="text-xs text-game-text font-medium truncate">{it.name}{suggested && <span className="ml-1.5 text-[8px] px-1 rounded bg-game-accent/20 text-game-accent align-middle">✨ suggested</span>}</span>
              {equipped ? <span className="text-[10px] text-game-primary shrink-0">equipped</span> : <span className="text-[10px] text-game-text-dim shrink-0">equip ›</span>}
            </div>
            {equipped ? <span className="text-[10px] text-game-muted">currently worn</span> : chips.length === 0 ? <span className="text-[10px] text-game-muted">no stat change</span> : (
              <div className="flex flex-wrap gap-1">
                {chips.map((c) => (
                  <span key={c.l} className={['text-[10px] px-1.5 py-0.5 rounded tabular-nums', c.d > 0 ? 'bg-game-green/15 text-game-green' : 'bg-red-500/15 text-red-300'].join(' ')}>{c.l} {c.d > 0 ? '+' : ''}{c.d}</span>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </Modal>
  )
}
