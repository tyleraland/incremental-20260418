# e2e — battle perf & visual harness

Playwright specs that drive the **real browser render loop**, which the vitest
(jsdom) suite can't: they verify visual equivalence and measure actual frame
rate under load. Not part of `npm run ci`.

## Run it

```bash
npm install              # picks up @playwright/test (in devDependencies)
npm run e2e:install      # one-time: download the Chromium binary
npm run e2e              # starts vite, runs the specs (mobile + desktop)
```

`playwright.config.ts` auto-starts `npm run dev` (port 5173) and tests two
profiles — **`mobile-chrome` (Pixel 5)** and `desktop-chrome`. The mobile one is
the profile that matters for the "lag on mobile" concern.

## The perf seed

`?perf` is a **dev-only** query param (gated by `import.meta.env.DEV`, stripped
from production builds). On load, `src/dev/perfSeed.ts` deterministically:

- recruits ~12 heroes and fills their tactic slots,
- deploys them to **Harpy Roost** (the densest open-world field: 25×25, cap 25),
- ticks once to stand up the battle (25 harpies scattered), and
- drops into the battle view.

So `http://localhost:5173/?perf=1` always lands in the same ~37-entity stress
scene — open it manually to profile in DevTools, or let the spec drive it.

## What `perf.spec.ts` measures

- **Frame rate** — counts `requestAnimationFrame` frames over a 5s window
  (`fps`), the headline number for the open-world rAF re-render cost.
- **Long tasks** — sums `PerformanceObserver('longtask')` time/count (main-thread
  stalls = jank).
- **Arena DOM node count** — a proxy for per-token render weight.
- **Screenshot** — attached to the report for visual-diff review (a pure
  refactor like Phase 1's memoization should change nothing).

Metrics are logged and attached to the HTML report (`npx playwright show-report`).
The `fps > 20` assertion is a deliberately generous regression gate.

## Why it exists

This is the verification gate for the **deferred imperative motion-decouple**
(see `performance.md` Phase 1): run it before/after that change to confirm the
fps jumps and the screenshot is unchanged.
