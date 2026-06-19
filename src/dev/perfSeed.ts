// Dev-only perf harness seed. Deterministically drops the app into a heavy
// open-world battle so a Playwright/profiler run has a repeatable "lots of
// visible entities" scene to measure render + sim cost.
//
// Triggered by the `?perf` query param in App.tsx (DEV builds only); it is never
// reached in a production bundle (the `import.meta.env.DEV` gate dead-code-strips
// the dynamic import).
//
// Tunable via query params so a sweep can scale the load:
//   ?heroes=<n>  party size            (default 12)
//   ?cap=<n>     monsters on the field (default: the location's own cap)
//
// IMPORTANT: the party is built by CLONING the fully-kitted starter heroes
// (INITIAL_UNITS u1–u6: Fighter / Ranger / Mage / Cleric / tank / Rogue), NOT by
// `recruitUnit` — recruits are class-less and skill-less, so the engine only does
// basic-attack work and badly under-represents the real "15 casters throwing AoE"
// load this harness exists to measure.
import { useGameStore, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'

function numParam(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = new URLSearchParams(window.location.search).get(name)
  const n = raw == null ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function seedPerfBattle(targetHeroes = numParam('heroes', 12)): void {
  const get = () => useGameStore.getState()

  // Fully-built heroes only (the blank-slate recruits u7+ carry no kit). Cloning
  // these gives real classes + learnedSkills + action bars + tactics, so the
  // adapter injects skill tactics and casters actually cast (the expensive path).
  const templates = INITIAL_UNITS.filter((u) => u.class)
  const roster: Unit[] = []
  for (let i = 0; i < targetHeroes; i++) {
    const tpl = templates[i % templates.length]
    roster.push({ ...structuredClone(tpl), id: `perf-hero-${i}`, name: `${tpl.name.split(' ')[0]} ${i}` })
  }
  useGameStore.setState({ units: roster, battles: {} })

  // Densest open-world field — the intended stress arena. `?cap` overrides its
  // monster density so a sweep can push entity count past the shipped default.
  const base = get().locations
    .filter((l) => l.openWorld)
    .sort((a, b) => (b.openWorldCap ?? 0) - (a.openWorldCap ?? 0))[0]
  if (!base) return
  const cap = numParam('cap', base.openWorldCap ?? 8)
  if (cap !== (base.openWorldCap ?? 8)) {
    useGameStore.setState((s) => ({
      locations: s.locations.map((l) => (l.id === base.id ? { ...l, openWorldCap: cap } : l)),
    }))
  }

  get().assignUnits(roster.map((u) => u.id), base.id)
  get().tick()                  // stands up the open battle + scatters cap monsters
  get().enterBattleView(base.id) // drop straight into the battlefield view
}
