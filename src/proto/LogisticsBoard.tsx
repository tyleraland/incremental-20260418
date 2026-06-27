import { useGameStore } from '@/stores/useGameStore'
import { useProtoStore } from './protoStore'
import { packCount, CARRY_CAPACITY } from './economy'
import { useExpeditionStore, freshHero } from './expeditionStore'
import { ALL_LOOT_CATEGORIES, supplyOption, supplyPool } from './expedition'

// §logistics — the cross-hero overview (Guild). A spreadsheet of every hero's plan
// side by side: the column headers say what each box means, the cells are just
// boxes you tick. Deep edits (loadout items, loot categories) live in the per-hero
// Logistics lens — tap the hero.

const Box = ({ on, title, onClick }: { on: boolean; title: string; onClick: () => void }) => (
  <button onClick={onClick} title={title}
    className={`w-5 h-5 rounded border transition-colors ${on ? 'border-game-primary bg-game-primary/70' : 'border-game-border hover:border-game-primary/50'}`} />
)

const colHead = 'text-[9px] uppercase tracking-wider text-game-text-dim font-medium px-2 py-1 whitespace-nowrap'
const sub = 'text-[9px] text-game-text-dim font-normal px-2 py-1 text-center whitespace-nowrap'

export function LogisticsBoard({ onHero }: { onHero: (id: string) => void }) {
  const units = useGameStore((s) => s.units)
  const locations = useGameStore((s) => s.locations)
  const packs = useProtoStore((s) => s.packs)
  const heroes = useExpeditionStore((s) => s.heroes)
  const toggleReturnOn = useExpeditionStore((s) => s.toggleReturnOn)
  const toggleShareFlag = useExpeditionStore((s) => s.toggleShareFlag)

  const locName = (id: string | null) => (id ? locations.find((l) => l.id === id)?.name ?? '—' : '—')

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-widest text-game-text-dim">Logistics</div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-game-border/50">
              <th rowSpan={2} className={`${colHead} text-left`}>Hero</th>
              <th rowSpan={2} className={`${colHead} text-left`}>Loadout</th>
              <th rowSpan={2} className={colHead}>Keep</th>
              <th colSpan={2} className={`${colHead} text-center border-l border-game-border/40`}>Return on</th>
              <th colSpan={2} className={`${colHead} text-center border-l border-game-border/40`}>Share loot</th>
              <th colSpan={2} className={`${colHead} text-center border-l border-game-border/40`}>Share supplies</th>
              <th rowSpan={2} className={`${colHead} text-right border-l border-game-border/40`}>Carried</th>
            </tr>
            <tr className="border-b border-game-border">
              <th className={`${sub} border-l border-game-border/40`}>full</th>
              <th className={sub}>dry</th>
              <th className={`${sub} border-l border-game-border/40`}>take</th>
              <th className={sub}>give</th>
              <th className={`${sub} border-l border-game-border/40`}>take</th>
              <th className={sub}>give</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const he = heroes[u.id] ?? freshHero()
              const supplies = supplyPool(he.loadout)
              const carried = packCount(packs[u.id])
              const keepAll = he.lootCats.length === ALL_LOOT_CATEGORIES.length
              const loadoutChips = Object.entries(he.loadout)
              return (
                <tr key={u.id} className="border-b border-game-border/40">
                  <td className="px-2 py-1.5">
                    <button onClick={() => onHero(u.id)} className="text-left hover:text-game-primary">
                      <div className="text-[11px] text-game-text leading-tight">{u.name.split(' ')[0]}</div>
                      <div className="text-[9px] text-game-muted leading-tight">{locName(u.locationId)}</div>
                    </button>
                  </td>
                  {/* loadout supply items */}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {loadoutChips.length === 0
                      ? <span className="text-[10px] text-game-muted">none</span>
                      : <span className="text-[10px] text-game-text-dim">{loadoutChips.map(([id, e]) => `${supplyOption(id)?.icon ?? '•'}${e.qty}`).join(' ')}</span>}
                  </td>
                  {/* loot categories kept */}
                  <td className="px-2 py-1.5 text-center text-[10px] tabular-nums text-game-text-dim">{keepAll ? 'all' : `${he.lootCats.length}/${ALL_LOOT_CATEGORIES.length}`}</td>
                  {/* return on: pack full / supplies dry */}
                  <td className="px-2 py-1.5 text-center border-l border-game-border/40"><Box on={he.returnOn.includes('pack-full')} title="Return when pack full" onClick={() => toggleReturnOn(u.id, 'pack-full')} /></td>
                  <td className="px-2 py-1.5 text-center"><Box on={he.returnOn.includes('supplies-out')} title="Return when supplies out" onClick={() => toggleReturnOn(u.id, 'supplies-out')} /></td>
                  {/* share loot: take / give */}
                  <td className="px-2 py-1.5 text-center border-l border-game-border/40"><Box on={he.acceptLoot} title="Accept loot from party" onClick={() => toggleShareFlag(u.id, 'acceptLoot')} /></td>
                  <td className="px-2 py-1.5 text-center"><Box on={he.shareLoot} title="Share loot with party" onClick={() => toggleShareFlag(u.id, 'shareLoot')} /></td>
                  {/* share supplies: take / give */}
                  <td className="px-2 py-1.5 text-center border-l border-game-border/40"><Box on={he.acceptSupplies} title="Accept supplies from party" onClick={() => toggleShareFlag(u.id, 'acceptSupplies')} /></td>
                  <td className="px-2 py-1.5 text-center"><Box on={he.shareSupplies} title="Share supplies with party" onClick={() => toggleShareFlag(u.id, 'shareSupplies')} /></td>
                  {/* carried loot x / y */}
                  <td className="px-2 py-1.5 text-right text-[10px] font-mono tabular-nums whitespace-nowrap">
                    <span className={carried >= CARRY_CAPACITY ? 'text-red-400' : 'text-game-text-dim'}>{carried} / {CARRY_CAPACITY}</span>
                    {he.status === 'returning' && <span className="text-game-gold"> ⌂</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-game-muted">Loadout = supplies carried (icon×qty). Keep = loot categories kept. Tap a hero to edit those in detail.</p>
    </div>
  )
}
