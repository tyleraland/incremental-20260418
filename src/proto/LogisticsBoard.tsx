import { useGameStore } from '@/stores/useGameStore'
import type { Unit } from '@/types'
import { useProtoStore } from './protoStore'
import { packCount, CARRY_CAPACITY } from './economy'
import { useExpeditionStore, freshHero } from './expeditionStore'
import { ALL_LOOT_CATEGORIES, isHuntable, supplyPool } from './expedition'

// §logistics — the cross-hero overview (Guild → Logistics). A spreadsheet of every
// hero's plan side by side, with the quick toggles inline; the deep edits (loadout,
// categories) live in the per-hero Logistics lens (tap the hero).

const Tg = ({ on, label, title, onClick }: { on: boolean; label: string; title: string; onClick: () => void }) => (
  <button onClick={onClick} title={title}
    className={`text-[9px] px-1 py-0.5 rounded border tabular-nums ${on ? 'border-game-primary/60 bg-game-primary/15 text-game-text' : 'border-game-border text-game-muted hover:text-game-text'}`}>
    {label}
  </button>
)

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left font-medium text-[9px] uppercase tracking-wider text-game-text-dim px-2 py-1 whitespace-nowrap">{children}</th>
)

export function LogisticsBoard({ onHero }: { onHero: (id: string) => void }) {
  const units = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const packs = useProtoStore((s) => s.packs)
  const heroes = useExpeditionStore((s) => s.heroes)
  const toggleReturnOn = useExpeditionStore((s) => s.toggleReturnOn)
  const toggleShareFlag = useExpeditionStore((s) => s.toggleShareFlag)

  const locName = (id: string | null) => (id ? locations.find((l) => l.id === id)?.name ?? '—' : '—')
  const deployedHuntable = (u: Unit) => {
    const loc = u.locationId ? locations.find((l) => l.id === u.locationId) : null
    return !!loc && isHuntable(loc)
  }

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-widest text-game-text-dim">Logistics</div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-game-border">
              <Th>Hero</Th>
              <Th>Supplies</Th>
              <Th>Keep</Th>
              <Th>Return</Th>
              <Th>Loot share</Th>
              <Th>Supply share</Th>
              <Th>Pack</Th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const he = heroes[u.id] ?? freshHero()
              const supplies = supplyPool(he.loadout)
              const cap = Math.round((packCount(packs[u.id]) / CARRY_CAPACITY) * 100)
              const status = he.status
              return (
                <tr key={u.id} className="border-b border-game-border/40 align-middle">
                  {/* hero — tap to open their logistics lens */}
                  <td className="px-2 py-1.5">
                    <button onClick={() => onHero(u.id)} className="text-left hover:text-game-primary">
                      <div className="text-[11px] text-game-text leading-tight">{u.name.split(' ')[0]}</div>
                      <div className="text-[9px] text-game-muted leading-tight">{locName(u.locationId)}</div>
                    </button>
                  </td>
                  {/* supplies loadout total */}
                  <td className="px-2 py-1.5 text-[10px] font-mono tabular-nums text-game-text-dim">{supplies || '—'}</td>
                  {/* loot categories kept */}
                  <td className="px-2 py-1.5 text-[10px] font-mono tabular-nums text-game-text-dim">{he.lootCats.length}/{ALL_LOOT_CATEGORIES.length}</td>
                  {/* return conditions */}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <Tg on={he.returnOn.includes('pack-full')} label="Pack" title="Return when pack full" onClick={() => toggleReturnOn(u.id, 'pack-full')} />
                      <Tg on={he.returnOn.includes('supplies-out')} label="Sup" title="Return when supplies out" onClick={() => toggleReturnOn(u.id, 'supplies-out')} />
                    </div>
                  </td>
                  {/* loot sharing */}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <Tg on={he.acceptLoot} label="Acc" title="Accept loot from party" onClick={() => toggleShareFlag(u.id, 'acceptLoot')} />
                      <Tg on={he.shareLoot} label="Shr" title="Share loot with party" onClick={() => toggleShareFlag(u.id, 'shareLoot')} />
                    </div>
                  </td>
                  {/* supply sharing */}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <Tg on={he.acceptSupplies} label="Acc" title="Accept supplies from party" onClick={() => toggleShareFlag(u.id, 'acceptSupplies')} />
                      <Tg on={he.shareSupplies} label="Shr" title="Share supplies with party" onClick={() => toggleShareFlag(u.id, 'shareSupplies')} />
                    </div>
                  </td>
                  {/* capacity */}
                  <td className="px-2 py-1.5 text-[10px] font-mono tabular-nums whitespace-nowrap">
                    {deployedHuntable(u)
                      ? <span className={cap >= 100 ? 'text-red-400' : 'text-game-text-dim'}>{cap}%{status === 'returning' ? ' ⌂' : ''}</span>
                      : <span className="text-game-muted">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-game-muted">Tap a hero to edit their loadout + loot categories in detail.</p>
    </div>
  )
}
