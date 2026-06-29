import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DROP_ITEMS } from '@/data/monsters'
import { consumableDef } from '@/data/consumables'
import { useProtoStore } from './protoStore'
import { WEIGHT_LIMIT, heroCarried, heroFull, isOverweight, materialValue, itemWeight } from './economy'
import { categorize } from './expedition'
import type { Unit } from '@/types'

// A hero's personal pack — a read-only, collapsible inventory grid of the item
// stacks they're carrying. Filled by the logistics driver; capacity is a total
// weight (WEIGHT_LIMIT). 8 columns; grows + scrolls as more types are picked up.

const COLS = 8
const itemName = (id: string) => DROP_ITEMS[id] ?? consumableDef(id)?.name ?? id
const abbrev = (id: string) => itemName(id).replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()

function itemDescription(id: string): string {
  const c = consumableDef(id)
  if (c) return c.description
  return `${categorize(id)} · sells for ~${materialValue(id)}g each.`
}

// Tap-an-item detail: name, description, quantity, and the weight of one.
function ItemDetail({ itemId, qty, onClose }: { itemId: string; qty: number; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-game-border bg-game-surface p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-game-text flex-1">{itemName(itemId)}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-game-border text-game-text hover:bg-game-border/50">✕</button>
        </div>
        <div className="text-[11px] text-game-text-dim leading-snug">{itemDescription(itemId)}</div>
        <div className="flex items-center gap-4 text-[11px] text-game-text-dim pt-1 border-t border-game-border/60">
          <span>Quantity <span className="font-mono text-game-text tabular-nums">{qty}</span></span>
          <span>Weight (each) <span className="font-mono text-game-text tabular-nums">{itemWeight(itemId)}</span></span>
          <span>Category <span className="text-game-text">{categorize(itemId)}</span></span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function PackStrip({ unit }: { unit: Unit }) {
  const pack = useProtoStore((s) => s.packs[unit.id])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

  const weight = heroCarried(pack, unit.pack)
  const pct = Math.round((weight / WEIGHT_LIMIT) * 100)
  const full = heroFull(pack, unit.pack)
  // Everything the hero is carrying: field loot (protoStore) + consumables (Unit.pack).
  const merged: Record<string, number> = { ...(pack ?? {}) }
  for (const p of unit.pack ?? []) if (p.count > 0) merged[p.itemId] = (merged[p.itemId] ?? 0) + p.count
  const entries = Object.entries(merged).filter(([, q]) => q > 0)
  // 8 cols; at least one row, padded with empty slots; grows + scrolls.
  const rows = Math.max(1, Math.ceil(entries.length / COLS))
  const cells = Array.from({ length: rows * COLS }, (_, i) => entries[i] ?? null)

  return (
    <div className="rounded-lg border border-game-border bg-game-bg/60 p-2.5 mb-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Field Loot</span>
        <span className={`text-[11px] font-mono tabular-nums ${full ? 'text-red-400 font-semibold' : 'text-game-text-dim'}`}>{weight} / {WEIGHT_LIMIT} ({pct}%)</span>
        {!full && isOverweight(pack, unit.pack) && (
          <span title="Minor Overweight — penalties coming soon." className="text-[9px] px-1 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-300">⚠ Overweight</span>
        )}
        <span className="ml-auto text-game-text-dim text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-2 max-h-32 overflow-y-auto">
          <div className="grid grid-cols-8 gap-1">
            {cells.map((entry, i) => {
              if (!entry) return <div key={`e${i}`} className="aspect-square rounded border border-dashed border-game-border/40" />
              const [id, q] = entry
              return (
                <button key={id} onClick={() => setDetail(id)} title={`${itemName(id)} ×${q}`}
                  className="relative aspect-square rounded border border-game-border bg-game-bg/40 hover:border-game-primary/50 flex flex-col items-center justify-center leading-none">
                  <span className="text-[7px] text-game-text-dim">{abbrev(id)}</span>
                  <span className="text-[10px] font-mono tabular-nums text-game-text">{q}</span>
                </button>
              )
            })}
          </div>
          {entries.length === 0 && <div className="text-[10px] text-game-muted italic mt-1">Empty — fills with loot in the field.</div>}
        </div>
      )}

      {detail && <ItemDetail itemId={detail} qty={merged[detail] ?? 0} onClose={() => setDetail(null)} />}
    </div>
  )
}
