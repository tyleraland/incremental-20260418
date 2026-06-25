import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, getAvailableSkills, SKILL_REGISTRY } from '@/stores/useGameStore'
import { buildEngineSkill } from '@/engine'
import { type StageOverlay as Overlay } from './protoStore'

// ── Stage overlay (top half = details / research) ─────────────────────────────--
//
// The "decisions on the bottom, details on top" split: quick assignment lives in
// the lens; this panel is drawn over the battlefield/map for the deeper view —
// the skill tree today, item details / codex later. Rendered inside ProtoStage so
// it sits in front of the stage but doesn't cover the lens.

export function StageOverlay({ overlay, onClose }: { overlay: Overlay; onClose: () => void }) {
  // Full-screen, solid panel (no blur/transparency). Portaled to <body> so it
  // covers the whole viewport — escaping the stage's transformed camera ancestor
  // (a `fixed` child of a transformed element is clipped to that element, not the
  // screen) — and sits above the lens beneath it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-game-bg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shrink-0 flex items-center gap-2 px-3 h-10 border-b border-game-border bg-game-surface">
        <span className="text-xs font-semibold text-game-text">{overlay.kind === 'skill-tree' ? 'Skill tree' : 'Details'}</span>
        <button onClick={onClose} className="ml-auto text-[11px] px-2.5 py-1 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5">✕ Close</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {overlay.kind === 'skill-tree' && <SkillTree unitId={overlay.unitId} />}
      </div>
    </div>, document.body)
}

// ── Skill model helpers ───────────────────────────────────────────────────────
type SkillEntry = ReturnType<typeof getAvailableSkills>[number]

// The simultaneous-active cap the engine gates on (firewalls a caster can keep
// up, or how many of a capped buff/status its team can carry) — null if uncapped.
// Mirrors engine `skillActiveCap`'s two flavours, read statically from the def so
// the tree can hint it without a live battle (the battle card shows live n/max).
function skillCapMax(skillId: string, level: number): number | null {
  const es = buildEngineSkill(skillId, Math.max(1, level))
  if (!es) return null
  if (es.wall) return es.wall.maxActive
  if (es.statusApplied && es.statusMaxActive != null) return es.statusMaxActive
  return null
}

// Placeholder per-skill icons. Emoji for now (tolerable while prototyping); the
// real win later is bespoke art that gives builds visual identity. Keep this map
// the single source so swapping to <img>/sprite is a one-spot change. Unknown ids
// fall back to a type glyph (see iconFor).
const SKILL_ICON: Record<string, string> = {
  'sword-mastery-1h': '🗡️', 'sword-mastery-2h': '⚔️',
  'keen-eyes': '👁️', 'eagle-eyes': '🦅',
  'arcane-knowledge': '📖', 'spellweaving': '🧵',
  'toughness': '🛡️', 'evasion': '💨', 'defensive-stance': '🧱',
  'fire-bolt': '🔥', 'frost-bolt': '❄️', 'earth-bolt': '🪨', 'lightning-bolt': '⚡',
  'bash': '💥', 'heal': '✚', 'aoe-heal': '💖', 'shield-wall': '🚧', 'last-stand': '🩸',
  'boost-agility': '🏃', 'bless': '✨', 'hammer-fall': '🔨', 'poison': '☠️', 'arrow-shower': '🏹',
  'fireball': '🌋', 'firewall': '🔥', 'lightning-storm': '🌩️', 'molasses': '🍯',
  'ankle-snare': '🪤', 'taunt': '📢', 'freeze': '🧊', 'dispel': '🌀',
  'cloak': '👤', 'back-stab': '🔪', 'sight': '🔍', 'beast-companion': '🐾', 'summon-skeletons': '💀',
}
const TYPE_GLYPH: Record<string, string> = { active: '✦', passive: '◈' }
function iconFor(skillId: string, type: string): string {
  return SKILL_ICON[skillId] ?? TYPE_GLYPH[type] ?? '◈'
}

