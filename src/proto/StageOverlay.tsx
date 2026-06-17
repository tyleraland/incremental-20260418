import { useGameStore, getAvailableSkills, SKILL_REGISTRY } from '@/stores/useGameStore'
import { type StageOverlay as Overlay } from './protoStore'

// ── Stage overlay (top half = details / research) ─────────────────────────────--
//
// The "decisions on the bottom, details on top" split: quick assignment lives in
// the lens; this panel is drawn over the battlefield/map for the deeper view —
// the skill tree today, item details / codex later. Rendered inside ProtoStage so
// it sits in front of the stage but doesn't cover the lens.

export function StageOverlay({ overlay, onClose }: { overlay: Overlay; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-game-bg/97 backdrop-blur-sm">
      <div className="shrink-0 flex items-center gap-2 px-3 h-10 border-b border-game-border bg-game-surface/70">
        <span className="text-xs font-semibold text-game-text">{overlay.kind === 'skill-tree' ? 'Skill tree' : 'Details'}</span>
        <button onClick={onClose} className="ml-auto text-[11px] px-2.5 py-1 rounded-lg border border-game-border text-game-text-dim hover:text-game-text hover:bg-white/5">✕ Close</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {overlay.kind === 'skill-tree' && <SkillTree unitId={overlay.unitId} />}
      </div>
    </div>
  )
}

// ── Skill tree (learn skills / spend skill points) ────────────────────────────--
function SkillTree({ unitId }: { unitId: string }) {
  const unit = useGameStore((s) => s.units.find((u) => u.id === unitId)) ?? null
  const learnSkill = useGameStore((s) => s.learnSkill)
  if (!unit) return <div className="text-xs text-game-muted">Hero not found.</div>

  const skills = getAvailableSkills(unit)
  // Learnable first (can spend now), then in-progress, then locked, then maxed.
  const rank = (e: ReturnType<typeof getAvailableSkills>[number]) =>
    e.maxed ? 3 : (!e.prereqsMet ? 2 : e.current > 0 ? 1 : 0)
  const sorted = [...skills].sort((a, b) => rank(a) - rank(b) || a.skill.name.localeCompare(b.skill.name))

  return (
    <div className="space-y-3 max-w-xl">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-game-text">{unit.name}</div>
        <div className="text-xs">
          <span className={unit.skillPoints > 0 ? 'text-game-gold' : 'text-game-text-dim'}>{unit.skillPoints} skill pt{unit.skillPoints !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-1.5">
        {sorted.map(({ skill, current, prereqsMet, maxed }) => {
          const canLearn = unit.skillPoints > 0 && prereqsMet && !maxed
          const unmet = skill.requires.filter((r) => (unit.learnedSkills[r.skillId] ?? 0) < r.minLevel)
          return (
            <div key={skill.id} className={['rounded-lg border px-2.5 py-2',
              current > 0 ? 'border-game-primary/40 bg-game-primary/5' : prereqsMet ? 'border-game-border bg-game-bg' : 'border-game-border/50 bg-game-bg/40 opacity-70'].join(' ')}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-game-text flex-1 truncate">{skill.name}</span>
                <span className="text-[9px] px-1 rounded bg-game-border text-game-text-dim">{skill.type ?? 'passive'}</span>
                <span className="text-[10px] text-game-text-dim tabular-nums">{current}/{skill.maxLevel}</span>
              </div>
              <p className="text-[10px] text-game-text-dim leading-snug mt-0.5">{skill.description(Math.max(1, current))}</p>
              {unmet.length > 0 && (
                <div className="text-[9px] text-amber-300/80 mt-1">Needs {unmet.map((r) => `${SKILL_REGISTRY[r.skillId]?.name ?? r.skillId} Lv ${r.minLevel}`).join(', ')}</div>
              )}
              <button
                onClick={() => learnSkill(unit.id, skill.id)}
                disabled={!canLearn}
                className={['mt-1.5 w-full text-[11px] py-1 rounded border transition-colors',
                  maxed ? 'border-game-border text-game-muted cursor-default'
                    : canLearn ? 'border-game-gold/50 text-game-gold hover:bg-game-gold/10'
                    : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
              >{maxed ? 'Mastered' : current > 0 ? `Level up → ${current + 1}` : 'Learn'}</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

