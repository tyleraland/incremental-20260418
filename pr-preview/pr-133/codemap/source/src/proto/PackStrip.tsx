import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DROP_ITEMS } from '@/data/monsters'
import { consumableDef } from '@/data/consumables'
import { useGameStore } from '@/stores/useGameStore'
import { WEIGHT_LIMIT, heroCarried, heroFull, isOverweight, materialValue, itemWeight } from './economy'
import { categorize } from './expedition'
import type { EquipSlot, Unit } from '@/types'

// A hero's Inventory — a read-only, collapsible grid of everything they hold:
// carried Supplies (consumables) + field Loot (drops), plus the Equipment they're
// wearing (for reference; worn gear doesn't count against carry weight). Filter to
// one group, or All. Tap any item for its name, description, and weight.

const COLS = 8
// Equipment the hero is wearing reads as "Equipped". Supplies + Loot are what
// they actually carry, so those show by default; Equipped is excluded by default.
type Group = 'Supplies' | 'Loot' | 'Equipped'
const GROUPS: Group[] = ['Supplies', 'Loot', 'Equipped']
const DEFAULT_INCLUDED: Group[] = ['Supplies', 'Loot']
const GEAR_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'armor', 'accessory', 'sideboard1', 'sideboard2']

interface InvItem { key: string; name: string; qty: number; weight: number; group: Group; category: string; description: string }

const itemName = (id: string) => DROP_ITEMS[id] ?? consumableDef(id)?.name ?? id
const abbrev = (name: string) => name.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()

function lootDescription(id: string): string {
  const c = consumableDef(id)
  if (c) return c.description
  return `${categorize(id)} · sells for ~${materialValue(id)}g each.`
}

// Tap-an-item detail: name, description, quantity, weight, category.
function ItemDetail({ item, onClose }: { item: InvItem; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-game-border bg-game-surface p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-game-text flex-1">{item.name}</span>
          <span className="text-[10px] uppercase tracking-wider text-game-muted">{item.group}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-game-border text-game-text hover:bg-game-border/50">✕</button>
        </div>
        <div className="text-[11px] text-game-text-dim leading-snug">{item.description}</div>
        <div className="flex items-center gap-4 text-[11px] text-game-text-dim pt-1 border-t border-game-border/60">
          <span>Quantity <span className="font-mono text-game-text tabular-nums">{item.qty}</span></span>
          <span>Weight (each) <span className="font-mono text-game-text tabular-nums">{item.weight}</span></span>
          <span>Category <span className="text-game-text">{item.category}</span></span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function PackStrip({ unit }: { unit: Unit }) {
  const loot = useGameStore((s) => s.packs[unit.id])
  const equipment = useGameStore((s) => s.equipment)
  const [open, setOpen] = useState(false)
  const [included, setIncluded] = useState<Set<Group>>(() => new Set<Group>(DEFAULT_INCLUDED))
  const [detail, setDetail] = useState<InvItem | null>(null)
  const toggleGroup = (g: Group) => setIncluded((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })

  const weight = heroCarried(loot, unit.pack)
  const pct = Math.round((weight / WEIGHT_LIMIT) * 100)
  const full = heroFull(loot, unit.pack)

  // Build the three groups into one unified item list.
  const items: InvItem[] = []
  for (const p of unit.pack ?? []) if (p.count > 0)
    items.push({ key: `s:${p.itemId}`, name: itemName(p.itemId), qty: p.count, weight: itemWeight(p.itemId), group: 'Supplies', category: 'Consumable', description: lootDescription(p.itemId) })
  for (const [id, q] of Object.entries(loot ?? {})) if (q > 0)
    items.push({ key: `l:${id}`, name: itemName(id), qty: q, weight: itemWeight(id), group: 'Loot', category: categorize(id), description: lootDescription(id) })
  for (const slot of GEAR_SLOTS) {
    const id = slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]
    const it = id ? equipment.find((e) => e.id === id) : undefined
    if (it) items.push({ key: `e:${slot}:${it.id}`, name: it.name, qty: 1, weight: itemWeight(it.id), group: 'Equipped', category: it.category, description: it.description ?? `${it.category} — currently equipped.` })
  }

  const shown = items.filter((i) => included.has(i.group))
  const count = (g: Group) => items.reduce((n, i) => n + (i.group === g ? 1 : 0), 0)

  // 8 cols; at least one row, padded with empty slots; grows + scrolls.
  const rows = Math.max(1, Math.ceil(shown.length / COLS))
  const cells = Array.from({ length: rows * COLS }, (_, i) => shown[i] ?? null)

  return (
    <div className="rounded-lg border border-game-border bg-game-bg/60 p-2.5 mb-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Inventory</span>
        <span className={`text-[11px] font-mono tabular-nums ${full ? 'text-red-400 font-semibold' : 'text-game-text-dim'}`}>{weight} / {WEIGHT_LIMIT} ({pct}%)</span>
        {!full && isOverweight(loot, unit.pack) && (
          <span title="Minor Overweight — penalties coming soon." className="text-[9px] px-1 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-300">⚠ Overweight</span>
        )}
        <span className="ml-auto text-game-text-dim text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* include/exclude filters — white = showing, red = hidden. Tap to toggle. */}
          <div className="flex gap-1 flex-wrap">
            {GROUPS.map((g) => {
              const on = included.has(g)
              return (
                <button key={g} onClick={() => toggleGroup(g)} title={on ? `Showing ${g} — tap to hide` : `Hiding ${g} — tap to show`}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${on ? 'border-game-text/50 bg-white/10 text-game-text' : 'border-red-500/60 bg-red-500/10 text-red-300 line-through'}`}>
                  {g} <span className="tabular-nums opacity-70 no-underline">{count(g)}</span>
                </button>
              )
            })}
          </div>

          <div className="max-h-32 overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {cells.map((entry, i) => {
                if (!entry) return <div key={`e${i}`} className="aspect-square rounded border border-dashed border-game-border/40" />
                const ring = entry.group === 'Equipped' ? 'border-sky-700/50' : entry.group === 'Supplies' ? 'border-emerald-700/50' : 'border-game-border'
                return (
                  <button key={entry.key} onClick={() => setDetail(entry)} title={`${entry.name}${entry.qty > 1 ? ` ×${entry.qty}` : ''}`}
                    className={`relative aspect-square rounded border ${ring} bg-game-bg/40 hover:border-game-primary/50 flex flex-col items-center justify-center leading-none`}>
                    <span className="text-[7px] text-game-text-dim">{abbrev(entry.name)}</span>
                    {entry.qty > 1 && <span className="text-[10px] font-mono tabular-nums text-game-text">{entry.qty}</span>}
                  </button>
                )
              })}
            </div>
            {shown.length === 0 && <div className="text-[10px] text-game-muted italic mt-1">{included.size === 0 ? 'All groups hidden — tap a filter to show it.' : 'Nothing here yet — fills with loot in the field.'}</div>}
          </div>
        </div>
      )}

      {detail && <ItemDetail item={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