type NodeState = 'mastered' | 'learned' | 'available' | 'locked'
function nodeStateOf(e: SkillEntry): NodeState {
  if (e.maxed) return 'mastered'
  if (!e.prereqsMet) return 'locked'
  return e.current > 0 ? 'learned' : 'available'
}

type FilterId = 'all' | 'available' | 'owned'
const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'available', label: 'Available' }, { id: 'owned', label: 'Owned' },
]
function matchesFilter(e: SkillEntry, f: FilterId): boolean {
  if (f === 'available') return e.prereqsMet && !e.maxed
  if (f === 'owned') return e.current > 0
  return true
}

// A branch = a root skill (no visible prerequisite) plus the skills that require
// it. The real prereq graph is shallow — every chain is exactly root → children —
// so a branch renders as one node over a row of its children, wired by connectors.
interface Branch { root: SkillEntry; children: SkillEntry[] }
function buildBranches(entries: SkillEntry[]): Branch[] {
  const visible = new Set(entries.map((e) => e.skill.id))
  const childrenOf = new Map<string, SkillEntry[]>()
  const roots: SkillEntry[] = []
  for (const e of entries) {
    const parentId = e.skill.requires[0]?.skillId
    if (parentId && visible.has(parentId)) {
      const arr = childrenOf.get(parentId); if (arr) arr.push(e); else childrenOf.set(parentId, [e])
    } else {
      roots.push(e)
    }
  }
  // Trees (branches with children) lead; within, alphabetical for a stable read.
  return roots
    .map((root) => ({ root, children: (childrenOf.get(root.skill.id) ?? []).sort((a, b) => a.skill.name.localeCompare(b.skill.name)) }))
    .sort((a, b) => (b.children.length > 0 ? 1 : 0) - (a.children.length > 0 ? 1 : 0) || a.root.skill.name.localeCompare(b.root.skill.name))
}

// List order: what you can act on first (available), then owned, then the locked
// goals you're planning toward, then mastered. Alphabetical within each bucket.
function listRank(e: SkillEntry): number {
  if (e.maxed) return 3
  if (!e.prereqsMet) return 2
  if (e.current > 0) return 1
  return 0
}

