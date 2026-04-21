import { useState } from 'react'
import {
  useGameStore, type Unit, type EquipSlot, type Abilities,
  SLOT_LABELS, getUnitTraits, getDerivedStats,
  getAvailableSkills, getLearnedSkills, abilityPointCost, SKILL_REGISTRY,
} from '@/stores/useGameStore'
import { TraitRow } from '@/components/TraitBubble'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 bg-game-border rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function healthColor(hp: number) { return hp >= 75 ? 'text-game-green' : hp >= 40 ? 'text-game-gold' : 'text-red-400' }
function healthBar(hp: number)   { return hp >= 75 ? 'bg-game-green' : hp >= 40 ? 'bg-game-gold' : 'bg-red-400' }
function healthDot(hp: number)   { return hp >= 75 ? 'bg-game-green' : hp >= 40 ? 'bg-game-gold' : 'bg-red-400' }

// ── Detail tab bar ────────────────────────────────────────────────────────────

type DetailTab = 'stats' | 'skills' | 'gear'

function DetailTabBar({ active, onChange, unit }: { active: DetailTab; onChange: (t: DetailTab) => void; unit: Unit }) {
  const tabs: { id: DetailTab; label: string; alert?: boolean }[] = [
    { id: 'stats',  label: 'Stats',  alert: unit.abilityPoints > 0 },
    { id: 'skills', label: 'Skills', alert: unit.skillPoints > 0   },
    { id: 'gear',   label: 'Gear'   },
  ]
  return (
    <div className="flex border-b border-game-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={[
            'flex-1 py-2.5 text-sm font-medium transition-colors',
            active === t.id
              ? 'text-game-primary border-b-2 border-game-primary -mb-px'
              : 'text-game-text-dim hover:text-game-text',
          ].join(' ')}
        >
          {t.label}{t.alert && <span className="ml-1 text-game-gold text-xs">(!)</span>}
        </button>
      ))}
    </div>
  )
}

// ── Equipment slot button ─────────────────────────────────────────────────────

