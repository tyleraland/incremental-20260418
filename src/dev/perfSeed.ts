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
//   ?size=<n>    open-world map side    (default: the location's own size) — sweep
//                this to measure how big a field stays smooth on the throttle.
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

  // Densest open-world field — the intended stress arena. We want the most
  // ON-SCREEN tokens (render cost is bound by what the camera window shows), so
  // sort by packing DENSITY (cap / area), not raw cap: a big sparse field can
  // have a high cap yet show only a handful at once, while a tight swarm map
  // (e.g. the 25×25 Harpy Roost) crams them all into view. `?cap`/`?size`
  // override the picked field so a sweep can push past the shipped default.
  const density = (l: { openWorldCap?: number; openWorldSize?: number }) =>
    (l.openWorldCap ?? 0) / Math.max(1, (l.openWorldSize ?? 50) ** 2)
  const base = get().locations
    .filter((l) => l.openWorld)
    .sort((a, b) => density(b) - density(a))[0]
  if (!base) return
  const cap = numParam('cap', base.openWorldCap ?? 8)
  const size = numParam('size', base.openWorldSize ?? 50)
  if (cap !== (base.openWorldCap ?? 8) || size !== (base.openWorldSize ?? 50)) {
    useGameStore.setState((s) => ({
      locations: s.locations.map((l) => (l.id === base.id ? { ...l, openWorldCap: cap, openWorldSize: size } : l)),
    }))
  }

  get().assignUnits(roster.map((u) => u.id), base.id)
  get().tick()                  // stands up the open battle + scatters cap monsters
  get().enterBattleView(base.id) // drop straight into the battlefield view
}
