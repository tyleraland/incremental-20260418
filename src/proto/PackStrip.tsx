import { useGameStore } from '@/stores/useGameStore'
import { MONSTER_REGISTRY, DROP_ITEMS } from '@/data/monsters'
import { useProtoStore } from './protoStore'
import { CARRY_CAPACITY, packCount, packFull, packValue } from './economy'
import type { Unit, Location } from '@/types'

// A hero's personal pack (the carry exploration) — lives on the per-hero board.
// Drops are mocked via ⚔ Hunt so the carry → deposit flow can be felt; Deposit
// moves the pack into shared town storage.

const dropName = (id: string) => DROP_ITEMS[id] ?? id

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

export function PackStrip({ unit }: { unit: Unit }) {
  const locations = useGameStore((s) => s.locations)
  const pack = useProtoStore((s) => s.packs[unit.id])
  const depositPack  = useProtoStore((s) => s.depositPack)
  const simulateHunt = useProtoStore((s) => s.simulateHunt)
  const count = packCount(pack)
  const pct = Math.min(100, (count / CARRY_CAPACITY) * 100)
  const full = packFull(pack)
  const entries = pack ? Object.entries(pack).filter(([, q]) => q > 0) : []

  return (
    <div className="rounded-lg border border-game-border bg-game-bg/60 p-2.5 mb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Pack</span>
        <span className={`text-[11px] tabular-nums ${full ? 'text-red-400 font-semibold' : 'text-game-text-dim'}`}>{count}/{CARRY_CAPACITY}</span>
        {packValue(pack) > 0 && <span className="text-[10px] text-game-gold tabular-nums">· {packValue(pack).toLocaleString()}g</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => simulateHunt(unit.id, huntDrops(unit, locations))} disabled={full}
            title={full ? 'Pack full — deposit first' : 'Simulate a hunt (mock drops)'}
            className={['text-[10px] px-2 py-0.5 rounded border', full ? 'border-game-border text-game-muted cursor-not-allowed' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}>⚔ Hunt</button>
          <button onClick={() => depositPack(unit.id)} disabled={count <= 0}
            className={['text-[10px] px-2 py-0.5 rounded border', count > 0 ? 'border-game-primary/50 text-game-text hover:bg-game-primary/10' : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}>⇩ Deposit</button>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-game-border overflow-hidden mb-1.5">
        <div className={`h-full rounded-full ${full ? 'bg-red-500' : pct > 70 ? 'bg-game-gold' : 'bg-game-green'}`} style={{ width: `${pct}%` }} />
      </div>
      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {entries.map(([id, q]) => (
            <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-game-border/40 text-game-text-dim" title={dropName(id)}>{dropName(id)} <span className="text-game-text tabular-nums">×{q}</span></span>
          ))}
        </div>
      ) : <div className="text-[10px] text-game-muted italic">Empty — fills with loot in the field.</div>}
      {full && <div className="text-[10px] text-red-400 mt-1">Pack full — can't pick up more. Deposit in town.</div>}
    </div>
  )
}
