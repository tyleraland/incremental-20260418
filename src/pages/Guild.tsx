import { useGameStore } from '@/stores/useGameStore'

export function Guild() {
  const { units, recruitUnit } = useGameStore((s) => ({
    units: s.units,
    recruitUnit: s.recruitUnit,
  }))

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Recruit card */}
      <div className="border border-game-border rounded-xl p-5 space-y-3">
        <div>
          <div className="font-semibold text-game-text">Recruit a Member</div>
          <div className="text-sm text-game-text-dim mt-0.5">
            A wandering adventurer joins the guild at level 1 with random starting abilities.
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-game-text-dim">
            {units.length} member{units.length !== 1 ? 's' : ''} in guild
          </span>
          <button
            className="btn-primary py-2 px-5 text-sm"
            onClick={recruitUnit}
          >
            Recruit
          </button>
        </div>
      </div>

      {/* Roster */}
      <div className="border border-game-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-game-border">
          <span className="font-semibold text-game-text">Roster</span>
        </div>
        <div className="divide-y divide-game-border/50">
          {units.map((unit) => (
            <div key={unit.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-game-text">{unit.name}</span>
                  {unit.class && (
                    <span className="text-xs text-game-secondary bg-game-secondary/10 px-1.5 py-0.5 rounded">{unit.class}</span>
                  )}
                </div>
                <div className="text-xs text-game-text-dim mt-0.5">
                  Lv.{unit.level} · Age {unit.age}
                </div>
              </div>
              {(unit.abilityPoints > 0 || unit.skillPoints > 0) && (
                <span className="text-xs text-game-gold">(!)</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