function EquipSlotBtn({ unit, slot }: { unit: Unit; slot: EquipSlot }) {
  const equipment    = useGameStore((s) => s.equipment)
  const openEquipFor = useGameStore((s) => s.openEquipFor)
  const item = equipment.find((e) => e.id === unit.equipment[slot])
  const mainHandItem = equipment.find((e) => e.id === unit.equipment.mainHand)
  const locked = slot === 'offHand' && mainHandItem?.category === 'weapon-2h'

  return (
    <button
      disabled={locked}
      onClick={() => !locked && openEquipFor(unit.id, slot)}
      className={[
        'flex flex-col gap-0.5 p-2.5 rounded-lg border text-left w-full transition-colors',
        locked ? 'border-game-border opacity-40 cursor-not-allowed'
               : 'border-game-border hover:border-game-primary/70 active:bg-game-primary/5 cursor-pointer',
      ].join(' ')}
    >
      <span className="text-xs text-game-text-dim">{SLOT_LABELS[slot]}</span>
      <span className={['text-sm leading-snug', item ? 'text-game-text font-medium' : 'text-game-muted italic'].join(' ')}>
        {locked ? '2H locked' : (item?.name ?? '—')}
      </span>
    </button>
  )
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

const ABILITY_DEFS: { key: keyof Abilities; label: string; color: string }[] = [
  { key: 'strength',     label: 'STR', color: 'text-game-gold'    },
  { key: 'agility',      label: 'AGI', color: 'text-game-green'   },
  { key: 'dexterity',    label: 'DEX', color: 'text-sky-400'      },
  { key: 'constitution', label: 'CON', color: 'text-violet-400'   },
  { key: 'intelligence', label: 'INT', color: 'text-game-accent'  },
]

function StatsTab({ unit }: { unit: Unit }) {
  const equipment        = useGameStore((s) => s.equipment)
  const spendAbilityPoint = useGameStore((s) => s.spendAbilityPoint)
  const traits           = getUnitTraits(unit)
  const derived          = getDerivedStats(unit, equipment)

  const derivedStats = [
    { label: 'ATK',   value: derived.attack,       color: 'text-game-gold'    },
    { label: 'DEF',   value: derived.defense,      color: 'text-sky-400'      },
    { label: 'M.ATK', value: derived.magicAttack,  color: 'text-game-accent'  },
    { label: 'M.DEF', value: derived.magicDefense, color: 'text-violet-400'   },
    { label: 'SPD',   value: derived.attackSpeed,  color: 'text-game-green'   },
    { label: 'ACC',   value: derived.accuracy,     color: 'text-orange-400'   },
    { label: 'DOD',   value: derived.dodge,        color: 'text-pink-400'     },
  ]

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Level', value: unit.level },
          { label: 'Age',   value: `${unit.age}y` },
          { label: 'Class', value: unit.class ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-game-bg rounded-lg px-3 py-2">
            <div className="text-xs text-game-text-dim mb-0.5">{label}</div>
            <div className="text-sm font-semibold text-game-text">{value}</div>
          </div>
        ))}
      </div>

      {/* Health + EXP */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-game-text-dim">Health</span>
            <span className={healthColor(unit.health)}>{unit.health}%</span>
          </div>
          <ProgressBar value={unit.health} max={100} colorClass={healthBar(unit.health)} />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-game-text-dim">EXP</span>
            <span className="text-game-text-dim">{unit.exp} / {unit.expToNext}</span>
          </div>
          <ProgressBar value={unit.exp} max={unit.expToNext} colorClass="bg-game-primary" />
        </div>
      </div>

      {/* Traits */}
      {traits.length > 0 && <TraitRow traits={traits} />}

      {/* Abilities */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-game-text-dim">Abilities</div>
          {unit.abilityPoints > 0 && (
            <span className="text-xs bg-game-primary/20 text-game-primary border border-game-primary/40 rounded-full px-2 py-0.5">
              {unit.abilityPoints} pts
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {ABILITY_DEFS.map(({ key, label, color }) => {
            const val     = unit.abilities[key]
            const cost    = abilityPointCost(val)
            const canSpend = unit.abilityPoints >= cost && val < 99
            return (
              <div key={key} className="flex items-center gap-2 bg-game-bg rounded-lg px-3 py-2">
                <span className={`text-xs font-bold w-7 ${color}`}>{label}</span>
                <span className="text-sm font-mono font-semibold text-game-text w-8">{val}</span>
                <div className="flex-1" />
                {canSpend && <span className="text-xs text-game-text-dim mr-1">{cost}pt</span>}
                <button
                  disabled={!canSpend}
                  onClick={() => spendAbilityPoint(unit.id, key)}
                  className={[
                    'w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-colors',
                    canSpend
                      ? 'bg-game-primary text-white hover:bg-game-primary/80 active:scale-95'
                      : 'bg-game-border text-game-muted cursor-not-allowed opacity-40',
                  ].join(' ')}
                >
                  +
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Derived stats */}
      <div>
        <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Combat</div>
        <div className="grid grid-cols-4 gap-2">
          {derivedStats.slice(0, 4).map(({ label, value, color }) => (
            <div key={label} className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className={`text-xl font-bold font-mono leading-none ${color}`}>{value}</div>
              <div className="text-xs text-game-text-dim mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {derivedStats.slice(4).map(({ label, value, color }) => (
            <div key={label} className="bg-game-bg rounded-lg py-2.5 text-center">
              <div className={`text-xl font-bold font-mono leading-none ${color}`}>{value}</div>
              <div className="text-xs text-game-text-dim mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Skills tab ────────────────────────────────────────────────────────────────

function SkillsTab({ unit }: { unit: Unit }) {
  const [view, setView] = useState<'available' | 'learned'>('available')
  const learnSkill = useGameStore((s) => s.learnSkill)
  const available  = getAvailableSkills(unit)
  const learned    = getLearnedSkills(unit)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['available', 'learned'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={[
                'text-xs px-2.5 py-1 rounded-full border transition-colors capitalize',
                view === t
                  ? 'border-game-primary bg-game-primary/20 text-game-primary'
                  : 'border-game-border text-game-text-dim hover:border-game-primary/40',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
        {unit.skillPoints > 0 && (
          <span className="text-xs bg-game-secondary/20 text-game-secondary border border-game-secondary/40 rounded-full px-2 py-0.5">
            {unit.skillPoints} pts
          </span>
        )}
      </div>

      {view === 'available' && (
        <div className="space-y-2">
          {available.map(({ skill, current, prereqsMet, maxed }) => {
            const canLearn = prereqsMet && !maxed && unit.skillPoints >= 1
            return (
              <div
                key={skill.id}
                className={['bg-game-bg rounded-lg px-3 py-2.5 flex items-start gap-2', !prereqsMet ? 'opacity-50' : ''].join(' ')}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-game-text">{skill.name}</span>
                    {current > 0 && <span className="text-xs text-game-text-dim">Lv.{current}/{skill.maxLevel}</span>}
                    {maxed && <span className="text-xs text-game-green">Max</span>}
                  </div>
                  {prereqsMet ? (
                    <div className="text-xs text-game-text-dim leading-snug">
                      {maxed ? skill.description(current) : skill.description(current + 1)}
                    </div>
                  ) : (
                    <div className="text-xs text-game-muted italic leading-snug">
                      Requires: {skill.requires.map((r) => `${SKILL_REGISTRY[r.skillId]?.name ?? r.skillId} Lv.${r.minLevel}`).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  disabled={!canLearn}
                  onClick={() => learnSkill(unit.id, skill.id)}
                  className={[
                    'shrink-0 w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-colors mt-0.5',
                    canLearn
                      ? 'bg-game-secondary text-white hover:bg-game-secondary/80 active:scale-95'
                      : 'bg-game-border text-game-muted cursor-not-allowed opacity-40',
                  ].join(' ')}
                >
                  +
                </button>
              </div>
            )
          })}
        </div>
      )}

      {view === 'learned' && (
        <div className="space-y-2">
          {learned.length === 0 && (
            <p className="text-xs text-game-muted italic px-1">No skills learned yet.</p>
          )}
          {learned.map(({ skill, current }) => (
            <div key={skill.id} className="bg-game-bg rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-game-text">{skill.name}</span>
                <span className="text-xs text-game-text-dim">Lv.{current}/{skill.maxLevel}</span>
              </div>
              <div className="text-xs text-game-text-dim leading-snug">{skill.description(current)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gear tab ──────────────────────────────────────────────────────────────────

function GearTab({ unit }: { unit: Unit }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <EquipSlotBtn unit={unit} slot="mainHand" />
        <EquipSlotBtn unit={unit} slot="offHand" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <EquipSlotBtn unit={unit} slot="armor" />
        <EquipSlotBtn unit={unit} slot="accessory" />
      </div>
      <EquipSlotBtn unit={unit} slot="tool" />
    </div>
  )
}

// ── Expanded unit detail ──────────────────────────────────────────────────────

function UnitDetail({ unit }: { unit: Unit }) {
  const [tab, setTab] = useState<DetailTab>('stats')

  return (
    <div className="border-t border-game-border">
      <DetailTabBar active={tab} onChange={setTab} unit={unit} />
      <div className="px-4 pb-5 pt-4">
        {tab === 'stats'  && <StatsTab  unit={unit} />}
        {tab === 'skills' && <SkillsTab unit={unit} />}
        {tab === 'gear'   && <GearTab   unit={unit} />}
      </div>
    </div>
  )
}

// ── Unit row ──────────────────────────────────────────────────────────────────

function UnitRow({ unit }: { unit: Unit }) {
  const { selectedUnitIds, expandedUnitIds, toggleSelectUnit, toggleUnit, locations } = useGameStore((s) => ({
    selectedUnitIds: s.selectedUnitIds,
    expandedUnitIds: s.expandedUnitIds,
    toggleSelectUnit: s.toggleSelectUnit,
    toggleUnit:      s.toggleUnit,
    locations:       s.locations,
  }))
  const isSelected = selectedUnitIds.includes(unit.id)
  const isExpanded = expandedUnitIds.includes(unit.id)
  const location   = locations.find((l) => l.id === unit.locationId)

  return (
    <div className={['border rounded-xl overflow-hidden transition-colors duration-100', isSelected ? 'border-game-primary' : 'border-game-border'].join(' ')}>
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          className={['w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors', isSelected ? 'border-game-primary bg-game-primary' : 'border-game-muted'].join(' ')}
          onClick={() => toggleSelectUnit(unit.id)}
          aria-label={`Select ${unit.name}`}
        >
          {isSelected && <span className="text-white text-xs leading-none">✓</span>}
        </button>

        <span className={`w-2 h-2 rounded-full shrink-0 ${healthDot(unit.health)}`} />

        <button className="flex-1 flex items-center gap-2 text-left min-w-0" onClick={() => toggleUnit(unit.id)}>
          <span className="font-semibold text-game-text">{unit.name}</span>
          <span className="text-xs text-game-text-dim shrink-0">Lv.{unit.level}</span>
          {unit.class && (
            <span className="text-xs text-game-secondary bg-game-secondary/10 px-1.5 py-0.5 rounded shrink-0">{unit.class}</span>
          )}
          {location && (
            <span className="text-xs text-game-accent bg-game-accent/10 px-1.5 py-0.5 rounded truncate max-w-[90px] shrink-0">{location.name}</span>
          )}
          {(unit.abilityPoints > 0 || unit.skillPoints > 0) && (
            <span className="text-xs text-game-gold bg-game-gold/10 px-1.5 py-0.5 rounded shrink-0">!</span>
          )}
          <span className="ml-auto text-game-muted text-sm shrink-0">{isExpanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {isExpanded && <UnitDetail unit={unit} />}
    </div>
  )
}

// ── Units page ────────────────────────────────────────────────────────────────

export function Units() {
  const { units, selectedUnitIds, clearSelection } = useGameStore((s) => ({
    units: s.units,
    selectedUnitIds: s.selectedUnitIds,
    clearSelection: s.clearSelection,
  }))

  return (
    <div className="p-4 space-y-2 pb-24">
      {selectedUnitIds.length > 0 && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs text-game-text-dim">{selectedUnitIds.length} selected</span>
          <button className="text-xs text-game-primary hover:underline" onClick={clearSelection}>Clear</button>
        </div>
      )}
      {units.map((unit) => <UnitRow key={unit.id} unit={unit} />)}
    </div>
  )
}
