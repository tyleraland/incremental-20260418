# Codemap

A **deterministic** static analyzer + visualizer for this codebase. No LLM, no
runtime services: it parses the TypeScript project at build time and emits a
single `graph.json`, which a static viewer renders on GitHub Pages. Same source
in → same graph out (apart from the git hash / timestamp it stamps).

Deployed alongside the game at **`/incremental-20260418/codemap/`** (and under
each PR preview at `…/pr-preview/pr-<N>/codemap/`).

> Isolated by design: this tool has its **own `package.json`** (ts-morph,
> cytoscape). None of its dependencies enter the game's bundle or `npm run ci`.

## Run it locally

```sh
cd tools/codemap
npm install          # first time (ts-morph + cytoscape, tool-local)
npm run build        # parses ../../src → dist/graph.json + viewer + cytoscape.min.js
npx serve dist       # or any static server, then open the printed URL
```

`npm run analyze` is the same as `build`. Re-run it whenever the code changes;
CI re-runs it on every deploy so the hosted map is never stale.

## The three layers it extracts

1. **Structure** — every module: its layer/role (by directory), LOC, exports,
   and the import edges between modules (static *and* dynamic `import()`, via the
   `@/` alias). **Dead modules** (no non-test importer) and **import cycles**
   (Tarjan SCC) fall out for free.
2. **Content** — `*_REGISTRY` / `*_KIT` object literals counted as data
   (43 traits, 36 skills, 31 monsters, …), so the map separates code from content.
3. **Features** — the semantic layer. A *hybrid*:
   - **Inferred** from the project's own convention: a spec named
     `engine/barriers.test.ts` tests `engine/barriers.ts`, so each engine/lib
     spec is mapped to the source module sharing its basename. First-match
     claiming (manifest order) partitions specs across features.
   - **Authored** in [`features.json`](./features.json): names + one-line
     descriptions, plus `entries` (module paths/globs) for code with no
     same-named spec (save codecs, the proto shell, pages) or to override.

   Feature → feature edges are **real imports between owned modules** — a
   directed "feature A depends on feature B" graph. Modules owned by no feature
   (cross-cutting hubs like the store, or coverage gaps) are surfaced, not hidden.

### Why name-correspondence and not import closure?

The combat engine is tested as a black box — every engine spec imports only the
`@/engine` barrel — so a transitive import closure spans the *whole* engine and
can't tell consumables from fireball. The naming convention is the honest,
discriminating signal. See the comment block in `analyze.mjs`.

## Maintaining the feature map

When you add a feature, add an entry to `features.json` (a name, a description,
and either a `tests` glob or `entries`). If you add a spec that no feature
claims, it shows up under an auto **"Unmapped: \<area\>"** node — that's the
prompt to map it. Nothing is silently dropped.

## Files

| File | Role |
|---|---|
| `analyze.mjs` | the extractor — parses `../../src`, writes `dist/` |
| `features.json` | authored half of the feature layer (names, descriptions, assignments) |
| `viewer/` | static viewer (`index.html` + `app.js` + `style.css`), copied into `dist/` |
