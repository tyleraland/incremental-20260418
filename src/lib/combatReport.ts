import type { LocationCombatStats } from '@/types'

// Snapshot of combat outcomes for a location, scoped to a window. The current
// implementation only supports the "ever" window (since the location's first
// kill). The since/window arg exists so future windowing modes can be plugged
// in without changing call sites.
export interface LocationCombatReport {
  startTick: number
  endTick: number
  monstersDefeated: Record<string, number>
  itemsDropped:     Record<string, number>
  expDistributed: number
  goldEarned: number
  hasData: boolean
}

export type CombatReportWindow = { kind: 'ever' }

export function getLocationCombatReport(
  stats: LocationCombatStats | undefined,
  currentTick: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _window: CombatReportWindow = { kind: 'ever' },
): LocationCombatReport {
  if (!stats) {
    return {
      startTick: currentTick, endTick: currentTick,
      monstersDefeated: {}, itemsDropped: {}, expDistributed: 0, goldEarned: 0,
      hasData: false,
    }
  }
  return {
    startTick: stats.startTick,
    endTick:   currentTick,
    monstersDefeated: stats.monstersDefeated,
    itemsDropped:     stats.itemsDropped,
    expDistributed:   stats.expDistributed,
    goldEarned:       stats.goldEarned,
    hasData: true,
  }
}
