// Shared battle-simulator harness — the save-safe scene seeder behind both the
// Density Sandbox (?sandbox=1) and the Monster Lab's Battle Simulator
// (?monsterlab=1). Stands a real open-world battle up on a SYNTHETIC location
// with an exact hero roster + monster composition, then makes it the watched
// battle. Built on the real store + engine + BattleView, so what you observe is
// what ships.
//
// Save safety: this OVERWRITES the in-memory store scene (units/battles/locations)
// — that is only safe because App.tsx runs both harness pages under its
// `noPersist` gate (no autosave, no catch-up), so a real save is never written.
// Callers pass fully-formed, re-id'd shallow-copied heroes; nothing here reaches
// back into a persisted slot.
import { useGameStore, spawnMonsterAt, type Unit } from '@/stores/useGameStore'
import type { Location } from '@/types'

export type Rect = { x: number; y: number; w: number; h: number }

// A random point a few cells off the edges, retried a handful of times so a
// monster never lands inside a wall. (Local copy of the store's un-exported
// scatterPos — good enough for placement here.)
export function scatterPos(size: number, barriers: Rect[]): { x: number; y: number } {
  const m = Math.min(4, size / 2 - 0.5)
  const roll = () => ({ x: m + Math.random() * (size - 2 * m), y: m + Math.random() * (size - 2 * m) })
  let p = roll()
  for (let i = 0; i < 12 && barriers.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); i++) p = roll()
  return p
}

export interface SimSceneOpts {
  locationId: string
  roster: Unit[]                          // fully-formed heroes to field (already re-id'd)
  monsters: { id: string; count: number }[]
  base: Location | null                   // a real map to copy terrain/size from, or null for a plain square
  customSize: number                      // square size when base is null
}

// Tear down and re-seed the whole scene. Stands the battle up EMPTY (cap 0) then
// spawns the exact composition (so per-type counts are honoured), then bumps the
// cap to the total so the store's trickle refills kills back to that density.
// Enters battle view so it full-sims (not off-screen credit). Cheap — call on any
// control change; compose it paused so it never fights live motion.
export function seedSimBattle({ locationId, roster, monsters, base, customSize }: SimSceneOpts): void {
  const store = useGameStore.getState()
  const size = base ? base.openWorldSize ?? 60 : customSize
  const present = monsters.filter((m) => m.count > 0)
  const total = present.reduce((s, m) => s + m.count, 0)
  const monsterIds = present.map((m) => m.id)

  // Synthetic location: copy a real map's terrain/size (mapGen/scenario/traits ride
  // along on the spread) or a plain custom square. cap 0 → stand up with no scatter.
  const loc: Location = base
    ? { ...base, id: locationId, openWorld: true, openWorldCap: 0, openWorldSize: size, monsterIds, connections: [], portals: [] }
    : { id: locationId, name: 'Sim Field', region: 'world', description: 'Battle simulator', traits: ['plains'], monsterIds, familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 0, openWorldSize: size }

  useGameStore.setState((s) => ({
    units: roster,
    battles: {},
    monsterSpawnTimers: {},
    locations: [...s.locations.filter((l) => l.id !== locationId), loc],
  }))
  store.assignUnits(roster.map((u) => u.id), locationId)
  store.tick()   // stands up the empty open battle with the heroes fielded

  const battle = useGameStore.getState().battles[locationId]
  if (battle) {
    for (const m of present) for (let k = 0; k < m.count; k++) spawnMonsterAt(battle, m.id, scatterPos(size, battle.barriers))
    useGameStore.setState((s) => ({
      // Bump the cap now the field's populated, so trickle refills to this density.
      locations: s.locations.map((l) => (l.id === locationId ? { ...l, openWorldCap: total } : l)),
      battles: { ...s.battles, [locationId]: battle },
    }))
  }
  store.enterBattleView(locationId)
}
