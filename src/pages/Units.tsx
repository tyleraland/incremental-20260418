import { useState } from 'react'
import {
  useGameStore, type Unit, type EquipSlot, type Abilities, type ActionSlotEntry,
  type TacticDef, type TacticChannel,
  SLOT_LABELS, getUnitTraits, getDerivedStats,
  getAvailableSkills, getLearnedSkills, abilityPointCost, SKILL_REGISTRY,
  ACTION_SLOT_COUNT, TACTIC_REGISTRY, listTactics, MAX_UNIT_TACTICS, MAX_PARTY_TACTICS,
  SKILL_TACTICS, inheritedTacticIds,
} from '@/stores/useGameStore'
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
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

type DetailTab = 'stats' | 'skills' | 'gear' | 'tactics'

function DetailTabBar({ active, onChange, unit }: { active: DetailTab; onChange: (t: DetailTab) => void; unit: Unit }) {
  const tabs: { id: DetailTab; label: string; alert?: boolean }[] = [
    { id: 'stats',   label: 'Stats',   alert: unit.abilityPoints > 0 },
    { id: 'skills',  label: 'Skills',  alert: unit.skillPoints > 0   },
    { id: 'gear',    label: 'Gear'   },
    { id: 'tactics', label: 'Tactics' },
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
  const item = equipment.find((e) => e.id === (slot === 'mainHand' || slot === 'offHand' ? unit.weaponSets[unit.activeWeaponSet][slot] : unit.equipment[slot]))
  const mainHandId = unit.weaponSets[unit.activeWeaponSet].mainHand
  const locked = slot === 'offHand' && equipment.find((e) => e.id === mainHandId)?.category === 'weapon-2h'

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

  const defStat = derived.defense - derived.defenseEquip
  const derivedStats = [
    { label: 'ATK',   value: derived.attack,       color: 'text-game-gold',   sub: null as string | null },
    { label: 'DEF',   value: derived.defense,      color: 'text-sky-400',     sub: derived.defenseEquip > 0 ? `${defStat}+${derived.defenseEquip}` : null },
    { label: 'M.ATK', value: derived.magicAttack,  color: 'text-game-accent', sub: null },
    { label: 'M.DEF', value: derived.magicDefense, color: 'text-violet-400',  sub: null },
    { label: 'SPD',   value: derived.attackSpeed,  color: 'text-game-green',  sub: null },
    { label: 'ACC',   value: derived.accuracy,     color: 'text-orange-400',  sub: null },
    { label: 'DOD',   value: derived.dodge,        color: 'text-pink-400',    sub: null },
  ]

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Level', value: unit.level },
          { label: 'Age',   value: `${unit.age}y` },
          { label: 'Class', value: unit.class ?? 'Novice' },
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
            <span className={healthColor(Math.round((unit.health / derived.maxHp) * 100))}>{unit.health} / {derived.maxHp}</span>
          </div>
          <ProgressBar value={unit.health} max={derived.maxHp} colorClass={healthBar(Math.round((unit.health / derived.maxHp) * 100))} />
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

      {/* Abilities + Derived stats side by side */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-game-text-dim">Abilities</div>
          {unit.abilityPoints > 0 && (
            <span className="text-xs bg-game-primary/20 text-game-primary border border-game-primary/40 rounded-full px-2 py-0.5">
              {unit.abilityPoints} pts
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {/* Ability rows */}
          <div className="flex-1 space-y-1.5">
            {ABILITY_DEFS.map(({ key, label, color }) => {
              const val      = unit.abilities[key]
              const cost     = abilityPointCost(val)
              const canSpend = unit.abilityPoints >= cost && val < 99
              return (
                <div key={key} className="flex items-center gap-1.5 bg-game-bg rounded-lg px-2.5 py-2">
                  <span className={`text-xs font-bold w-7 shrink-0 ${color}`}>{label}</span>
                  <span className="text-sm font-mono font-semibold text-game-text w-7">{val}</span>
                  <div className="flex-1" />
                  {canSpend && <span className="text-[10px] text-game-text-dim">{cost}p</span>}
                  <button
                    disabled={!canSpend}
                    onClick={() => spendAbilityPoint(unit.id, key)}
                    className={[
                      'w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors shrink-0',
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

          {/* Derived stats — 2-col compact grid */}
          <div className="w-[104px] grid grid-cols-2 gap-1 content-start">
            {derivedStats.map(({ label, value, color, sub }) => (
              <div key={label} className="bg-game-bg rounded-lg py-2 text-center">
                <div className={`text-sm font-bold font-mono leading-none ${color}`}>{value}</div>
                {sub && <div className="text-[9px] text-game-muted leading-none mt-0.5">{sub}</div>}
                <div className="text-[10px] text-game-text-dim mt-0.5">{label}</div>
              </div>
            ))}
          </div>
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
                    {skill.type === 'active' && current >= 1 && (
                      <SkillDragHandle unitId={unit.id} skillId={skill.id} />
                    )}
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
                {skill.type === 'active' && (
                  <SkillDragHandle unitId={unit.id} skillId={skill.id} />
                )}
                <span className="text-sm font-medium text-game-text">{skill.name}</span>
                <span className="text-xs text-game-text-dim">Lv.{current}/{skill.maxLevel}</span>
                {skill.type === 'active' && <span className="text-[10px] text-game-text-dim border border-game-border rounded px-1 py-0.5">Active</span>}
              </div>
              <div className="text-xs text-game-text-dim leading-snug">{skill.description(current)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tactics tab ───────────────────────────────────────────────────────────────

const CHANNEL_META: Record<TacticChannel, { label: string; cls: string }> = {
  movement:  { label: 'Move',    cls: 'text-game-green border-game-green/40 bg-game-green/10' },
  targeting: { label: 'Target',  cls: 'text-sky-400 border-sky-400/40 bg-sky-400/10' },
  action:    { label: 'Action',  cls: 'text-game-gold border-game-gold/40 bg-game-gold/10' },
  reaction:  { label: 'React',   cls: 'text-pink-400 border-pink-400/40 bg-pink-400/10' },
  passive:   { label: 'Passive', cls: 'text-violet-400 border-violet-400/40 bg-violet-400/10' },
}

// Channels are evaluated independently, so priority only competes per channel.
// The Equipped list groups by this fixed order; arrows reorder within a group.
const CHANNEL_ORDER: TacticChannel[] = ['targeting', 'movement', 'action', 'reaction', 'passive']

function ChannelBadge({ channel }: { channel: TacticChannel }) {
  const m = CHANNEL_META[channel]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${m.cls}`}>{m.label}</span>
}

function TacticsTab({ unit }: { unit: Unit }) {
  const { equipTactic, unequipTactic, moveTactic, toggleInheritedTactic } = useGameStore((s) => ({
    equipTactic: s.equipTactic, unequipTactic: s.unequipTactic, moveTactic: s.moveTactic,
    toggleInheritedTactic: s.toggleInheritedTactic,
  }))
  const equipped  = unit.tactics ?? []
  const equippedIds = new Set(equipped.map((t) => t.id))

  // Tactics this unit inherits from its equipped skills (free — they don't count
  // against the manual cap). Track which skill granted each, and which the player
  // has decoupled, so we can show + toggle them in their own colour.
  const equippedSkillIds = (unit.actionSlots ?? []).filter((s): s is ActionSlotEntry => s?.kind === 'skill').map((s) => s.id)
  const suppressed = new Set(unit.suppressedTactics ?? [])
  const grantedBy: Record<string, string[]> = {}
  for (const sid of equippedSkillIds) for (const tid of SKILL_TACTICS[sid] ?? []) (grantedBy[tid] ??= []).push(SKILL_REGISTRY[sid]?.name ?? sid)
  const inherited = inheritedTacticIds(equippedSkillIds).filter((id) => !equippedIds.has(id))

  const available = listTactics('unit').filter((d) => !equippedIds.has(d.id) && !(d.id in grantedBy))
  const atMax = equipped.length >= MAX_UNIT_TACTICS

  return (
    <div className="space-y-4">
      {/* Equipped — grouped by channel; priority competes only within a channel */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-game-text-dim">Equipped</div>
          <span className="text-[10px] text-game-text-dim">{equipped.length}/{MAX_UNIT_TACTICS} · by channel</span>
        </div>
        {equipped.length === 0 ? (
          <p className="text-xs text-game-muted italic px-1">No tactics equipped — this unit uses only the party tactics in combat.</p>
        ) : (
          <div className="space-y-3">
            {CHANNEL_ORDER.filter((ch) => equipped.some((t) => TACTIC_REGISTRY[t.id]?.channel === ch)).map((ch) => {
              const group = equipped.filter((t) => TACTIC_REGISTRY[t.id]?.channel === ch)
              // A floor placed above a trigger in the same channel can't actually
              // run first (the engine demotes floors) — flag it so the order shown
              // is honest about who acts first.
              const firstFloor = group.findIndex((t) => TACTIC_REGISTRY[t.id]?.kind === 'floor')
              const floorAboveTrigger = firstFloor >= 0 && group.slice(firstFloor + 1).some((t) => TACTIC_REGISTRY[t.id]?.kind !== 'floor')
              return (
                <div key={ch}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <ChannelBadge channel={ch} />
                    {group.length > 1 && <span className="text-[10px] text-game-text-dim">priority order</span>}
                  </div>
                  <div className="space-y-1.5">
                    {group.map((slot, gi) => {
                      const def = TACTIC_REGISTRY[slot.id]
                      if (!def) return null
                      const isFloor = def.kind === 'floor'
                      return (
                        <div key={slot.id} className="bg-game-bg rounded-lg px-2.5 py-2 flex items-start gap-2">
                          <span className="text-xs font-mono text-game-muted w-4 text-center shrink-0 mt-0.5">{gi + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className="text-sm font-medium text-game-text truncate">{def.name}</span>
                              {isFloor && (
                                <span
                                  className="text-[9px] px-1 py-0.5 rounded border border-game-border text-game-muted shrink-0"
                                  title="Always fires when a target/ally is in range — evaluated after this channel's conditional triggers."
                                >always-on</span>
                              )}
                            </div>
                            <div className="text-xs text-game-text-dim leading-snug">{def.description}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              disabled={gi === 0}
                              onClick={() => moveTactic(unit.id, slot.id, -1)}
                              className="w-6 h-6 rounded flex items-center justify-center text-xs bg-game-border/60 text-game-text hover:bg-game-border disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Move up"
                            >▲</button>
                            <button
                              disabled={gi === group.length - 1}
                              onClick={() => moveTactic(unit.id, slot.id, 1)}
                              className="w-6 h-6 rounded flex items-center justify-center text-xs bg-game-border/60 text-game-text hover:bg-game-border disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Move down"
                            >▼</button>
                            <button
                              onClick={() => unequipTactic(unit.id, slot.id)}
                              className="w-6 h-6 rounded flex items-center justify-center text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25"
                              aria-label="Remove"
                            >✕</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {floorAboveTrigger && (
                    <p className="mt-1 text-[10px] text-amber-300/90 leading-snug">
                      ⚠ Always-on tactics run after this channel's conditional triggers — the trigger(s) below still act first.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Inherited from skills — auto-granted, decouple-able (debug/tuning) */}
      {inherited.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-widest text-game-text-dim">Inherited from skills</div>
            <span className="text-[10px] text-game-text-dim">free · auto</span>
          </div>
          <div className="space-y-1.5">
            {inherited.map((id) => {
              const def = TACTIC_REGISTRY[id]
              if (!def) return null
              const off = suppressed.has(id)
              const sources = (grantedBy[id] ?? []).join(', ')
              return (
                <div key={id} className={['rounded-lg px-2.5 py-2 flex items-start gap-2 border border-dashed', off ? 'border-game-border bg-game-bg/40 opacity-60' : 'border-amber-400/40 bg-amber-400/5'].join(' ')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <ChannelBadge channel={def.channel} />
                      <span className={['text-sm font-medium truncate', off ? 'text-game-muted line-through' : 'text-game-text'].join(' ')}>{def.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300/90 shrink-0">from {sources}</span>
                    </div>
                    <div className="text-xs text-game-text-dim leading-snug">{def.description}</div>
                  </div>
                  <button
                    onClick={() => toggleInheritedTactic(unit.id, id)}
                    title={off ? `Re-couple ${def.name}` : `Decouple ${def.name} (debug)`}
                    aria-label={off ? 'Re-enable inherited tactic' : 'Decouple inherited tactic'}
                    className={['shrink-0 w-6 h-6 rounded flex items-center justify-center text-sm mt-0.5', off ? 'bg-game-green/15 text-game-green hover:bg-game-green/25' : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'].join(' ')}
                  >{off ? '+' : '−'}</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Available catalog */}
      {available.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-game-text-dim mb-2">Available</div>
          <div className="space-y-1.5">
            {available.map((def) => (
              <div key={def.id} className={['bg-game-bg rounded-lg px-2.5 py-2 flex items-start gap-2', atMax ? 'opacity-50' : ''].join(' ')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ChannelBadge channel={def.channel} />
                    <span className="text-sm font-medium text-game-text truncate">{def.name}</span>
                  </div>
                  <div className="text-xs text-game-text-dim leading-snug">{def.description}</div>
                </div>
                <button
                  disabled={atMax}
                  onClick={() => equipTactic(unit.id, def.id)}
                  title={atMax ? `Max ${MAX_UNIT_TACTICS} tactics` : `Equip ${def.name}`}
                  className={[
                    'shrink-0 px-2 h-7 rounded text-xs font-medium transition-colors mt-0.5',
                    atMax ? 'bg-game-border text-game-muted cursor-not-allowed' : 'bg-game-primary text-white hover:bg-game-primary/80 active:scale-95',
                  ].join(' ')}
                >+ Equip</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Party tactics panel (top of Units page; applies to every deployed unit) ────-

function PartyTacticsPanel() {
  const { partyTactics, equipPartyTactic, unequipPartyTactic } = useGameStore((s) => ({
    partyTactics: s.partyTactics, equipPartyTactic: s.equipPartyTactic, unequipPartyTactic: s.unequipPartyTactic,
  }))
  const [open, setOpen] = useState(false)
  const equipped = partyTactics ?? []
  const equippedIds = new Set(equipped.map((t) => t.id))
  const available = listTactics('party').filter((d) => !equippedIds.has(d.id))
  const atMax = equipped.length >= MAX_PARTY_TACTICS

  return (
    <div className="border border-game-border rounded-xl overflow-hidden">
      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="text-sm font-semibold text-game-text">Party Tactics</span>
        <span className="text-[10px] text-game-text-dim">{equipped.length}/{MAX_PARTY_TACTICS} · all deployed units</span>
        <div className="flex-1 flex flex-wrap gap-1 justify-end">
          {equipped.map((t) => {
            const def = TACTIC_REGISTRY[t.id]
            return def ? <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-game-secondary/15 text-game-secondary">{def.name}</span> : null
          })}
        </div>
        <span className="text-game-muted text-sm shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-game-border px-3 py-2.5 space-y-1.5">
          {equipped.map((t) => {
            const def = TACTIC_REGISTRY[t.id]
            if (!def) return null
            return (
              <div key={t.id} className="bg-game-bg rounded-lg px-2.5 py-2 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <ChannelBadge channel={def.channel} />
                    <span className="text-sm font-medium text-game-text truncate">{def.name}</span>
                  </div>
                  <div className="text-xs text-game-text-dim leading-snug">{def.description}</div>
                </div>
                <button
                  onClick={() => unequipPartyTactic(t.id)}
                  className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25 mt-0.5"
                  aria-label="Remove"
                >✕</button>
              </div>
            )
          })}
          {available.map((def) => (
            <div key={def.id} className={['bg-game-bg rounded-lg px-2.5 py-2 flex items-start gap-2', atMax ? 'opacity-50' : ''].join(' ')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ChannelBadge channel={def.channel} />
                  <span className="text-sm font-medium text-game-text truncate">{def.name}</span>
                </div>
                <div className="text-xs text-game-text-dim leading-snug">{def.description}</div>
              </div>
              <button
                disabled={atMax}
                onClick={() => equipPartyTactic(def.id)}
                title={atMax ? `Max ${MAX_PARTY_TACTICS} party tactics` : `Equip ${def.name}`}
                className={[
                  'shrink-0 px-2 h-7 rounded text-xs font-medium transition-colors mt-0.5',
                  atMax ? 'bg-game-border text-game-muted cursor-not-allowed' : 'bg-game-primary text-white hover:bg-game-primary/80 active:scale-95',
                ].join(' ')}
              >+ Equip</button>
            </div>
          ))}
          {equipped.length === 0 && available.length === 0 && (
            <p className="text-xs text-game-muted italic">No party tactics available.</p>
          )}
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
      <div className="grid grid-cols-2 gap-2">
        <EquipSlotBtn unit={unit} slot="sideboard1" />
        <EquipSlotBtn unit={unit} slot="sideboard2" />
      </div>
    </div>
  )
}

// ── Action slot bar ───────────────────────────────────────────────────────────

// One droppable square. Renders the slot's current content (skill or item)
// or a placeholder. Tap to clear.
function ActionSlotSquare({ unitId, index, entry }: {
  unitId: string; index: number; entry: ActionSlotEntry | null
}) {
  const setActionSlot = useGameStore((s) => s.setActionSlot)
  const equipment     = useGameStore((s) => s.equipment)
  const drop          = useDroppable({ id: `slot:${unitId}:${index}` })

  let label = ''
  let title = `Slot ${index + 1}`
  if (entry?.kind === 'skill') {
    const sk = SKILL_REGISTRY[entry.id]
    label = sk?.name ?? entry.id
    title = sk?.name ?? entry.id
  } else if (entry?.kind === 'item') {
    const it = equipment.find((e) => e.id === entry.id)
    label = it?.name ?? entry.id
    title = it?.name ?? entry.id
  }

  return (
    <button
      ref={drop.setNodeRef}
      onClick={() => entry && setActionSlot(unitId, index, null)}
      title={entry ? `${title} (tap to clear)` : title}
      className={[
        'aspect-square rounded-md border font-medium transition-colors flex items-center justify-center text-center px-0.5 leading-tight overflow-hidden break-words hyphens-auto',
        entry ? 'text-[9px]' : 'text-[10px]',
        drop.isOver
          ? 'border-game-primary bg-game-primary/15 text-white'
          : entry
            ? 'border-game-border bg-game-surface text-game-text hover:border-game-primary/50'
            : 'border-dashed border-game-border/60 bg-transparent text-game-text-dim',
      ].join(' ')}
    >
      {entry ? label : index + 1}
    </button>
  )
}

function ActionSlotBar({ unit }: { unit: Unit }) {
  // Defensive: an older unit object may have been instantiated before
  // actionSlots existed on the schema. Treat missing as empty so the page
  // doesn't crash on switch into the Units tab.
  const slots = unit.actionSlots ?? []
  return (
    <div className="px-4 py-2 border-t border-game-border bg-game-bg/40">
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Action slots</div>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: ACTION_SLOT_COUNT }).map((_, i) => (
          <ActionSlotSquare key={i} unitId={unit.id} index={i} entry={slots[i] ?? null} />
        ))}
      </div>
    </div>
  )
}

// Small (slot-sized) square next to an active-skill row that can be dragged
// onto any action-slot droppable above.
function SkillDragHandle({ unitId, skillId }: { unitId: string; skillId: string }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `skill:${unitId}:${skillId}`,
    data: { kind: 'skill' as const, id: skillId },
  })
  const setActionSlot = useGameStore((s) => s.setActionSlot)
  const slots = useGameStore((s) => s.units.find((u) => u.id === unitId)?.actionSlots) ?? []
  const sk = SKILL_REGISTRY[skillId]
  const label = sk?.name ?? skillId
  const equipped = slots.some((e) => e?.kind === 'skill' && e.id === skillId)
  const firstEmpty = slots.findIndex((e) => e == null)
  // Tap → drop into the first empty action slot (no-op if already on the bar or
  // the bar is full). Drag still works for placing in a specific slot.
  const onClick = () => {
    if (equipped || firstEmpty < 0) return
    setActionSlot(unitId, firstEmpty, { kind: 'skill', id: skillId })
  }
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{ touchAction: 'none' as const, opacity: isDragging ? 0.4 : equipped ? 0.5 : 1 }}
      title={equipped ? `${label} (on the bar)` : firstEmpty < 0 ? `${label} (bar full)` : `Tap to add ${label} to the bar (or drag to a slot)`}
      className="inline-flex w-10 h-10 rounded-md border border-game-border bg-game-surface text-[9px] font-medium text-game-text items-center justify-center text-center px-0.5 leading-tight overflow-hidden break-words cursor-pointer active:cursor-grabbing select-none hover:border-game-primary/60"
    >{label}</span>
  )
}

// ── Expanded unit detail ──────────────────────────────────────────────────────

function UnitDetail({ unit }: { unit: Unit }) {
  const [tab, setTab] = useState<DetailTab>('stats')
  const setActionSlot = useGameStore((s) => s.setActionSlot)
  // Distance-based activation: the drag fires as soon as the pointer has
  // moved 5px. A delay-based constraint cancels the drag when the user moves
  // during the timer window, which is exactly the natural "tap-and-drag"
  // motion we want to support here.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || !e.active) return
    const overId = String(e.over.id)
    if (!overId.startsWith(`slot:${unit.id}:`)) return
    const slotIdx = Number(overId.split(':')[2])
    const data = e.active.data.current as { kind: 'item' | 'skill'; id: string } | undefined
    if (!data) return
    setActionSlot(unit.id, slotIdx, { kind: data.kind, id: data.id })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="border-t border-game-border">
        <ActionSlotBar unit={unit} />
        <DetailTabBar active={tab} onChange={setTab} unit={unit} />
        <div className="px-4 pb-5 pt-4">
          {tab === 'stats'   && <StatsTab   unit={unit} />}
          {tab === 'skills'  && <SkillsTab  unit={unit} />}
          {tab === 'gear'    && <GearTab    unit={unit} />}
          {tab === 'tactics' && <TacticsTab unit={unit} />}
        </div>
      </div>
    </DndContext>
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
          <span className="text-xs text-game-secondary bg-game-secondary/10 px-1.5 py-0.5 rounded shrink-0">{unit.class ?? 'Novice'}</span>
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
      <PartyTacticsPanel />
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
