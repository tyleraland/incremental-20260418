# Codemap

A **deterministic** platform for looking at this codebase several ways. No LLM, no
runtime services: build-time extractors parse the repo and emit datasets, and a
static multi-lens viewer renders them on GitHub Pages. Same source in → same
datasets out (apart from the git hash / timestamp it stamps).

Deployed alongside the game at **`/incremental-20260418/codemap/`** (and under
each PR preview at `…/pr-preview/pr-<N>/codemap/`). It does **not** touch the
game build — it ships as a separate page under the same Pages site.

> Isolated by design: its deps (ts-morph, cytoscape) live in this folder's own
> `package.json` and never enter the game bundle or `npm run ci`.

## Run it locally

```sh
cd tools/codemap
npm install          # first time (ts-morph + cytoscape, tool-local)
npm run build        # parses ../../src + git → dist/data/*.json + viewer
npx serve dist       # any static server, then open the printed URL
```

## Architecture — a lens platform

```
analyze.mjs            orchestrator: runs each extractor, writes dist/data/*.json + manifest.json
extract/
  modules.mjs          import/feature graph (ts-morph)
  filesystem.mjs       tracked-file tree + size + blended "importance"
  git.mjs              commit history + per-file churn
features.json          authored half of the feature layer (names, descriptions, assignments)
viewer/
  app.js               shell: view registry, nav, dataset loading, cross-navigation
  lib.js               shared helpers (colors, formatting, detail panel, cytoscape mount)
  views/*.js           one file per lens
```

Each **lens** is a self-contained view module that declares the datasets it needs
and renders into the shared stage. The shell handles nav, lazy dataset loading,
the detail panel, and cross-navigation (`go(viewId, arg)` — e.g. click a churned
file in **Git** to focus it in **Modules**).

### Lenses today

| Lens | Dataset | What it shows |
|---|---|---|
| **Modules** | modules | import graph; layer color, √LOC size, hubs, dead code |
| **Features** | modules | directed feature-dependency graph (hybrid semantic layer) |
| **Files** | filesystem | nested treemap; area ∝ bytes, color by importance / type / churn |
| **Git** | git | commit calendar, authors, most-churned files, recent commits |
| **Inventory** | modules, filesystem | layers, file types, registries, features, dead code, cycles |
| **Coverage** | — | reserved slot (stub documents how to wire it) |
| **Complexity** | — | reserved slot (stub documents how to wire it) |

### Add a lens

1. Write `extract/<name>.mjs` exporting `extract<Name>({ REPO, modules, git })` that
   returns a **deterministic** dataset (no clock, no randomness).
2. Register it in `analyze.mjs` so it writes `data/<name>.json` and add it to the manifest headline if useful.
3. Add `viewer/views/<name>.js` (declare `needs: ['<name>']`, `kind: 'graph'|'html'`,
   implement `mount(ctx)`) and register it in `VIEWS` in `app.js`.

The **Coverage** and **Complexity** lenses are live stubs that print this recipe in
the UI — replace them when their extractors are wired (coverage from
`vitest --coverage`; complexity from the ts-morph AST already loaded in the
modules extractor). Heatmaps are just another `colorBy` mode on an existing lens.

## The feature layer (Modules / Features)

Hybrid, and the "new kind of dependency": a feature's modules come from the
project's own convention (`engine/barriers.test.ts` tests `engine/barriers.ts`)
plus authored `entries` in [`features.json`](./features.json) for code with no
same-named spec. Feature→feature edges are real imports between owned modules.
Why not import closure? The engine is tested as a black box through the
`@/engine` barrel, so a closure spans the whole engine and can't attribute
modules to features. See the comment block in `extract/modules.mjs`.

When you add a spec no feature claims, it surfaces under an **"Unmapped: \<area\>"**
node — the prompt to map it. Nothing is silently dropped.

## Determinism & isolation

Every extractor is a pure function of the repo state. The git lens needs history:
CI's deploy checks out with `fetch-depth: 0`, so the hosted view is richer than a
shallow local clone. The game's `tsc`/`vitest` never see this folder (`tsconfig`
`include` is `["src"]`); the deploy builds it separately into `dist/codemap/`.
