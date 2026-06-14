# Large-Battle Performance Plan

Target: keep ~25+ entity open-world battles smooth on mobile. The render path
dominates and is almost entirely **open-world only** (encounters run a static
camera with no rAF loop, so they're already cheap). Phases are ordered by
bang-for-buck; do them in order and stop when it's smooth enough.

## Diagnosis (why it's slow)

The open-world smooth-motion loop calls `setFrame` every animation frame
(`src/components/BattleView.tsx:154`, in `useSmoothScene`), which re-renders the
**entire `LiveBattle` subtree ~60×/sec**. Nothing is memoized: `BattleChip` is a
plain function and every token gets fresh `onSelect`/`pos`/`glyph`/inline-`style`
props (`:1389-1401`), and ~10 derived arrays (`alive`, `roundEvents`, the
`hits`/`spawns`/`aggros`/... filters, `castLabelGroups`) re-run in the render body
each frame. The engine is in better shape — the spatial hash keeps big scans at
~O(√N) — but `visibleEnemiesOf` is recomputed 3–5× per unit/turn with no caching,
and a few spots are super-linear (minion cleanup, zone membership, hash rebuilt
each round).

## Phase 1 — Decouple motion from React (biggest win, no behavior change)

Key files: `src/components/BattleView.tsx` (`useSmoothScene`, `LiveBattle`,
`BattleChip`, `Arena`).

Drive the per-frame interpolated token positions (and the camera/world pan) by
writing `transform` straight to DOM nodes via refs inside the rAF loop, instead
of `setFrame` re-rendering the whole subtree. React then only re-renders on real
rounds (~2.5/sec), removing ~95% of the open-world render cost. Pair this with
`React.memo` on `BattleChip` plus stabilized props (`useCallback` select handler
keyed by id, precomputed glyph) and `useMemo` on the derived arrays (one bucketed
pass over `roundEvents` instead of six `.filter()`s).

## Phase 2 — Level-of-detail (LOD) tokens (scales to higher counts)

Key files: `src/components/BattleView.tsx` (`BattleChip`, `FloatingLabel`,
`FacingNub`, `MovingChevron`, the token `.map`).

Above a threshold (many entities or zoomed-out), render a bare dot and drop the
floating name/HP/cast labels and facing/moving chevrons, which is where most of
the 7–14 DOM nodes per token live. Optionally cap the total number of rendered
tokens. Add a frame-rate cap (e.g. 30fps) on the interpolation for large battles
or low-end devices — a trivial guard in `useSmoothScene`'s loop.

## Phase 3 — Cheap engine wins

Key files: `src/engine/engine.ts` (`advanceRound`, `takeTurn`), `src/engine/spatial.ts`
(`visibleEnemiesOf`), `src/engine/spatialhash.ts`.

Cache `visibleEnemiesOf` per unit per turn so a unit's multiple tactic evaluations
reuse one vision scan instead of recomputing it 3–5×. Keep the spatial hash alive
across between-round spawns (currently rebuilt/cleared each round, so open-world
spawns fall back to brute O(N)), and route the O(N²) minion lock-clear and the
O(Z·N) zone-membership scans through the hash. These are pure optimizations that
must leave replay byte-identical (verify the engine suite is unchanged).

## Phase 4 — Architecture (the real ceiling)

Key files: `src/engine/snapshot.ts` (BSNAP tokens), `src/stores/useGameStore.ts`
(`advanceBattles`, tick loop), `BACKLOG.md`.

Run the sim in a **Web Worker** — the BSNAP snapshot tokens already make a battle
worker-portable — so all engine compute moves off the main thread and can't jank
rendering. As a lighter alternative, throttle the *watched* battle's sim rate when
entity count is high (off-screen battles are already rate-extrapolated, not
full-simmed). This is the highest ceiling but the most work; only reach for it if
Phases 1–3 aren't enough.

## Validation

After each phase: `npm run ci` (tsc + the full vitest suite, currently 524 tests)
must stay green, and engine changes (Phase 3) must keep snapshot replays
byte-identical. Sanity-check on a real large open-world battle (e.g. a deployed
party at a dense `openWorld` location) that motion stays smooth and the round
counter, follow camera, and minimap still behave.
