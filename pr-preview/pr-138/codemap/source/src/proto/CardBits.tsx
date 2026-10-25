import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/stores/useGameStore'
import { MONSTER_REGISTRY } from '@/data/monsters'
import {
  CARD_REGISTRY, CARD_RARITY_TEXT, CARD_RARITY_CLS, CARD_FIT_ICON, CARD_FIT_LABEL, CARD_FIT_OF,
  cardBonusLine, cardBonusTotal,
} from '@/data/cards'
import type { EquipmentItem } from '@/types'
import { useProtoStore } from './protoStore'

// ── Shared card / socket UI ──────────────────────────────────────────────────--
// Reused by the global Town board (Cards collection + Market) and the per-hero
// bottom board (Gear + Sockets). Sockets are mock proto state (display-only).

// A fixed-length slot array for an equipment instance (cardId | null), padded to
// the item's authored `slots` count.
export function socketsOf(
  map: Record<string, (string | null)[]>,
  item: { id: string; slots?: number },
): (string | null)[] {
  const n = item.slots ?? 0
  const arr = map[item.id] ?? []
  const out: (string | null)[] = []
  for (let i = 0; i < n; i++) out.push(arr[i] ?? null)
  return out
}
export const socketFilled = (slots: (string | null)[]): number => slots.filter(Boolean).length

// Glanceable socket pips: ◆ filled (rarity-coloured) / ◇ empty. Renders nothing
// for slotless gear, so heterogeneous slotting reads at a glance across a list.
export function SocketPips({ slots, showCount = false, className = '' }: { slots: (string | null)[]; showCount?: boolean; className?: string }) {
  if (slots.length === 0) return null
  const title = slots.map((c, i) => `Slot ${i + 1}: ${c ? CARD_REGISTRY[c]?.name ?? c : 'empty'}`).join('\n')
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} title={title}>
      {slots.map((cid, i) => {
        const card = cid ? CARD_REGISTRY[cid] : null
        return <span key={i} className={['text-[10px] leading-none', card ? CARD_RARITY_TEXT[card.rarity] : 'text-game-muted'].join(' ')}>{card ? '◆' : '◇'}</span>
      })}
      {showCount && <span className="text-[9px] text-game-muted ml-0.5 tabular-nums">{socketFilled(slots)}/{slots.length}</span>}
    </span>
  )
}

// A compact owned-card chip (glyph + name + ×count). Click to inspect.
export function CardChip({ cardId, count, onClick, dimmed = false }: { cardId: string; count?: number; onClick?: () => void; dimmed?: boolean }) {
  const card = CARD_REGISTRY[cardId]
  if (!card) return null
  return (
    <button
      onClick={onClick}
      title={`${card.name} — ${cardBonusLine(card.bonus) || 'no stats'}`}
      className={['flex items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors bg-game-bg',
        CARD_RARITY_CLS[card.rarity], onClick ? 'hover:bg-white/5' : '', dimmed ? 'opacity-40' : ''].join(' ')}
    >
      <span className="text-xs leading-none">◆</span>
      <span className="min-w-0 flex-1">
        <span className="text-xs text-game-text font-medium block truncate">{card.name}</span>
        <span className="text-[9px] text-game-text-dim block truncate">{cardBonusLine(card.bonus) || '—'}</span>
      </span>
      {count != null && <span className="text-[10px] text-game-text-dim tabular-nums shrink-0">×{count}</span>}
    </button>
  )
}

