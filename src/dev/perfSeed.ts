// Dev-only perf harness seed. Deterministically drops the app into a heavy
// open-world battle so a Playwright/profiler run has a repeatable "lots of
// visible entities" scene to measure render + sim cost.
//
// Triggered by the `?perf` query param in App.tsx (DEV builds only); it is never
// reached in a production bundle (the `import.meta.env.DEV` gate dead-code-strips
// the dynamic import).
//
// The scene is DETERMINISTIC — one run gives a trustworthy fps verdict, so a skin
// A/B doesn't need repeats. The engine is already RNG-free; the run-to-run noise
// was the STORE's Math.random (monster picks, spawn scatter, loot) plus wall-clock
// tick batching. Two levers, both installed here (dev-only):
//   1. Math.random is replaced with a seeded PRNG (mulberry32; `?seed=<n>` to vary)
//      BEFORE the scene is seeded, so every roll from the first scatter on replays
//      identically.
//   2. App.tsx skips its wall-clock catch-up loop in perf mode; ticks are stepped
//      HERE on a fixed cadence — exactly one tick per interval callback, never an
//      elapsed-time batch — so tick N is the same sim state every run regardless
//      of load-induced timer jitter. (`paused` is still honored, so harnesses like
//      many-entities.spec can freeze the loop and time raw tick() calls.)
//
// Tunable via query params so a sweep can scale the load:
//   ?heroes=<n>  party size            (default 12)
//   ?cap=<n>     monsters on the field (default: the location's own cap)
//   ?size=<n>    open-world map side    (default: the location's own size) — sweep
//                this to measure how big a field stays smooth on the throttle.
//   ?seed=<n>    PRNG seed              (default 1337)
//
// IMPORTANT: the party is built by CLONING the fully-kitted starter heroes
// (INITIAL_UNITS u1–u6: Fighter / Ranger / Mage / Cleric / tank / Rogue), NOT by
// `recruitUnit` — recruits are class-less and skill-less, so the engine only does
// basic-attack work and badly under-represents the real "15 casters throwing AoE"
// load this harness exists to measure.
import { useGameStore, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'
import { TICKS_PER_SECOND } from '@/lib/time'

function numParam(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = new URLSearchParams(window.location.search).get(name)
  const n = raw == null ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Small fast seeded PRNG (mulberry32) — quality is irrelevant here; identical
// sequences across runs is the whole point.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedPerfBattle(targetHeroes = numParam('heroes', 12)): void {
  // Determinism lever 1: seed the store's RNG before anything rolls (spawn
  // scatter, monster picks, loot). Dev-only global patch — this module never
  // reaches a production bundle.
  Math.random = mulberry32(numParam('seed', 1337))

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

  // The intended stress arena: the Harpy Roost — a tight field kept packed with a
  // big swarm (heavy on both the engine and the camera-windowed render). Pinned by
  // id rather than inferred, so gameplay density tuning on other fields can't
  // quietly relocate the perf scene; falls back to the densest-by-packing
  // (cap / area) open field if it's ever absent. `?cap`/`?size` override it.
  const density = (l: { openWorldCap?: number; openWorldSize?: number }) =>
    (l.openWorldCap ?? 0) / Math.max(1, (l.openWorldSize ?? 50) ** 2)
  const fields = get().locations.filter((l) => l.openWorld)
  const base = fields.find((l) => l.id === 'harpy-roost')
    ?? [...fields].sort((a, b) => density(b) - density(a))[0]
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

  // Determinism lever 2: fixed-cadence stepping. App.tsx skips its catch-up loop
  // in perf mode; this interval advances EXACTLY one tick per callback (no
  // elapsed-time batching), so the sim state at tick N replays identically even
  // when a throttled run fires the timer late. `paused` still freezes it.
  setInterval(() => {
    const s = get()
    if (!s.paused) s.tick()
  }, 1000 / TICKS_PER_SECOND)
}
