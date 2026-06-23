import { useState, type ReactNode } from 'react'
import { useGameStore, MONSTER_REGISTRY, type Location, type Unit } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'
import { ItemCodex } from '@/components/ItemCodex'
import { INITIAL_EQUIPMENT } from '@/data/equipment'
import type { EquipmentItem } from '@/types'
import {
  useProtoStore, LOCATION_QUESTS, questStatus, type QuestDef, type QuestStatus, type QuestReward,
  CLASS_CHANGE_QUESTS, classQuestStatus, objectiveProgress, objectiveConsumes, MIN_CLASS_CHANGE_LEVEL,
  LOCATION_BOUNTIES, bountyVisible, bountyProgress, rewardGoldTotal,
  type ClassChangeQuestDef, type ClassQuestStatus, type BountyDef,
} from './protoStore'
import { isRegionUnlocked } from '@/lib/unlocks'

const ELEMENT_DOT: Record<string, string> = {
  fire: 'bg-orange-400', lightning: 'bg-yellow-300', ice: 'bg-sky-300', earth: 'bg-amber-600',
  wind: 'bg-green-400', water: 'bg-blue-400', neutral: 'bg-game-text-dim',
}

// Equipment lookup by id, so quest item rewards can be resolved to a real def
// (name + stats) and inspected in an ItemCodex before you commit.
const EQUIP_BY_ID: Record<string, EquipmentItem> = Object.fromEntries(INITIAL_EQUIPMENT.map((e) => [e.id, e]))

// ── Location Detail ────────────────────────────────────────────────────────--
//
// The locale view's other half: what a single location IS and how you shape it.
// The heroes deployed here (+ a staged-deploy proposal), a WoW-style quest board
// (which replaces the old familiarity / story-path / upgrade surfaces), and the
// site's inhabitants. Mock quest economy (see protoStore) but it reads like the
// eventual location-management screen.

// Friendly names for the dungeon sub-regions a world location can open into.
const REGION_NAMES: Record<string, string> = { 'geffen-dungeon': 'Geffen Dungeon', aerie: 'Sky Aerie', 'fixed-encounters': 'Fixed Encounters' }

// ── Quest board ───────────────────────────────────────────────────────────────
// WoW-style status glyph + color. Yellow = actionable right now (accept / turn
// in); gray = waiting (locked, blocked behind your commitment, or mid-progress).
const QUEST_GLYPH: Record<QuestStatus, string> = {
  locked: '…', blocked: '!', available: '!', progress: '?', ready: '?', done: '✓',
}
const QUEST_ICON_CLS: Record<QuestStatus, string> = {
  locked:    'border-game-border text-game-muted',
  blocked:   'border-game-border text-game-muted',
  available: 'border-game-gold/60 text-game-gold',
  progress:  'border-game-border text-game-text-dim',
  ready:     'border-game-gold/70 text-game-gold',
  done:      'border-game-green/50 text-game-green',
}
const QUEST_HINT: Record<QuestStatus, string> = {
  locked: 'Not yet eligible', blocked: 'Committed elsewhere', available: 'Available — expand to accept',
  progress: 'In progress', ready: 'Ready to turn in', done: 'Completed',
}

// Template the mock quest copy with this site's signature foe / name / target.
function fill(s: string, foe: string, place: string, n: number): string {
  return s.replace(/\{foe\}/g, foe).replace(/\{place\}/g, place).replace(/\{n\}/g, String(n))
}

// Reward pills. Gold is plain; item rewards are tappable — they open an item
// codex so you can inspect the gear before accepting / after completing.
function RewardChips({ rewards }: { rewards: QuestReward[] }) {
  const [inspect, setInspect] = useState<EquipmentItem | null>(null)
  return (
    <>
      {rewards.map((r, i) => {
        if (r.kind === 'gold') {
          return <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-game-gold/40 bg-game-gold/10 text-game-gold">{r.amount} gold</span>
        }
        const it = EQUIP_BY_ID[r.itemId]
        return (
          <button
            key={i}
            onClick={() => it && setInspect(it)}
            disabled={!it}
            title={it ? `Inspect ${it.name}` : undefined}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-game-gold/50 bg-game-gold/15 text-game-gold hover:bg-game-gold/25 hover:border-game-gold transition-colors"
          >
            <span>{it?.name ?? r.itemId}</span>
            <span className="opacity-60">›</span>
          </button>
        )
      })}
      {inspect && <ItemCodex item={inspect} onClose={() => setInspect(null)} />}
    </>
  )
}

