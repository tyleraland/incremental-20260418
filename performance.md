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

**Done (the non-controversial, zero-pixel-change subset):** `LiveBattle` now
memoizes its round-scoped derivations behind `useMemo([battle])` — one pass
buckets the round's events by type (instead of six `.filter()`s) and tallies
alive/party/counts — so they no longer recompute on the 60fps motion renders, and
the per-token `classFor` / per-event `byId` `.find()` scans became O(1) Map
lookups (they were an O(N²) scan each frame). `castLabelGroups` is memoized on
`[castLabels]`.

**Remaining (the headline ~95% win, deferred — needs browser QA):** stop the rAF
loop from `setFrame`-re-rendering the whole subtree; instead write the
interpolated token `transform` and the camera/world pan straight to DOM nodes via
refs, so React only re-renders on real rounds (~2.5/sec). This restructures the
coordinate system (camera baked per-element today), so it can regress FX anchoring
if shipped blind — verify motion/FX/minimap in a real large open-world battle.
`React.memo` on `BattleChip` only pays off once this lands (today `cam`/`pos`
change every frame and defeat it).

## Phase 2 — Level-of-detail (LOD) tokens (scales to higher counts)

Key files: `src/components/BattleView.tsx` (`BattleChip`, `FloatingLabel`,
`FacingNub`, `MovingChevron`, the token `.map`).

**Done:** `BattleChip` takes a `detail` flag that drops the floating name/HP/cast
plate and the facing/moving nubs (most of the 7–14 DOM nodes per token), rendering
just the circle, when the view is **either** zoomed out past `LOD_CAM_SIZE` (18
cells — tokens too small to read) **or** packed with more than `LOD_TOKEN_COUNT`
(16) on-screen tokens (a harpy swarm around a tight party view — dense even though
the zoom is fine). Full detail returns when you zoom/follow in or the crowd thins.
Encounters (static 15-cell camera, small party) are always full detail.
(`Lod.test.tsx` covers both triggers.)

**Still available if needed:** cap the total number of rendered tokens, and a
frame-rate cap (e.g. 30fps) on the interpolation for very large battles or
low-end devices — a trivial guard in `useSmoothScene`'s loop.

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

After each phase: `npm run ci` (tsc + the full vitest suite) must stay green, and
engine changes (Phase 3) must keep snapshot replays byte-identical. The battle
view's FX paths (attack lines, spawn/aggro/rally floats, tactic labels) are
covered by `src/__tests__/ui/BattleFx.test.tsx`.

For the things jsdom can't measure — actual frame rate and visual equivalence —
use the Playwright harness in `e2e/` (`npm run e2e:install` then `npm run e2e`).
It drives the dev-only `?perf` seed (`src/dev/perfSeed.ts`) into a ~37-entity
Harpy Roost battle and reports sustained fps, long-task time, and a screenshot,
on both a mobile (Pixel 5) and desktop profile. Run it **before/after** the
deferred Phase 1 motion-decouple to confirm the fps jump and an unchanged
screenshot; you can also just open `http://localhost:5173/?perf=1` to profile in
DevTools by hand.
