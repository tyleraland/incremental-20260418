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
| **Files** | filesystem | nested treemap; area ∝ bytes, color by importance / type / churn / **complexity** / **coverage** |
| **Heatmap** | filesystem, modules | expandable file tree with a heat cell per metric (size, LOC, CC, MI, line %, branch %, churn, smells, dead exports); folders bubble up their worst descendant; click a file to browse source + deps |
| **Explorer** | filesystem, git, modules | repo file browser — every doc (README/CLAUDE/AGENTS/*.md wherever it hides) + full tree; reads files (markdown rendered, code line-numbered) with each file's git **history** (versions) |
| **Timeline** | timeline | swimlane per feature — one dot per commit by date, colored by category; see WHEN each feature was developed |
| **Git** | git | commit calendar, authors, most-churned files, recent commits |
| **Complexity** | complexity, git, coverage | per-function cyclomatic / cognitive / nesting / size + **risk hotspots (complexity × churn)** |
| **Coverage** | coverage, complexity | per-file test coverage + **best test targets (complex × untested)** |
| **Inventory** | modules, filesystem | layers, file types, registries, features, dead code, cycles |

**Complexity** is pure AST (deterministic, no deps beyond ts-morph): cyclomatic
(exact), cognitive (SonarSource-style, approximate), max nesting, LOC, params, and
a per-file Maintainability Index. **Coverage** is a test-run artifact — it reads
`coverage/coverage-final.json` and is graceful when absent. Generate it with
`npm run coverage` (repo root; needs the `@vitest/coverage-v8` devDep), then re-run
`npm run codemap`; CI generates it on deploy so the hosted view always has it.
The payoff is cross-lens: **risk** (complex **and** high-churn) and **test targets**
(complex **and** low-coverage), plus `colorBy: complexity|coverage` on the treemap.

**Finding bugs / dead code.** The **Inventory** lens lists dead **modules** (no
importer), dead **exports** (exported names no other module imports — best-effort;
barrels/entries exempt, test usage counts), and **bug smells** (a deterministic
text scan: TODO/FIXME/HACK, `@ts-ignore`, `eslint-disable`, `: any`/`as any`,
empty `catch {}`, stray `console.log`). Those signals are also heat columns on the
**Heatmap**, and the risk/test-target tables point at complex-and-churny /
complex-and-untested code.

**Commit classification (Timeline).** `commit-tags.json` maps each commit (10-char
hash) → `{category, feature, tags}`. It was **backfilled once** by fanning the git
log out to Haiku subagents; the Timeline lens joins it with git dates. It's a
plain, hash-keyed, committed file — to keep it current, classify new commits and
merge them in (any commit not present shows in an `unclassified` lane, so gaps are
visible). A pre-push hook that classifies the outgoing commits and appends them is
the intended next step (needs an LLM call at hook time); for now it's a one-time
backfill + manual append.

**Raw source.** The build mirrors tracked text files into `dist/source/`, and the
viewer opens any file's code (line-numbered, with line-jump) on demand — from the
Modules/Files detail panels ("⟨⟩ view source") and from each function row in the
Complexity lens (jumps to `file:line`). Fetched per-file, never bundled into a dataset.

### Add a lens

1. Write `extract/<name>.mjs` exporting `extract<Name>({ REPO, modules, git, complexity, coverage })`
   that returns a **deterministic** dataset (no clock, no randomness).
2. Register it in `analyze.mjs` so it writes `data/<name>.json` and add it to the manifest headline if useful.
3. Add `viewer/views/<name>.js` (declare `needs: ['<name>']`, `kind: 'graph'|'html'`,
   implement `mount(ctx)`) and register it in `VIEWS` in `app.js`.

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