function QuestRow({ q, locId, foe, place }: { q: QuestDef; locId: string; foe: string; place: string }) {
  const activeId     = useProtoStore((s) => s.activeQuest[locId] ?? null)
  const progress     = useProtoStore((s) => s.questProgress[locId]?.[q.id] ?? 0)
  const doneIds      = useProtoStore((s) => s.completedQuests[locId] ?? [])
  const acceptQuest  = useProtoStore((s) => s.acceptQuest)
  const advanceQuest = useProtoStore((s) => s.advanceQuest)
  const turnInQuest  = useProtoStore((s) => s.turnInQuest)
  const [open, setOpen] = useState(false)

  const status = questStatus(q, { activeId, doneIds, progress })
  const canExpand = status !== 'locked'        // can't research a quest you can't see yet
  const title = fill(q.title, foe, place, q.target)
  const committed = status === 'progress' || status === 'ready'

  return (
    <div className={['rounded-md border transition-colors', open ? 'border-game-primary/40 bg-game-bg' : 'border-game-border bg-game-bg'].join(' ')}>
      <button
        onClick={() => canExpand && setOpen((v) => !v)}
        disabled={!canExpand}
        title={QUEST_HINT[status]}
        className={['w-full flex items-center gap-2 px-2 py-1.5 text-left', canExpand ? 'hover:bg-white/[0.03]' : 'cursor-default'].join(' ')}
      >
        <span className={['w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold leading-none shrink-0', QUEST_ICON_CLS[status]].join(' ')}>
          {QUEST_GLYPH[status]}
        </span>
        <span className={['text-xs flex-1 truncate', status === 'locked' ? 'text-game-muted' : 'text-game-text'].join(' ')}>{title}</span>
        {status === 'progress' && <span className="text-[10px] text-game-text-dim tabular-nums shrink-0">{progress}/{q.target}</span>}
        {status === 'ready' && <span className="text-[10px] text-game-gold shrink-0">ready</span>}
        {canExpand && <span className="text-[10px] text-game-muted shrink-0 w-3 text-center">{open ? '▴' : '▾'}</span>}
      </button>

      {open && canExpand && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-game-border/60">
          <p className="text-[11px] text-game-text-dim leading-snug">{fill(q.story, foe, place, q.target)}</p>
          <div className="text-[11px]"><span className="text-game-text-dim">Objective: </span><span className="text-game-text">{fill(q.objective, foe, place, q.target)}</span></div>

          {/* Rewards sit up here with the objective — kept clear of the action
              button below so you don't fat-finger Accept while tapping a reward. */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Rewards</span>
            <RewardChips rewards={q.rewards} />
          </div>

          {committed && (
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="uppercase tracking-wider text-game-text-dim">Progress</span>
                <span className="text-game-text tabular-nums">{progress}/{q.target}</span>
              </div>
              <div className="h-2 rounded-full bg-game-border overflow-hidden">
                <div className={['h-full rounded-full transition-all', status === 'ready' ? 'bg-game-gold' : 'bg-game-accent'].join(' ')} style={{ width: `${Math.min(100, (progress / q.target) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* action footer — separated from the rewards above by a divider + gap */}
          <div className="pt-2 mt-1 border-t border-game-border/60">
            {status === 'available' && (
              <button onClick={() => acceptQuest(locId, q.id)} className="w-full text-xs font-semibold px-3 py-1.5 rounded-md border border-game-gold/60 bg-game-gold/15 text-game-gold hover:bg-game-gold/25 transition-colors">
                Accept quest
              </button>
            )}
            {status === 'blocked' && (
              <div className="text-[10px] text-game-muted italic">Finish the quest you're committed to here before taking this on.</div>
            )}
            {status === 'progress' && (
              <button onClick={() => advanceQuest(locId, q.id, 1)} className="text-[10px] px-2 py-1 rounded border border-game-border text-game-text-dim hover:text-game-text">
                +1 progress (sim)
              </button>
            )}
            {status === 'ready' && (
              <button onClick={() => { turnInQuest(locId, q.id); setOpen(false) }} className="w-full text-xs font-semibold px-3 py-1.5 rounded-md border border-game-gold/70 bg-game-gold/20 text-game-gold hover:bg-game-gold/30 transition-colors">
                ✓ Collect rewards
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Class-change quest board (hero-relative) ─────────────────────────────────--
// Lives in the peaceful cities. Status keys off the currently *selected* hero —
// see classQuestStatus. Glyphs mirror the monster board's convention (yellow =
// actionable now, gray = waiting on you).
const CLASS_GLYPH: Record<ClassQuestStatus, string> = {
  'select-novice': '…', underleveled: '!', eligible: '!', 'in-progress': '?', ready: '?',
}
const CLASS_ICON_CLS: Record<ClassQuestStatus, string> = {
  'select-novice': 'border-game-border text-game-muted',
  underleveled:    'border-game-border text-game-muted',
  eligible:        'border-game-gold/60 text-game-gold',
  'in-progress':   'border-game-border text-game-text-dim',
  ready:           'border-game-gold/70 text-game-gold',
}
const CLASS_SUBTITLE: Record<ClassQuestStatus, string> = {
  'select-novice': 'select Novice', underleveled: 'requires level 2+', eligible: 'begin', 'in-progress': '', ready: 'ready',
}

const isNovice = (u: Unit) => u.class === null || u.class === 'Novice'

// A committed-hero chip (gold ring) shown in the quest details once a hero has
// begun the path — the hero this commitment belongs to.
function HeroChip({ u, gold }: { u: Unit; gold?: boolean }) {
  return (
    <span className={[
      'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border',
      gold ? 'border-game-gold/50 bg-game-gold/10 text-game-gold' : 'border-game-green/40 bg-game-green/10 text-game-text',
    ].join(' ')}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${gold ? 'bg-game-gold' : 'bg-game-green'}`} />
      <span className="truncate">{u.name.split(' ')[0]}</span>
      <span className="opacity-70">Lv {u.level}</span>
    </span>
  )
}

function ProgressBar({ progress, target, ready }: { progress: number; target: number; ready: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="uppercase tracking-wider text-game-text-dim">Progress</span>
        <span className="text-game-text tabular-nums">{progress}/{target}</span>
      </div>
      <div className="h-2 rounded-full bg-game-border overflow-hidden">
        <div className={['h-full rounded-full transition-all', ready ? 'bg-game-gold' : 'bg-game-accent'].join(' ')} style={{ width: `${Math.min(100, (progress / target) * 100)}%` }} />
      </div>
    </div>
  )
}

function ConfirmPanel({ message, cancelLabel, confirmLabel, onCancel, onConfirm, danger }: {
  message: ReactNode; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void; danger?: boolean
}) {
  return (
    <div className={['rounded-md border p-2 space-y-2', danger ? 'border-rose-700/50 bg-rose-950/20' : 'border-game-gold/50 bg-game-gold/10'].join(' ')}>
      <div className="text-[11px] text-game-text leading-snug">{message}</div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 text-[11px] px-2 py-1.5 rounded border border-game-border text-game-text-dim hover:text-game-text">{cancelLabel}</button>
        <button onClick={onConfirm} className={['flex-1 text-[11px] font-semibold px-2 py-1.5 rounded border', danger ? 'border-rose-600/70 bg-rose-600/20 text-rose-200 hover:bg-rose-600/30' : 'border-game-gold/70 bg-game-gold/25 text-game-gold hover:bg-game-gold/40'].join(' ')}>{confirmLabel}</button>
      </div>
    </div>
  )
}

export function ClassQuestRow({ q, onGoto }: { q: ClassChangeQuestDef; onGoto?: () => void }) {
  const units              = useGameStore((s) => s.units)
  const selectedUnitIds    = useGameStore((s) => s.selectedUnitIds)
  const unitStats          = useGameStore((s) => s.unitStats)
  const monsterDefeated    = useGameStore((s) => s.monsterDefeated)
  const questItems         = useGameStore((s) => s.questItems)
  const miscItems          = useGameStore((s) => s.miscItems)
  const commit             = useProtoStore((s) => s.classQuestCommit)
  const beginClassQuest    = useProtoStore((s) => s.beginClassQuest)
  const completeClassQuest = useProtoStore((s) => s.completeClassQuest)
  const cancelClassQuest   = useProtoStore((s) => s.cancelClassQuest)
  const [open, setOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  const commitData      = commit[q.id] ?? null
  const committedHeroId = commitData?.heroId ?? null
  const committedHero   = committedHeroId ? units.find((u) => u.id === committedHeroId) ?? null : null
  // Heroes already committed to *any* path can't begin a second one.
  const busy = new Set(Object.values(commit).map((c) => c.heroId))
  // The selected Novice this path would act on: first selected, unclassed, free hero.
  const selectedNovice = committedHeroId
    ? null
    : units.find((u) => selectedUnitIds.includes(u.id) && isNovice(u) && !busy.has(u.id)) ?? null

  // Live objective progress (kill = kills since baseline; collect = drop ledger;
  // hand-in = how many you currently hold).
  const obj      = q.objective
  const target   = obj.count
  const progress = committedHeroId ? objectiveProgress(obj, commitData, { unitStats, monsterDefeated, questItems, miscItems }) : 0

  const status   = classQuestStatus({ committedHeroId, selectedNovice, progress, target })
  const subject  = committedHero ?? selectedNovice
  const firstName = subject?.name.split(' ')[0] ?? 'the hero'
  const gold     = status === 'eligible' || status === 'ready'

  return (
    <div className={['rounded-md border transition-colors', open ? 'border-game-primary/40 bg-game-bg' : 'border-game-border bg-game-bg'].join(' ')}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.03]">
        <span className={['w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold leading-none shrink-0', CLASS_ICON_CLS[status]].join(' ')}>{CLASS_GLYPH[status]}</span>
        <span className={['text-xs flex-1 truncate', status === 'select-novice' || status === 'underleveled' ? 'text-game-muted' : 'text-game-text'].join(' ')}>{q.title}</span>
        <span className={['text-[10px] shrink-0 tabular-nums', gold ? 'text-game-gold' : 'text-game-text-dim'].join(' ')}>
          {status === 'in-progress' ? `${firstName} · ${progress}/${target}` : CLASS_SUBTITLE[status]}
        </span>
        <span className="text-[10px] text-game-muted shrink-0 w-3 text-center">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-game-border/60">
          <p className="text-[11px] text-game-text-dim leading-snug">{q.story}</p>
          <div className="text-[11px]"><span className="text-game-text-dim">Objective: </span><span className="text-game-text">{q.objective.label}</span></div>

          {/* Reward: the class change is the headline; gear rewards are inspectable. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Reward</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded border border-game-primary/50 bg-game-primary/10 text-game-primary">become a {q.targetClass}</span>
            {q.rewards && <RewardChips rewards={q.rewards} />}
          </div>

          {committedHero && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Hero</span>
              <HeroChip u={committedHero} gold />
            </div>
          )}

          {obj.kind === 'collect' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Quest item</span>
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-game-accent/40 bg-game-accent/10 text-game-text">
                <span aria-hidden>📜</span><span className="truncate">{obj.itemName}</span>
                {committedHeroId && <span className="text-game-text-dim tabular-nums">×{progress}</span>}
              </span>
              <span className="text-[10px] text-game-muted italic">tracked here, not in your bags</span>
            </div>
          )}

          {obj.kind === 'handin' && (() => {
            const held = obj.source === 'quest' ? (questItems[obj.itemId] ?? 0) : (miscItems.find((m) => m.id === obj.itemId)?.quantity ?? 0)
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Hand in</span>
                <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-game-accent/40 bg-game-accent/10 text-game-text">
                  <span aria-hidden>{obj.source === 'quest' ? '📜' : '🎒'}</span><span className="truncate">{obj.itemName}</span>
                  <span className="text-game-text-dim tabular-nums">×{Math.min(obj.count, held)}/{obj.count}</span>
                </span>
                <span className="text-[10px] text-game-muted">you hold {held} in {obj.source === 'quest' ? 'quest items' : 'your stash'} · consumed on hand-in</span>
              </div>
            )
          })()}

          {committedHeroId && <ProgressBar progress={progress} target={target} ready={status === 'ready'} />}

          <div className="pt-2 mt-1 border-t border-game-border/60 space-y-2">
            {status === 'select-novice' && (
              <div className="text-[11px] text-game-muted italic">Select a Novice (level {MIN_CLASS_CHANGE_LEVEL}+) from the roster to walk this path.</div>
            )}
            {status === 'underleveled' && selectedNovice && (
              <div className="text-[11px] text-game-muted italic">{firstName} is only level {selectedNovice.level}. A Novice must reach level {MIN_CLASS_CHANGE_LEVEL} before changing class.</div>
            )}
            {status === 'eligible' && selectedNovice && (
              <button onClick={() => beginClassQuest(q.id, selectedNovice.id)} className="w-full text-xs font-semibold px-3 py-1.5 rounded-md border border-game-gold/60 bg-game-gold/15 text-game-gold hover:bg-game-gold/25 transition-colors">
                Begin — {firstName} takes {q.title}
              </button>
            )}
            {status === 'in-progress' && (
              <div className="text-[11px] text-game-muted italic">
                {firstName} must {q.objective.label.toLowerCase()} ({progress}/{target}).{' '}
                {obj.kind === 'collect' ? `Drops while ${firstName} is deployed where they fall.`
                  : obj.kind === 'handin' ? `Gather ${obj.itemName}s${obj.source === 'inventory' ? ' from the field' : ''}, then hand them in.`
                  : 'Deploy them to a battlefield to make progress.'}
              </div>
            )}
            {(status === 'in-progress' || status === 'ready') && !confirmCancel && !confirmComplete && (
              <>
                {status === 'ready' && (
                  <button
                    onClick={() => { if (objectiveConsumes(obj)) setConfirmComplete(true); else { completeClassQuest(q.id); setOpen(false) } }}
                    className="w-full text-xs font-semibold px-3 py-1.5 rounded-md border border-game-gold/70 bg-game-gold/20 text-game-gold hover:bg-game-gold/30 transition-colors"
                  >
                    {objectiveConsumes(obj) ? `✓ Hand in & become a ${q.targetClass}` : '✓ Complete the class change'}
                  </button>
                )}
                <button onClick={() => setConfirmCancel(true)} className="w-full text-[11px] px-3 py-1.5 rounded-md border border-game-border text-game-text-dim hover:text-rose-300 hover:border-rose-700/60 transition-colors">
                  Cancel quest
                </button>
              </>
            )}
            {status === 'ready' && confirmComplete && (
              <ConfirmPanel
                message={<>Hand in <span className="font-semibold">{obj.count} × {(obj.kind === 'collect' || obj.kind === 'handin') ? obj.itemName : 'items'}</span>? They'll be consumed and {firstName} becomes a {q.targetClass}.</>}
                cancelLabel="Not yet" confirmLabel="Hand in"
                onCancel={() => setConfirmComplete(false)}
                onConfirm={() => { completeClassQuest(q.id); setConfirmComplete(false); setOpen(false) }}
              />
            )}
            {(status === 'in-progress' || status === 'ready') && confirmCancel && (
              <ConfirmPanel danger
                message={<>Are you sure? This will discard all of {firstName}'s progress towards {q.title}.</>}
                cancelLabel="Keep going" confirmLabel="Discard progress"
                onCancel={() => setConfirmCancel(false)}
                onConfirm={() => { cancelClassQuest(q.id); setConfirmCancel(false) }}
              />
            )}
            {onGoto && (
              <button onClick={onGoto} aria-label={`Go to ${q.title}`} className="w-full text-[11px] px-3 py-1.5 rounded-md border border-game-primary/40 text-game-primary/90 hover:bg-game-primary/10 transition-colors">
                Go to location ›
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ClassQuestBoard({ location }: { location: Location }) {
  const quests = CLASS_CHANGE_QUESTS.filter((q) => q.locationId === location.id)
  if (quests.length === 0) return null
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Class Change</div>
      <div className="space-y-1">
        {quests.map((q) => <ClassQuestRow key={q.id} q={q} />)}
      </div>
    </div>
  )
}

// ── Location bounty board (hero-less, chained) ───────────────────────────────--
export function BountyRow({ def, onGoto }: { def: BountyDef; onGoto?: () => void }) {
  const unitStats       = useGameStore((s) => s.unitStats)
  const monsterDefeated = useGameStore((s) => s.monsterDefeated)
  const questItems      = useGameStore((s) => s.questItems)
  const miscItems       = useGameStore((s) => s.miscItems)
  const claimed         = useProtoStore((s) => s.bountyClaimed[def.id] ?? 0)
  const done            = useProtoStore((s) => !def.repeatable && s.bountyDone.includes(def.id))
  const completeBounty  = useProtoStore((s) => s.completeBounty)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const o = def.objective
  const consumes = objectiveConsumes(o)
  const target   = o.count
  const progress = done ? target : bountyProgress(def, { unitStats, monsterDefeated, questItems, miscItems }, claimed)
  const ready    = !done && progress >= target
  const itemId   = o.kind === 'collect' || o.kind === 'handin' ? o.itemId : ''
  const held     = o.kind === 'handin' && o.source === 'inventory'
    ? (miscItems.find((m) => m.id === itemId)?.quantity ?? 0)
    : (questItems[itemId] ?? 0)
  const itemName = (o.kind === 'collect' || o.kind === 'handin') ? o.itemName : ''
  const goldReward = rewardGoldTotal(def.rewards)

  const glyph = done ? '✓' : '?'
  const iconCls = done ? 'border-game-green/50 text-game-green' : ready ? 'border-game-gold/70 text-game-gold' : 'border-game-border text-game-text-dim'

  return (
    <div className={['rounded-md border transition-colors', open ? 'border-game-primary/40 bg-game-bg' : done ? 'border-game-green/30 bg-game-green/5' : 'border-game-border bg-game-bg'].join(' ')}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.03]">
        <span className={['w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold leading-none shrink-0', iconCls].join(' ')}>{glyph}</span>
        <span className="text-xs flex-1 truncate text-game-text">{def.title}</span>
        {def.repeatable && <span className="text-[9px] shrink-0 text-game-accent" title="Repeatable">↻</span>}
        <span className={['text-[10px] shrink-0 tabular-nums', done ? 'text-game-green' : ready ? 'text-game-gold' : 'text-game-text-dim'].join(' ')}>{done ? 'done' : `${progress}/${target}`}</span>
        <span className="text-[10px] text-game-muted shrink-0 w-3 text-center">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-game-border/60">
          <p className="text-[11px] text-game-text-dim leading-snug">{def.story}</p>
          <div className="text-[11px]"><span className="text-game-text-dim">Objective: </span><span className="text-game-text">{o.label}</span>{def.repeatable && <span className="text-game-accent"> · repeatable ↻</span>}</div>

          {/* Reward chips — gold + inspectable gear. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Reward</span>
            <RewardChips rewards={def.rewards} />
          </div>

          {!done && itemName && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Hand in</span>
              <span className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-game-accent/40 bg-game-accent/10 text-game-text">
                <span aria-hidden>🎒</span><span className="truncate">{itemName}</span>
                <span className="text-game-text-dim tabular-nums">×{Math.min(target, held)}/{target}</span>
              </span>
              <span className="text-[10px] text-game-muted">you hold {held} in your stash · consumed on hand-in</span>
            </div>
          )}

          {!done && <ProgressBar progress={progress} target={target} ready={ready} />}

          <div className="pt-2 mt-1 border-t border-game-border/60 space-y-2">
            {done && <div className="text-[11px] text-game-green italic">Bounty complete.</div>}
            {!done && !ready && (
              <div className="text-[11px] text-game-muted italic">
                {consumes ? `Farm ${itemName}s and bring them here to claim the reward.` : `Cull more — ${progress}/${target} this round.`}
              </div>
            )}
            {/* Kill bounties consume nothing → claim straight away. Hand-in/collect go
                behind a "will be consumed" confirm. */}
            {ready && !consumes && (
              <button onClick={() => { completeBounty(def.id); setOpen(false) }} className="w-full text-xs font-semibold px-3 py-1.5 rounded-md border border-game-gold/70 bg-game-gold/20 text-game-gold hover:bg-game-gold/30 transition-colors">
                ✓ Claim {goldReward} gold{def.repeatable ? ' (repeatable)' : ''}
              </button>
            )}
            {ready && consumes && !confirm && (
              <button onClick={() => setConfirm(true)} className="w-full text-xs font-semibold px-3 py-1.5 rounded-md border border-game-gold/70 bg-game-gold/20 text-game-gold hover:bg-game-gold/30 transition-colors">
                ✓ Hand in {target} {itemName}s
              </button>
            )}
            {ready && consumes && confirm && (
              <ConfirmPanel
                message={<>Hand in <span className="font-semibold">{target} × {itemName}</span>? They'll be consumed{goldReward ? ` for ${goldReward} gold` : ''}.</>}
                cancelLabel="Not yet" confirmLabel="Hand in"
                onCancel={() => setConfirm(false)}
                onConfirm={() => { completeBounty(def.id); setConfirm(false); setOpen(false) }}
              />
            )}
            {onGoto && (
              <button onClick={onGoto} aria-label={`Go to ${def.title}`} className="w-full text-[11px] px-3 py-1.5 rounded-md border border-game-primary/40 text-game-primary/90 hover:bg-game-primary/10 transition-colors">
                Go to location ›
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LocationBountyBoard({ location }: { location: Location }) {
  const bountyDone = useProtoStore((s) => s.bountyDone)
  const all = LOCATION_BOUNTIES.filter((b) => b.locationId === location.id)
  if (all.length === 0) return null
  // Hidden until unlocked: only show bounties whose prerequisites are all done.
  const shown = all.filter((b) => bountyVisible(b, bountyDone))
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Bounties</div>
      <div className="space-y-1">
        {shown.map((b) => <BountyRow key={b.id} def={b} />)}
      </div>
    </div>
  )
}

function QuestBoard({ location }: { location: Location }) {
  const doneIds = useProtoStore((s) => s.completedQuests[location.id] ?? [])
  const [showDone, setShowDone] = useState(false)
  const foe = MONSTER_REGISTRY[location.monsterIds[0] ?? '']?.name ?? 'beast'
  const place = location.name
  const board = LOCATION_QUESTS.filter((q) => !doneIds.includes(q.id))
  const done  = LOCATION_QUESTS.filter((q) => doneIds.includes(q.id))

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Quests</div>
      <div className="space-y-1">
        {board.length === 0
          ? <div className="text-[11px] text-game-muted italic">Every quest here is done.</div>
          : board.map((q) => <QuestRow key={q.id} q={q} locId={location.id} foe={foe} place={place} />)}
      </div>

      {done.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setShowDone((v) => !v)} className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-game-text-dim hover:text-game-text py-1">
            <span className="w-3 text-center">{showDone ? '▾' : '▸'}</span>
            <span>Completed</span>
            <span className="text-game-muted normal-case tracking-normal">({done.length})</span>
          </button>
          {showDone && (
            <div className="space-y-1">
              {done.map((q) => (
                <div key={q.id} className="rounded-md border border-game-green/30 bg-game-green/5 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full border border-game-green/50 text-game-green flex items-center justify-center text-[11px] leading-none shrink-0">✓</span>
                    <span className="text-xs text-game-text flex-1 truncate">{fill(q.title, foe, place, q.target)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1 pl-7">
                    <span className="text-[10px] uppercase tracking-wider text-game-text-dim mr-0.5">Gave</span>
                    <RewardChips rewards={q.rewards} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function LocationDetail({ location }: { location: Location }) {
  const units               = useGameStore((s) => s.units)
  const locations           = useGameStore((s) => s.locations)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const locationMonstersSeen = useGameStore((s) => s.locationMonstersSeen)
  const monsterSeen         = useGameStore((s) => s.monsterSeen)
  const assignUnits         = useGameStore((s) => s.assignUnits)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  // Heroes in the current selection that aren't already stationed here.
  const toDeploy = units.filter((u) => selectedUnitIds.includes(u.id) && u.locationId !== location.id)

  // "Enter <Region>" — a world location can open into a dungeon map page. Some
  // pages are sandbox-only (the fixed-encounters test dungeon): hide the entry
  // entirely in curated so the region is unreachable there.
  const progressionMode     = useGameStore((s) => s.progressionMode)
  const entryRegion = location.dungeonEntryRegion && isRegionUnlocked(progressionMode, location.dungeonEntryRegion)
    ? location.dungeonEntryRegion
    : undefined
  function enterRegion() {
    if (!entryRegion) return
    const first = locations.find((l) => l.region === entryRegion)
    setMapPage(entryRegion)
    if (first) setSelectedLocation(first.id)
  }

  const [codexId, setCodexId] = useState<string | null>(null)

  const here = units.filter((u) => u.locationId === location.id)
  // Three positional groups for the Heroes row: present-but-unselected (left),
  // selected & already here (middle), and toDeploy (selected elsewhere) which
  // rides next to the Deploy button on the right.
  const selectedHere = here.filter((u) => selectedUnitIds.includes(u.id))
  const presentUnsel = here.filter((u) => !selectedUnitIds.includes(u.id))
  // Tap a hero chip to add/remove them from the current selection (so this group
  // doubles as a selection surface — you can see who's picked and adjust).
  const toggleSel = (id: string) => useGameStore.setState((s) => ({
    selectedUnitIds: s.selectedUnitIds.includes(id) ? s.selectedUnitIds.filter((x) => x !== id) : [...s.selectedUnitIds, id],
  }))
  // A stationed-here chip (green when just present, primary ring when selected).
  const hereChip = (u: Unit, sel: boolean) => (
    <button
      key={u.id}
      onClick={() => toggleSel(u.id)}
      title={sel ? 'On site · selected' : 'On site'}
      className={[
        'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors',
        sel
          ? 'border-game-primary bg-game-primary/20 text-game-text ring-1 ring-game-primary/40'
          : 'border-game-green/40 bg-game-green/10 text-game-text hover:border-game-green/70',
      ].join(' ')}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-game-green shrink-0" />
      <span className="truncate">{u.name.split(' ')[0]}</span>
      <span className="text-game-text-dim">Lv {u.level}</span>
    </button>
  )

  // Inhabitants: the KNOWN enemies that inhabit this map — the location's monster
  // pool, filtered to those already discovered here. A static bestiary (it grows
  // as you meet new foes, then settles once all are known), NOT who's on the field
  // right now.
  const seenHere = new Set(locationMonstersSeen[location.id] ?? [])
  const foeIds = location.monsterIds.filter((id) => MONSTER_REGISTRY[id] && seenHere.has(id))

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold text-game-text">{location.name}</div>
      </div>

      {/* enter a dungeon sub-region (its own map page) */}
      {entryRegion && (
        <button
          onClick={enterRegion}
          className="inline-flex items-center gap-2 rounded-md border border-rose-700/50 bg-rose-950/20 px-3 py-2 text-left hover:border-rose-600/70"
        >
          <span className="text-base">◆</span>
          <span className="text-sm text-game-text">Enter {REGION_NAMES[entryRegion] ?? entryRegion}</span>
        </button>
      )}

      {/* Heroes here — no label, just the chips present (three positional columns:
          present-but-unselected, selected & already here, and the staged-deploy
          column with selected-elsewhere ghost chips). "No Heroes Here" when empty. */}
      <div>
          <div className="flex items-start gap-x-3 gap-y-1.5 flex-wrap">
            {here.length === 0 && (
              <span className="self-center text-[11px] text-game-text-dim italic">No Heroes Here</span>
            )}
            {presentUnsel.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{presentUnsel.map((u) => hereChip(u, false))}</div>
            )}
            {selectedHere.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{selectedHere.map((u) => hereChip(u, true))}</div>
            )}
            {toDeploy.length > 0 && (
              <div className="ml-auto flex flex-col items-end gap-1.5">
                <button
                  onClick={() => assignUnits(toDeploy.map((u) => u.id), location.id)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md border border-blue-400/70 bg-blue-500/25 text-blue-50 hover:bg-blue-500/40 hover:border-blue-300 transition-colors shadow-sm"
                >
                  ➤ Deploy {toDeploy.length > 1 ? `${toDeploy.length} ` : ''}here
                </button>
                {toDeploy.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleSel(u.id)}
                    title={`${u.name.split(' ')[0]} is elsewhere — Deploy here to bring them in (tap to unselect)`}
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-dashed border-blue-400/60 bg-blue-500/10 text-blue-100 hover:border-blue-300 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="truncate">{u.name.split(' ')[0]}</span>
                    <span className="text-blue-300/80">Lv {u.level}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
      </div>

      {/* class-change quests — hero-relative paths offered in the cities */}
      <ClassQuestBoard location={location} />

      {/* location bounties — hero-less, chained location quests (boar meadow) */}
      <LocationBountyBoard location={location} />

      {/* monster quests (legacy mock board) — only where there are foes and no
          real bounty board yet. Suppressed in peaceful cities and at bounty sites. */}
      {location.monsterIds.length > 0 && !LOCATION_BOUNTIES.some((b) => b.locationId === location.id) && <QuestBoard location={location} />}

      {/* inhabitants — compact chips; tap one to inspect its monster card */}
      {foeIds.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Inhabitants</div>
          <div className="flex flex-wrap gap-1.5">
            {foeIds.map((id) => {
              const m = MONSTER_REGISTRY[id]
              return (
                <button
                  key={id}
                  onClick={() => setCodexId(id)}
                  className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-game-border bg-game-bg text-game-text hover:border-game-primary/50"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ELEMENT_DOT[m.element] ?? ELEMENT_DOT.neutral}`} />
                  <span className="truncate">{m.name}</span>
                  <span className="text-game-text-dim">Lv {m.level}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Lore — flavor text, parked near the bottom to keep the top actionable */}
      {location.description && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Lore</div>
          <p className="text-xs text-game-text-dim italic leading-snug">{location.description}</p>
        </div>
      )}

      <button onClick={() => setSelectedLocation(null)} className="text-[11px] text-game-text-dim hover:text-game-text">clear selection</button>

      {codexId && MONSTER_REGISTRY[codexId] && (
        <MonsterCodex monster={MONSTER_REGISTRY[codexId]} seenCount={monsterSeen[codexId] ?? 0} onClose={() => setCodexId(null)} />
      )}
    </div>
  )
}
