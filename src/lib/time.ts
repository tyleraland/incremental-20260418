export const TICKS_PER_DAY    = 200
export const DAYS_PER_SEASON  = 100
export const SEASONS_PER_YEAR = 4
export const TICKS_PER_SEASON = TICKS_PER_DAY * DAYS_PER_SEASON
export const TICKS_PER_YEAR   = TICKS_PER_SEASON * SEASONS_PER_YEAR
export const SEASON_NAMES     = ['Spring', 'Summer', 'Autumn', 'Winter'] as const

export const RECOVERY_TICKS   = 10  // ticks of KO countdown before regen starts
export const REGEN_RATE       = 5   // HP per tick while recovering or idle
export const FLEE_TICKS_CONST = 2   // ticks to complete a flee action

export const FAMILIARITY_THRESHOLDS = { stats: 2, dropNames: 4, dropRates: 8 } as const

export function ticksToCalendar(ticks: number) {
  const tickOfDay    = ticks % TICKS_PER_DAY
  const totalDays    = Math.floor(ticks / TICKS_PER_DAY)
  const dayOfSeason  = (totalDays % DAYS_PER_SEASON) + 1
  const totalSeasons = Math.floor(totalDays / DAYS_PER_SEASON)
  const seasonIndex  = totalSeasons % SEASONS_PER_YEAR
  const year         = Math.floor(totalSeasons / SEASONS_PER_YEAR) + 1
  return { year, seasonIndex, seasonName: SEASON_NAMES[seasonIndex], dayOfSeason, tickOfDay }
}