// ── Skill tree (learn skills / spend skill points) ────────────────────────────--
function SkillTree({ unitId }: { unitId: string }) {
  const unit = useGameStore((s) => s.units.find((u) => u.id === unitId)) ?? null
  const progressionMode = useGameStore((s) => s.progressionMode)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'tree' | 'list'>('tree')
  const [filter, setFilter] = useState<FilterId>('all')
  if (!unit) return <div className="text-xs text-game-muted">Hero not found.</div>

  // Curated: only this hero's class kit (+ already-learned) is shown; a Novice has
  // none until they pick a class. Sandbox: the full tree.
  const all = getAvailableSkills(unit, progressionMode).filter((e) => e.unlocked)
  const entries = all.filter((e) => matchesFilter(e, filter))
  const branches = buildBranches(entries)
  const list = [...entries].sort((a, b) => listRank(a) - listRank(b) || a.skill.name.localeCompare(b.skill.name))
  const hasPoints = unit.skillPoints > 0
  const selected = selectedId ? all.find((e) => e.skill.id === selectedId) ?? null : null

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header — hero identity + the prize: skill points to invest. */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-game-text truncate">{unit.name}</div>
          <div className="text-[11px] text-game-text-dim">{unit.class ?? 'Novice'} · Lv {unit.level}</div>
        </div>
        <div className={['ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border tabular-nums',
          hasPoints ? 'border-game-gold/60 bg-game-gold/10 text-game-gold' : 'border-game-border text-game-text-dim'].join(' ')}>
          <span className="text-base leading-none">◆</span>
          <span className="text-sm font-bold leading-none">{unit.skillPoints}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-80">point{unit.skillPoints !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Controls — filter (skip past what you didn't invest in) + Tree/List view. */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-lg border border-game-border p-0.5">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={['text-[11px] px-2 py-0.5 rounded-md transition-colors',
                filter === f.id ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text'].join(' ')}
            >{f.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-game-border p-0.5">
          {(['tree', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={['text-[11px] px-2 py-0.5 rounded-md capitalize transition-colors',
                view === v ? 'bg-game-primary/20 text-game-text' : 'text-game-text-dim hover:text-game-text'].join(' ')}
            >{v}</button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-game-border bg-game-bg/40 px-4 py-8 text-center">
          <div className="text-2xl opacity-40 mb-1">✦</div>
          <div className="text-xs text-game-text-dim">{all.length === 0 ? 'No skills to train yet.' : 'Nothing matches this filter.'}</div>
          {all.length === 0 && <div className="text-[10px] text-game-muted mt-1">A Novice unlocks a tree by choosing a class in the city.</div>}
        </div>
      ) : view === 'tree' ? (
        // Responsive masonry: bigger trees span more columns; dense flow fills the
        // gaps so the branches pack tightly on any width. The full tree (filter:
        // All) is the planning surface — locked goals stay visible to invest toward.
        // Explicit column counts (2/3/4) so a branch's span never exceeds the
        // available tracks — an over-span would spawn an implicit overflow column.
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 [grid-auto-flow:dense]">
          {branches.map((b) => (
            <BranchBlock key={b.root.skill.id} branch={b} hasPoints={hasPoints} selectedId={selectedId} onSelect={setSelectedId} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {list.map((e) => (
            <SkillRow key={e.skill.id} entry={e} hasPoints={hasPoints} selected={selectedId === e.skill.id} onSelect={setSelectedId} />
          ))}
        </div>
      )}

      {selected && createPortal(
        <SkillDetail unitId={unit.id} skillId={selected.skill.id} onClose={() => setSelectedId(null)} />, document.body)}
    </div>
  )
}

// One branch: the root node, then (if any) a connector band and a row of children
// laid out in equal columns so the connectors land on exact cell centres.
function BranchBlock({ branch, hasPoints, selectedId, onSelect }: { branch: Branch; hasPoints: boolean; selectedId: string | null; onSelect: (id: string) => void }) {
  const { root, children } = branch
  // Cap span to the column count at each breakpoint (base 2 / sm 3 / lg 4) so it
  // never exceeds available tracks. A 3-child tree gets a wider span where it fits.
  const span = children.length >= 3 ? 'col-span-2 sm:col-span-3'
    : children.length >= 1 ? 'col-span-2'
    : 'col-span-1'
  return (
    <div className={`${span} rounded-xl border border-game-border/40 bg-black/15 p-1.5`}>
      <div className="flex justify-center">
        <SkillNode entry={root} hasPoints={hasPoints} selected={selectedId === root.skill.id} onSelect={onSelect} />
      </div>
      {children.length > 0 && (
        <>
          <Connectors count={children.length} active={root.current > 0} childMet={children.map((c) => c.prereqsMet)} />
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${children.length}, minmax(0, 1fr))`, justifyItems: 'center' }}>
            {children.map((c) => (
              <SkillNode key={c.skill.id} entry={c} hasPoints={hasPoints} selected={selectedId === c.skill.id} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Deterministic root→children connectors: a stem from the root centre down to a
// horizontal bus, then a drop to each child's column centre (i+0.5)/n. No DOM
// measurement — equal-fraction columns put each child centre at a known %.
function Connectors({ count, active, childMet }: { count: number; active: boolean; childMet: boolean[] }) {
  const H = 14
  const mid = H / 2
  const cx = (i: number) => `${((i + 0.5) / count) * 100}%`
  const stroke = active ? 'text-game-primary/50' : 'text-game-border'
  return (
    <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className={`block ${stroke}`} aria-hidden>
      <line x1="50%" y1={0} x2="50%" y2={mid} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {count > 1 && (
        <line x1={cx(0)} y1={mid} x2={cx(count - 1)} y2={mid} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {childMet.map((met, i) => (
        <line key={i} x1={cx(i)} y1={mid} x2={cx(i)} y2={H}
          stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke"
          strokeDasharray={met ? undefined : '2 2'} opacity={met ? 1 : 0.5} />
      ))}
    </svg>
  )
}

// State-driven node visuals. Clean over flashy: a trained node tints primary, a
// node you can train now carries a calm gold border + a small ◆ tag (no pulse),
// mastered is solid gold, locked is dimmed with a 🔒.
function nodeClasses(state: NodeState, canSpend: boolean): string {
  const base =
    state === 'mastered' ? 'border-game-gold/70 bg-game-gold/10'
    : state === 'learned' ? 'border-game-primary/50 bg-game-primary/10'
    : state === 'locked' ? 'border-game-border/40 bg-game-bg/40 opacity-60'
    : 'border-game-border bg-game-bg'
  return canSpend ? 'border-game-gold/60 bg-game-gold/[0.07]' : base
}

function SkillNode({ entry, hasPoints, selected, onSelect }: { entry: SkillEntry; hasPoints: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const { skill, current, prereqsMet, maxed } = entry
  const state = nodeStateOf(entry)
  const type = skill.type ?? 'passive'
  const canSpend = hasPoints && prereqsMet && !maxed
  const pct = Math.round((current / skill.maxLevel) * 100)
  return (
    <button
      onClick={() => onSelect(skill.id)}
      title={skill.name}
      className={['relative w-full max-w-[150px] rounded-lg border px-2 py-1.5 text-left transition-colors',
        nodeClasses(state, canSpend),
        selected ? 'ring-1 ring-game-secondary' : '',
        state === 'locked' ? '' : 'hover:border-game-text-dim'].join(' ')}
    >
      <div className="flex items-center gap-1.5">
        <span className={`text-sm leading-none shrink-0 ${state === 'locked' ? 'grayscale opacity-60' : ''}`}>{iconFor(skill.id, type)}</span>
        <span className="text-[11px] font-medium text-game-text leading-tight line-clamp-2 flex-1">{skill.name}</span>
        {canSpend && <span className="shrink-0 text-[9px] leading-none text-game-gold">◆</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <div className="flex-1 h-1 rounded-full bg-black/40 overflow-hidden">
          <div className={`h-full ${maxed ? 'bg-game-gold' : 'bg-game-primary'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[8px] tabular-nums text-game-text-dim shrink-0">{current}/{skill.maxLevel}</span>
      </div>
    </button>
  )
}

// Flat list row — the "show me what's available, expand for details" read. Same
// states/icons as the tree, with the prerequisite spelled out inline (no graph to
// trace), and a tap opens the same detail sheet.
function SkillRow({ entry, hasPoints, selected, onSelect }: { entry: SkillEntry; hasPoints: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const { skill, current, prereqsMet, maxed } = entry
  const state = nodeStateOf(entry)
  const type = skill.type ?? 'passive'
  const canSpend = hasPoints && prereqsMet && !maxed
  const pct = Math.round((current / skill.maxLevel) * 100)
  const unmet = skill.requires.filter((r) => !prereqsMet && r)
  return (
    <button
      onClick={() => onSelect(skill.id)}
      className={['w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
        nodeClasses(state, canSpend),
        selected ? 'ring-1 ring-game-secondary' : '',
        state === 'locked' ? '' : 'hover:border-game-text-dim'].join(' ')}
    >
      <span className={`text-base leading-none shrink-0 ${state === 'locked' ? 'grayscale opacity-60' : ''}`}>{iconFor(skill.id, type)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-game-text truncate">{skill.name}</span>
          <span className="text-[8px] uppercase tracking-wide text-game-text-dim shrink-0">{type}</span>
          {maxed && <span className="text-[8px] uppercase tracking-wide text-game-gold shrink-0">max</span>}
        </div>
        {state === 'locked' && unmet.length > 0 ? (
          <div className="text-[9px] text-amber-300/80 truncate">Needs {unmet.map((r) => `${SKILL_REGISTRY[r.skillId]?.name ?? r.skillId} Lv ${r.minLevel}`).join(', ')}</div>
        ) : (
          <div className="text-[9px] text-game-text-dim truncate">{skill.description(Math.max(1, current))}</div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1.5 w-20">
        <div className="flex-1 h-1 rounded-full bg-black/40 overflow-hidden">
          <div className={`h-full ${maxed ? 'bg-game-gold' : 'bg-game-primary'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[8px] tabular-nums text-game-text-dim">{current}/{skill.maxLevel}</span>
      </div>
      {canSpend && <span className="shrink-0 text-[10px] leading-none text-game-gold">◆</span>}
    </button>
  )
}

// Bottom-sheet detail: the full effect, the next-level preview, prereqs, and the
// actual Learn / Level-up action. Reads the live unit so leveling updates in place.
function SkillDetail({ unitId, skillId, onClose }: { unitId: string; skillId: string; onClose: () => void }) {
  const unit = useGameStore((s) => s.units.find((u) => u.id === unitId)) ?? null
  const progressionMode = useGameStore((s) => s.progressionMode)
  const learnSkill = useGameStore((s) => s.learnSkill)
  const skill = SKILL_REGISTRY[skillId]
  if (!unit || !skill) return null

  const entry = getAvailableSkills(unit, progressionMode).find((e) => e.skill.id === skillId)
  if (!entry) return null
  const { current, prereqsMet, maxed } = entry
  const type = skill.type ?? 'passive'
  const canLearn = unit.skillPoints > 0 && prereqsMet && !maxed
  const unmet = skill.requires.filter((r) => (unit.learnedSkills[r.skillId] ?? 0) < r.minLevel)
  const nextDesc = !maxed ? skill.description(current + 1) : null
  const curDesc = skill.description(Math.max(1, current))
  const capMax = skillCapMax(skill.id, current)

  const actionLabel = maxed ? 'Mastered'
    : !prereqsMet ? 'Locked'
    : unit.skillPoints <= 0 ? 'No skill points'
    : current > 0 ? `Level up → ${current + 1}` : 'Learn'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-game-surface border border-game-border rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-3 border-b border-game-border">
          <div className="flex items-start gap-2">
            <span className="text-xl leading-none mt-0.5">{iconFor(skill.id, type)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-game-text">{skill.name}</div>
              <div className="text-[10px] uppercase tracking-wide text-game-text-dim">{type} · Lv {current}/{skill.maxLevel}</div>
            </div>
            <button onClick={onClose} className="w-7 h-7 shrink-0 rounded-lg border border-game-border text-game-text-dim hover:bg-white/5">✕</button>
          </div>
          <div className="mt-2.5 flex gap-0.5">
            {Array.from({ length: skill.maxLevel }, (_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i < current ? (maxed ? 'bg-game-gold' : 'bg-game-primary') : 'bg-black/40'}`} />
            ))}
          </div>
        </div>

        <div className="px-4 py-3 space-y-2.5">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-game-text-dim mb-0.5">{current > 0 ? `Current (Lv ${current})` : 'At level 1'}</div>
            <p className="text-xs text-game-text leading-snug">{curDesc}</p>
          </div>
          {nextDesc && nextDesc !== curDesc && (
            <div className="rounded-lg border border-game-primary/30 bg-game-primary/5 px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-wider text-game-primary/80 mb-0.5">Next · Lv {current + 1}</div>
              <p className="text-xs text-game-text-dim leading-snug">{nextDesc}</p>
            </div>
          )}
          {capMax != null && (
            <div className="text-[10px] text-game-text-dim" title="The engine limits how many of this effect can be active at once (the battle card shows the live count).">
              ⤴ Up to {capMax} active at once
            </div>
          )}
          {unmet.length > 0 && (
            <div className="text-[10px] text-amber-300/90">
              Requires {unmet.map((r) => `${SKILL_REGISTRY[r.skillId]?.name ?? r.skillId} Lv ${r.minLevel}`).join(', ')}
            </div>
          )}
        </div>

        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          <button
            onClick={() => learnSkill(unit.id, skill.id)}
            disabled={!canLearn}
            className={['w-full py-2.5 rounded-xl text-sm font-semibold border transition-colors',
              !canLearn ? 'border-game-border text-game-muted cursor-not-allowed'
                : 'border-game-gold/60 bg-game-gold/15 text-game-gold hover:bg-game-gold/25'].join(' ')}
          >{actionLabel}{canLearn ? ' · ◆1' : ''}</button>
        </div>
      </div>
    </div>
  )
}
