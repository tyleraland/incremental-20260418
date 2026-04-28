export const TICKS_PER_DAY    = 200
export const DAYS_PER_SEASON  = 100
export const SEASONS_PER_YEAR = 4
export const TICKS_PER_SEASON = TICKS_PER_DAY * DAYS_PER_SEASON
export const TICKS_PER_YEAR   = TICKS_PER_SEASON * SEASONS_PER_YEAR
export const SEASON_NAMES     = ['Spring', 'Summer', 'Autumn', 'Winter'] as const

export const RECOVERY_TICKS     = 10  // ticks of KO countdown before regen starts
export const REGEN_RATE         = 5   // HP per tick while recovering or idle
export const FLEE_TICKS_CONST   = 2   // ticks to complete a flee action
export const WAVE_COOLDOWN_MIN  = 3   // min ticks between last defeat and next wave
export const WAVE_COOLDOWN_MAX  = 8   // max ticks between last defeat and next wave
export const ATTACK_SPEED_BASE  = 10  // attackSpeed=10 → 1× multiplier
export const APPROACH_DISTANCE  = 3   // distance units at wave start (placeholder; TODO: use monster movement speed)
export const APPROACH_SPEED     = 1   // distance closed per tick (placeholder; TODO: use monster movement speed)

export const FAMILIARITY_THRESHOLDS = { stats: 2, dropNames: 4, dropRates: 8 } as const

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60), s = seconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function ticksToCalendar(ticks: number) {
  const tickOfDay    = ticks % TICKS_PER_DAY
  const totalDays    = Math.floor(ticks / TICKS_PER_DAY)
  const dayOfSeason  = (totalDays % DAYS_PER_SEASON) + 1
  const totalSeasons = Math.floor(totalDays / DAYS_PER_SEASON)
  const seasonIndex  = totalSeasons % SEASONS_PER_YEAR
  const year         = Math.floor(totalSeasons / SEASONS_PER_YEAR) + 1
  return { year, seasonIndex, seasonName: SEASON_NAMES[seasonIndex], dayOfSeason, tickOfDay }
}
