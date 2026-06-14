// Dev-only perf harness seed. Deterministically drops the app into a heavy
// open-world battle — a full party of tactic-laden heroes against the densest
// stress field (Harpy Roost: 25×25, cap 25) — so a Playwright/profiler run has a
// repeatable "lots of visible entities" scene to measure render + sim cost.
//
// Triggered by the `?perf` query param in App.tsx (DEV builds only); it is never
// reached in a production bundle (the `import.meta.env.DEV` gate dead-code-strips
// the dynamic import).
import { useGameStore, listTactics, MAX_UNIT_TACTICS } from '@/stores/useGameStore'

export function seedPerfBattle(targetHeroes = 12): void {
  const get = () => useGameStore.getState()

  // Start from a clean, known roster so the scene is identical every run.
  useGameStore.setState({ units: [], battles: {} })
  while (get().units.length < targetHeroes) get().recruitUnit()
  // recruitUnit derives ids from Date.now(), which collides in this tight loop —
  // reassign stable, unique ids so nothing is keyed on a duplicate.
  useGameStore.setState((s) => ({ units: s.units.map((u, i) => ({ ...u, id: `perf-hero-${i}` })) }))

  // Fill each hero's tactic slots so the engine does representative per-turn work
  // (targeting + movement channels), on top of the 'charger' they recruit with.
  const extra = listTactics('unit')
    .map((t) => t.id)
    .filter((id) => id !== 'charger')
    .slice(0, MAX_UNIT_TACTICS - 1)
  for (const u of get().units) for (const id of extra) get().equipTactic(u.id, id)

  // Densest open-world field — the intended stress arena.
  const loc = get().locations
    .filter((l) => l.openWorld)
    .sort((a, b) => (b.openWorldCap ?? 0) - (a.openWorldCap ?? 0))[0]
  if (!loc) return

  get().assignUnits(get().units.map((u) => u.id), loc.id)
  get().tick()                  // stands up the open battle + scatters cap monsters
  get().enterBattleView(loc.id) // drop straight into the battlefield view
}