// Socket editor for one equipment item — pips/slot buttons + an inline,
// fit-filtered card picker. `modifiable` gates editing (gear away from a town is
// equipped/in-use and can't be changed); when locked the sockets still render so
// the configuration reads, but the slots don't open.
export function SocketEditor({ item, modifiable, lockReason }: { item: EquipmentItem; modifiable: boolean; lockReason?: string }) {
  const sockets    = useProtoStore((s) => s.sockets)
  const ownedCards = useProtoStore((s) => s.ownedCards)
  const insertCard = useProtoStore((s) => s.insertCard)
  const removeCard = useProtoStore((s) => s.removeCard)
  const [active, setActive] = useState<number | null>(null)
  const [inspect, setInspect] = useState<string | null>(null)

  const slots = socketsOf(sockets, item)
  const fit = CARD_FIT_OF[item.category]
  const line = cardBonusLine(cardBonusTotal(slots))
  const fitting = Object.keys(ownedCards).filter((id) => (ownedCards[id] ?? 0) > 0 && CARD_REGISTRY[id]?.fit === fit)

  return (
    <div className="space-y-2">
      {line && <div className="text-[10px] text-game-green font-mono">Cards: {line}</div>}
      <div className="flex flex-wrap gap-1.5">
        {slots.map((cid, idx) => {
          const card = cid ? CARD_REGISTRY[cid] : null
          const isActive = active === idx
          return (
            <button
              key={idx}
              disabled={!modifiable}
              onClick={() => setActive(isActive ? null : idx)}
              className={['flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors',
                !modifiable ? 'opacity-50 cursor-not-allowed border-game-border text-game-muted'
                  : isActive ? 'border-game-primary bg-game-primary/15 text-game-text'
                  : card ? `${CARD_RARITY_CLS[card.rarity]} bg-game-bg`
                  : 'border-dashed border-game-border/70 text-game-muted'].join(' ')}
            >
              <span>{card ? '◆' : '◇'}</span>
              <span className="truncate max-w-[7rem]">{card ? card.name : `empty slot ${idx + 1}`}</span>
            </button>
          )
        })}
      </div>
      {!modifiable && <div className="text-[10px] text-game-muted italic">{lockReason ?? 'In use — can only be modified in town.'}</div>}

      {modifiable && active != null && (() => {
        const cur = slots[active]
        return (
          <div className="rounded-md border border-game-border/70 bg-game-surface/40 p-2 space-y-1.5">
            {cur && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-game-text-dim flex-1">Slot {active + 1}: <span className="text-game-text">{CARD_REGISTRY[cur]?.name}</span></span>
                <button onClick={() => setInspect(cur)} className="text-[10px] px-1.5 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text">inspect</button>
                <button onClick={() => removeCard(item.id, active)} className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/50 text-red-300 hover:bg-red-500/10">remove</button>
              </div>
            )}
            <div className="text-[9px] uppercase tracking-widest text-game-text-dim">{cur ? 'Swap for' : 'Insert a card'} · {CARD_FIT_LABEL[fit]}</div>
            {fitting.length === 0 ? (
              <div className="text-[10px] text-game-muted italic">No fitting cards owned. {CARD_FIT_LABEL[fit]} cards go here.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {fitting.map((id) => (
                  <CardChip key={id} cardId={id} count={ownedCards[id]} onClick={() => { insertCard(item.id, active, id, item.slots ?? 1); setActive(null) }} />
                ))}
              </div>
            )}
          </div>
        )
      })()}
      {inspect && <CardCodex cardId={inspect} onClose={() => setInspect(null)} />}
    </div>
  )
}

// Full card detail (portal modal): stats, fit, source monster, flavour — the
// "card view useful to see their stats" surface.
export function CardCodex({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const owned = useProtoStore((s) => s.ownedCards[cardId] ?? 0)
  const card = CARD_REGISTRY[cardId]
  if (!card) return null
  const monster = MONSTER_REGISTRY[card.monsterId]
  const line = cardBonusLine(card.bonus)
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/70" onClick={onClose}>
      <div className="bg-game-surface border border-game-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className={['flex items-center gap-3 px-5 pt-5 pb-4 border-b border-game-border'].join(' ')}>
          <span className={['text-2xl leading-none', CARD_RARITY_TEXT[card.rarity]].join(' ')}>◆</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-game-text text-lg leading-tight">{card.name}</div>
            <div className="text-[10px] uppercase tracking-widest text-game-muted mt-0.5">{card.rarity} card · {CARD_FIT_ICON[card.fit]} {CARD_FIT_LABEL[card.fit]}</div>
          </div>
          <button className="text-game-muted text-2xl leading-none hover:text-game-text shrink-0" onClick={onClose}>×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-game-text-dim mb-1.5">When socketed</div>
            {line ? <div className="text-game-green font-mono text-sm">{line}</div> : <div className="text-game-muted text-sm italic">No stat bonus.</div>}
          </div>
          <p className="text-sm text-game-text-dim italic leading-snug">{card.description}</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-game-text-dim">Source: <span className="text-game-text">{monster?.name ?? card.monsterId}</span></span>
            <span className="text-game-text-dim">Owned: <span className="text-game-text tabular-nums">×{owned}</span></span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
