import type { EncounterSlot, MonsterPoolEntry } from '@/types'
import { RESPAWN_TICKS_MIN, RESPAWN_TICKS_MAX } from '@/lib/time'

export const ENCOUNTER_START_DISTANCE  = 100  // feet; both sides start here and approach
export const PARTY_APPROACH_SPEED      = 10   // feet/tick the party moves toward the encounter
export const MONSTER_DEFAULT_MOVE_SPEED = 10  // feet/tick for monsters without an explicit moveSpeed

// EXTENSION POINT: determines when to draw a new encounter from the pool.
// Currently: end-of-encounter only (all slots fully defeated).
// Future option: per-tick reinforcement draws — see backlog.md.
export function isEncounterComplete(slots: EncounterSlot[]): boolean {
  return slots.length === 0 || slots.every((sl) => sl.progress >= 1)
}

export function sampleEncounter(
  pool: MonsterPoolEntry[],
  cooldowns: Record<string, number[]>,  // monsterId → readyAtTick[]
  currentTick: number,
  encounterSize: [number, number],
): EncounterSlot[] {
  const available = pool.flatMap((entry) => {
    if (entry.maxPopulation === null) return [{ monsterId: entry.monsterId, w: entry.weight }]
    const onCooldown = (cooldowns[entry.monsterId] ?? []).filter((t) => t > currentTick).length
    const avail = entry.maxPopulation - onCooldown
    if (avail <= 0) return []
    return [{ monsterId: entry.monsterId, w: entry.weight * (avail / entry.maxPopulation) }]
  })
  if (available.length === 0) return []

  const [minSize, maxSize] = encounterSize
  const size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1))
  const slots: EncounterSlot[] = []

  for (let i = 0; i < size; i++) {
    const total = available.reduce((sum, e) => sum + e.w, 0)
    if (total <= 0) break
    let r = Math.random() * total
    for (const entry of available) {
      r -= entry.w
      if (r <= 0) {
        slots.push({ monsterId: entry.monsterId, progress: 0, targetUnitId: null, behavior: 'normal' })
        break
      }
    }
  }
  return slots
}

// Returns an absolute tick at which a just-defeated monster becomes available again.
export function randomRespawnTick(currentTick: number): number {
  return currentTick + RESPAWN_TICKS_MIN + Math.floor(Math.random() * (RESPAWN_TICKS_MAX - RESPAWN_TICKS_MIN + 1))
}
