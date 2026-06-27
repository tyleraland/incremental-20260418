import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import { MONSTER_REGISTRY, DROP_ITEMS } from '@/data/monsters'
import { consumableDef } from '@/data/consumables'
import { useProtoStore } from './protoStore'
import { CARRY_CAPACITY, packCount, packFull, materialValue, itemWeight } from './economy'
import { categorize } from './expedition'
import type { Unit, Location } from '@/types'

// A hero's personal pack (the carry exploration) — an inventory grid of item
// stacks. Drops are mocked via ⚔ Hunt (and the logistics driver) so the carry →
// deposit flow can be felt; Deposit moves the pack into shared town storage.

const GRID = 20   // 10 × 2 inventory slots
const itemName = (id: string) => DROP_ITEMS[id] ?? consumableDef(id)?.name ?? id
const abbrev = (id: string) => itemName(id).replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()

function itemDescription(id: string): string {
  const c = consumableDef(id)
  if (c) return c.description
  return `${categorize(id)} · sells for ~${materialValue(id)}g each.`
}

function huntDrops(u: Unit, locations: Location[]): { itemId: string; qty: number }[] {
  const loc = u.locationId ? locations.find((l) => l.id === u.locationId) : null
  const pool = loc && loc.monsterIds.length
    ? loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
    : [{ itemId: 'drop-slime-gel', dropRate: 1, quantityMin: 1, quantityMax: 3 }]
  const out: { itemId: string; qty: number }[] = []
  for (const d of pool) if (Math.random() < d.dropRate) out.push({ itemId: d.itemId, qty: d.quantityMin + Math.floor(Math.random() * (d.quantityMax - d.quantityMin + 1)) })
  if (out.length === 0) out.push({ itemId: pool[0]?.itemId ?? 'drop-slime-gel', qty: 1 })
  return out
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
  const locations = useGameStore((s) => s.locations)
  const pack = useProtoStore((s) => s.packs[unit.id])
  const depositPack  = useProtoStore((s) => s.depositPack)
  const simulateHunt = useProtoStore((s) => s.simulateHunt)
  const [detail, setDetail] = useState<string | null>(null)

  const count = packCount(pack)
  const pct = Math.round((count / CARRY_CAPACITY) * 100)
  const full = packFull(pack)
  const entries = pack ? Object.entries(pack).filter(([, q]) => q > 0) : []
  const cells = Array.from({ length: GRID }, (_, i) => entries[i] ?? null)

  return (
    <div className="rounded-lg border border-game-border bg-game-bg/60 p-2.5 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Field Loot</span>
        <span className={`text-[11px] font-mono tabular-nums ${full ? 'text-red-400 font-semibold' : 'text-game-text-dim'}`}>{count} / {CARRY_CAPACITY} ({pct}%)</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => simulateHunt(unit.id, huntDrops(unit, locations))} disabled={full}
            title={full ? 'Pack full — deposit first' : 'Simulate a hunt (mock drops)'}
            className={['text-[10px] px-2 py-0.5 rounded border', full ? 'border-game-border text-game-muted cursor-not-allowed' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}>⚔ Hunt</button>
          <button onClick={() => depositPack(unit.id)} disabled={count <= 0}
            className={['text-[10px] px-2 py-0.5 rounded border', count > 0 ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}>⇩ Deposit</button>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1">
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

      {detail && <ItemDetail itemId={detail} qty={pack?.[detail] ?? 0} onClose={() => setDetail(null)} />}
    </div>
  )
}
