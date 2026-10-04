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
//   ?barriers=<n> synthetic wall/cliff rects scattered over the field (default:
//                the location's own terrain) — the PATHING-load sweep. steerAround
//                cost grows with rect COUNT; this is how the envelope constant in
//                map-perf-envelope.test.ts gets measured before it moves.
//   ?genmap=field|dungeon  REALISTIC-geometry pathing load: a real generateMap
//                bake shipped through specBarriers as the field's terrain — the
//                rect shapes live maps actually produce (river/lake band cover,
//                gate plugs, outcrops; dungeon maximal-rect wall cover), not
//                synthetic scatter. Water themes + gates ON + an EMPTY kit =
//                every plug closed (the rect-count worst case). With ?genmap,
//                ?barriers becomes the bake's maxBarriers cap (default 72) and
//                the arena adopts the bake's size. NOTE (probed 2026-07): the
//                field recipe's explicit per-pass allotments plateau its spend
//                UNDER the cap (~21 rects at size 96, ~38 at 200, any cap ≥40)
//                — count sweeps ride ?barriers or heavy dungeon seeds; genmap
//                benches the realistic SHAPES. Bake facts land on
//                window.__perfGen for the harness to log.
//   ?genseed=<n> genmap bake seed (default 1337; bakes as 'perf-<recipe>-<n>')
//   ?seed=<n>    PRNG seed              (default 1337)
//
// IMPORTANT: the party is built by CLONING the fully-kitted starter heroes
// (INITIAL_UNITS u1–u6: Fighter / Ranger / Mage / Cleric / tank / Rogue), NOT by
// `recruitUnit` — recruits are class-less and skill-less, so the engine only does
// basic-attack work and badly under-represents the real "15 casters throwing AoE"
// load this harness exists to measure.
import { useGameStore, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'
import { SCENARIO_REGISTRY } from '@/data/scenarios'
import { TICKS_PER_SECOND } from '@/lib/time'
import { generateMap, RECIPE_REGISTRY, specBarriers, type ThemeTag } from '@/mapgen'
import type { Barrier } from '@/engine'

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
  let size = numParam('size', base.openWorldSize ?? 50)

  // ── Pathing-load terrain (?genmap / ?barriers) — the map-perf-envelope bench
  // inputs. Either path registers a dev-only scenario entry; wiring it through
  // testScenarioId means the battle stands up with the terrain in place
  // (monsters scatter AROUND it, exactly like a real authored/generated map —
  // not a post-hoc barrier swap).
  //
  // ?genmap=field|dungeon: REAL recipe geometry via generateMap → specBarriers
  // (see the header). Deterministic per ?genseed; kitless + gates ON = every
  // plug closed, the rect-count worst case a live map can ship.
  // ?barriers=<n>: n synthetic seeded scattered rects — the COUNT-controlled
  // sweep (the bake spends what its dials allot; synthetic rects obey exactly).
  const genmap = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('genmap')
  let rects: Barrier[] | null = null
  let genSpawn: { x: number; y: number } | null = null
  if (genmap === 'field' || genmap === 'dungeon') {
    const res = generateMap(RECIPE_REGISTRY[genmap], {
      recipe: genmap,
      seed: `perf-${genmap}-${numParam('genseed', 1337)}`,
      // The dungeon bakes at its recipe-default size (its room math owns it);
      // the field bakes at ?size so the sweep can cover live shapes (96 ≈
      // mirror-vale, 200 ≈ the beach). Arena adopts the bake's size below.
      size: genmap === 'dungeon' ? (RECIPE_REGISTRY.dungeon.defaults?.size ?? 48) : size,
      themes: (genmap === 'dungeon' ? ['dungeon'] : ['plains', 'water']) as ThemeTag[],
      maxBarriers: numParam('barriers', 72),
      gates: true,
      proficiencies: [],
    })
    rects = specBarriers(res.spec)
    size = res.spec.cols
    // Heroes knot at the arena centre by default; a dungeon's walkable entry is
    // its spawn POI, not the centre — remember it and teleport after stand-up.
    genSpawn = res.spec.semantic.pois.find((p) => p.kind === 'spawn')?.at ?? null
    // Bake facts for the harness log (rect count is the variable under test).
    ;(window as unknown as { __perfGen?: object }).__perfGen =
      { rects: rects.length, size: res.spec.cols, ok: res.report.ok, attempts: res.attempts }
  } else {
    const nBarriers = numParam('barriers', 0)
    if (nBarriers > 0) {
      const br = mulberry32((numParam('seed', 1337) ^ 0xba7) >>> 0)
      rects = Array.from({ length: nBarriers }, () => ({
        x: 1 + br() * (size - 9), y: 1 + br() * (size - 9),
        w: 1 + br() * 7, h: 1 + br() * 7,
        kind: br() < 0.25 ? ('cliff' as const) : ('wall' as const),
      }))
    }
  }

  if (cap !== (base.openWorldCap ?? 8) || size !== (base.openWorldSize ?? 50)) {
    useGameStore.setState((s) => ({
      locations: s.locations.map((l) => (l.id === base.id ? { ...l, openWorldCap: cap, openWorldSize: size } : l)),
    }))
  }

  if (rects) {
    const frozen = rects
    SCENARIO_REGISTRY['perf-barriers'] = {
      id: 'perf-barriers',
      name: 'Perf barrier sweep',
      description: genmap
        ? `Generated pathing-load terrain (?genmap=${genmap}, ${frozen.length} rects). Dev-only; registered by perfSeed.`
        : `Synthetic pathing-load terrain (?barriers=${frozen.length}). Dev-only; registered by perfSeed.`,
      barriers: () => frozen,
    }
    useGameStore.setState((s) => ({
      locations: s.locations.map((l) => (l.id === base.id ? { ...l, testScenarioId: 'perf-barriers' } : l)),
    }))
  }

  get().assignUnits(roster.map((u) => u.id), base.id)
  get().tick()                  // stands up the open battle + scatters cap monsters
  if (genSpawn) {
    // Re-knot the party on the bake's spawn POI (combatants mutate in place —
    // same discipline as the engine). A field's spawn IS the centre, so this
    // only really moves a dungeon party out of the wall cover.
    const battle = get().battles[base.id]
    let i = 0
    for (const c of battle?.combatants ?? []) {
      if (c.team !== 'player') continue
      c.pos.x = genSpawn.x + (i % 3) - 1
      c.pos.y = genSpawn.y + Math.floor(i / 3) - 1
      i++
    }
  }
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
