import { createPortal } from 'react-dom'
import { useGameStore, getDerivedStats, getInitials, type Unit, type DerivedStats } from '@/stores/useGameStore'
import { getUnitTraits } from '@/data/traits'
import { useProtoStore } from './protoStore'

// ── Hero Detail (roomy overlay) ───────────────────────────────────────────────--
// The detailed stats/abilities surface, lifted out of the compact Unit card into
// a full-screen menu. Opened from the Unit tab and from the Guild board.

const CLASS_ICON: Record<string, string> = { Fighter: '⚔', Ranger: '🏹', Mage: '✦', Cleric: '✚', Rogue: '🗡' }

function Body({ unit }: { unit: Unit }) {
  const equipment = useGameStore((s) => s.equipment)
  const spendAbilityPoint = useGameStore((s) => s.spendAbilityPoint)
  const openReport = useGameStore((s) => s.openReport)
  const ds = getDerivedStats(unit, equipment)
  const traits = getUnitTraits(unit)
  const abilities: [keyof Unit['abilities'], string][] = [
    ['strength', 'STR'], ['agility', 'AGI'], ['dexterity', 'DEX'], ['constitution', 'CON'], ['intelligence', 'INT'],
  ]
  const stats: [string, keyof DerivedStats][] = [
    ['ATK', 'attack'], ['DEF', 'defense'], ['M.ATK', 'magicAttack'], ['M.DEF', 'magicDefense'],
    ['SPD', 'attackSpeed'], ['ACC', 'accuracy'], ['DODGE', 'dodge'], ['RANGE', 'attackRange'], ['HP', 'maxHp'],
  ]
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-game-surface border border-game-primary/40 flex items-center justify-center text-3xl shrink-0">
          {unit.class && CLASS_ICON[unit.class] ? CLASS_ICON[unit.class] : getInitials(unit.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold text-game-text leading-tight truncate">{unit.name}</div>
          <div className="text-sm text-game-text-dim">{unit.class ?? 'Novice'} · Lv {unit.level} · {unit.age}y</div>
        </div>
        <button onClick={() => openReport(unit.id)} className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5">Report ▸</button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-widest text-game-text-dim">Abilities</span>
          {unit.abilityPoints > 0 && <span className="text-xs text-game-gold">{unit.abilityPoints} pts to spend</span>}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {abilities.map(([k, label]) => (
            <button
              key={k}
              disabled={unit.abilityPoints <= 0}
              onClick={() => spendAbilityPoint(unit.id, k)}
              className={['rounded-xl border py-3 flex flex-col items-center transition-colors',
                unit.abilityPoints > 0 ? 'border-game-gold/40 hover:bg-game-gold/10 cursor-pointer' : 'border-game-border cursor-default'].join(' ')}
            >
              <span className="text-[10px] text-game-text-dim">{label}</span>
              <span className="text-xl font-semibold text-game-text leading-none mt-1">{unit.abilities[k]}</span>
              {unit.abilityPoints > 0 && <span className="text-[10px] text-game-gold leading-none mt-1">＋</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Combat profile</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {stats.map(([label, k]) => (
            <div key={label} className="rounded-xl bg-game-bg border border-game-border py-3 flex flex-col items-center">
              <span className="text-[10px] text-game-text-dim">{label}</span>
              <span className="text-lg font-semibold text-game-text tabular-nums leading-none mt-1">{Math.round(ds[k] as number)}</span>
            </div>
          ))}
        </div>
      </div>

      {traits.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Traits</div>
          <div className="flex flex-wrap gap-1.5">
            {traits.map((t) => (
              <span key={t.id} className="text-[11px] px-2.5 py-1 rounded-full bg-game-border/40 text-game-text-dim border border-game-border/60" title={t.description}>{t.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function HeroDetail() {
  const heroDetailId = useProtoStore((s) => s.heroDetailId)
  const closeHeroDetail = useProtoStore((s) => s.closeHeroDetail)
  const unit = useGameStore((s) => s.units.find((u) => u.id === heroDetailId) ?? null)
  if (!heroDetailId) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-game-bg">
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-game-border bg-game-surface/70">
        <span className="text-sm font-semibold text-game-text">◈ Hero Detail</span>
        <button onClick={closeHeroDetail} className="ml-auto flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5 text-[11px]">✕ Close</button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 max-w-2xl w-full mx-auto" style={{ zoom: 1.1 }}>
          {unit ? <Body unit={unit} /> : <div className="text-sm text-game-muted italic">Hero not found.</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
