# Paper asset authoring guide (`src/render/`)

How to add visual assets (props, bodies, terrain looks) to the paper language —
written so that producing a decent asset requires following rules, not taste.
The rules are enforced mechanically (tests + tooling), so if it builds and the
contract test passes, it fits the style.

## The four rules of the language

Polish comes from consistency, not path complexity:

1. **One palette.** Every fill/stroke is a named ROLE from `palette.ts`
   (`PAPER_PALETTE`, tokens: `PAPER_TONE`) — never a hex at the point of use.
   Need a new color? Add a role (semantic name, opaque hex; translucency via
   `opacity`/`fill-opacity` at the use site). `Palette.test.tsx` fails CI on
   rogue paints.
2. **One light direction.** Depth = the two-tone cutout: a dark base path plus
   the SAME path nudged up-left ("lit"). Never hand-place the offset — mark the
   top copy `lit: true` (props) or use `cutout(d, baseRole, litRole)` from
   `props.ts`; the renderer applies the standard nudge.
3. **Deterministic wonk.** Anything irregular (jitter, scatter, blobs) comes
   from the seeded helpers in `authoring.ts` (`wonk`, `blobPath`, `scatter`,
   `roughCircle`, `hash01`, `hashString`) — NEVER `Math.random`. Replays,
   revisits, and screenshots must be byte-stable.
4. **Flat only.** No CSS/SVG filters, no gradients, no blurs — shadows are
   offset flat shapes, "3D" is the two-tone. This is the look AND the perf
   model (extra compositing per element × 50 tokens). Also enforced by
   `Palette.test.tsx`.

## Module map

| file | what lives there |
|---|---|
| `palette.ts` | the color vocabulary: `PAPER_TONE` (token tones) + `PAPER_PALETTE` (~20 material roles) |
| `authoring.ts` | seeded geometry: `wonk` / `blobPath` / `polyPath` / `rectOutline` / `roughCircle` / `scatter` / `hash01` / `hashString` |
| `props.ts` | prop assets AS DATA: `PropDef`/`PropPath`, `cutout()`, the `TERRAIN_PROPS` registry (per-biome scatter decor). Each prop SELF-DECLARES its mapgen `kinds` (which `ScatterKind`s place it) + `playerSelectable`/`tags` via `PROP_META` — stamped onto the def and its variants |
| `assets.ts` | the discoverable asset CATALOG: `listAssets()` enumerates every prop/monster-body/weapon/building/ground as `AssetDescriptor{category,id,kinds,playerSelectable,tags,…}`. One source for the dev asset gallery + a future player cosmetic picker — add an asset in its home module and it appears here |
| `bodyTypes.ts` | the `BodyPart` authoring contract shared by every paper body asset |
| `bodies/*` | one file per paper body (`centipede.ts`, `thief-bug.ts`, …) plus `bodies/index.ts` assembling `PAPER_BODIES`; this is the token-efficient entry point for monster-body authoring |
| `rigs/*` | experimental template/joint/pose pipeline behind `?riglab=1`; read `rigs/README.md` before changing its producer contract. It does not replace the battle renderer yet |
| `paperRig/*` | workbench `paper-rig/1` import/compiler experiment behind `?rigperf=1`: eight 60° horse headings, static inline-SVG detail/far output, density probe; read `paperRig/README.md` |
| `inked.ts` | the "inked toolkit" — a flat-fill port of the top-down battlemap kit: `ink()` (fill+stroke in one path), `masonryBand()` (running-bond stone), `roofSlope()` (weathered tile field), `mossClump()`, `cobble()`. Surfaces are MANY small individually-inked jittered pieces picked from `INK_POOLS` (palette.ts) — no gradients/filters, all seeded, all baked into the terrain image |
| `buildings.ts` | the CITY tile catalog (inked top-down, styled after Prontera): `BUILDING_LOOKS` keyed off `BarrierMaterial` — `wood` red-tile townhouse, `cut-stone` slate-tile hall, `rubble` roofless ruin — + `buildingMarkup()` emitting a masonry wall RING around a weathered roof-TILE field split by a ridge (moss, doors, windows, silhouette ink), via `inked.ts`. Procgen plugs in by tagging a rect's material; switches on material, never ids |
| `terrain.tsx` | the renderer: per-location terrain model + the `terrainSvg()` emitter, `propMarkup()` (the one PropDef→svg translation), `fountainMarkup()`; §mapgen spec consumption (surface washes incl. city dirt/grass + inked cobblestone paving, scatter-plane props, material-aware collision paint — BUILT-material walls become `buildings.ts` structures, natural walls stay organic blobs). `PaperTerrain` **rasterizes the SVG to a `<canvas>` bitmap once** (`TERRAIN_RES`, async decode) so pan/zoom are GPU-composited, not re-rasterized |
| `appearance.ts` | entity → visual resolver (glyph/tone/bodyShape/weapon/biome) — the ONLY id→visual translation |
| `skins.tsx` | token body renderers (`TokenBodyProps` contract), body LOD/KO merging, `ARENA_SKINS` (grounds/terrain/heroLight/vignette), `FX_SKINS` |

## Adding a scatter prop (the common case)

A prop is 1–3 flat paths in a **±1 unit box, y down**, sized so the silhouette
fills roughly ±0.5–0.9. Three ways to make one, cheapest first:

1. **Workshop (start here):** run `npm run dev`, open `?workshop=1`. Click an
   existing prop as a starting point, edit the JSON, and watch it live on every
   biome ground, at every LOD size, and scattered with the game's real jitter.
   Validation names any rule violation as you type (incl. bad `kinds`), and the
   valid banner surfaces the prop's `kinds` / ★player-selectable. When it reads
   well, "copy TS snippet" → paste into `TERRAIN_PROPS` in `props.ts`. The
   **Asset catalog** panel below lists EVERY asset (`listAssets()`): browse by
   category, ✎ to edit a prop, multi-select across categories → "copy names"
   dumps the `category:id`s for bulk feedback.
2. **Draw in a real editor:** draw flat shapes in Inkscape/Figma (any colors,
   any transforms), export SVG, then
   `npm run import-svg -- art.svg --id my-prop`. The script flattens
   transforms, fits + quantizes into the unit box, snaps every color to the
   nearest palette role (with a report), and REJECTS gradients/filters/masks.
   Paste the emitted snippet; fine-tune in the workshop.
3. **By hand in `props.ts`:** write the paths directly; use `cutout()` for the
   two-tone pair.

Then: run `npm run test -- Palette` (contract) and eyeball `?gallery=1` /
`npm run gallery-shot` — one screenshot reviews the whole language, which is
also what a PR reviewer looks at.

Prop placement (density, rotation/flip/scale jitter, keep-clear from barriers
and portals) is the terrain builder's job — a new prop entry inherits all of it.

**Tag the prop's `kinds` in `PROP_META` (`props.ts`) or it goes DARK on generated
maps.** Spec-driven maps place scatter by mapgen `ScatterKind` (tree/bush/rock/
stump/flower/reed); the placer spreads a kind across ALL props tagged with it. A
prop with no matching kind is only reachable on legacy hand-authored locations —
so a new city/field prop MUST list ≥1 kind the recipe emits (the city emits
tree/bush/rock/stump/flower, never `reed`). Reachability is pinned by
`AssetCatalog.test.ts`. Decor-ring-only assets (`lamppost`/`banner`, placed by
the plaza landmark ring) intentionally carry empty `kinds`.

**Tag the prop's PLACEMENT so it belongs with the others (strongly encouraged).**
Beyond `kinds`, `PROP_META` carries a declarative placement schema the render's
scatter pick READS today (weighted + theme-filtered + rotation-aware — a rare
signature canopy no longer draws as often as filler grass, a desert `tree` cell
won't pull an oak, and radially-symmetric rocks free-spin while trees keep a
small upright wobble) and mapgen's clustering/edge/path passes will read LATER
(phases 2–4). The fields (all optional; see `PropDef` in `props.ts`):
`weight` (frequency within a kind, signature low / filler high) · `themes`
(`ThemeTag[]` biomes it belongs to; undefined = universal) · `role`
(`field`/`cluster`/`edge`/`understory`/`accent`) · `near`/`avoid`
(`Affinity[]` adjacency hints) · `rotate` (`upright`/`free`/`flat`) ·
`clusterWith` (companion prop ids for groves/beds). One-line example:

```ts
canopy: { kinds: ['tree'], weight: 0.2, themes: ['forest','plains'],
          role: 'cluster', rotate: 'upright', clusterWith: ['fern','leaves','mushroom'] },
```

An UNTAGGED prop defaults to universal / `field` / `weight: 1` / `upright` — it
still places, but leaving it untagged makes generation dumber (it never clumps,
never prefers a theme, and competes evenly with signature props). The
`AssetCatalog.test.ts` gate requires every scatterable prop to declare a `role`
and a non-empty `themes`; the `?workshop=1` catalog surfaces all placement tags
and the "copy TS snippet" emits them.

**Variants are free.** Each archetype in `TERRAIN_PROPS` is automatically
multiplied into seeded siblings (`variants()` in `props.ts`, riding
`wonkPathD` in `authoring.ts`) — author ONE good silhouette and the registry
grows by three. The re-cut keeps the command skeleton, roles, and the cutout
pair's sync (pinned by `Props.test.ts`). Props with fine registered detail
(the skull's eye sockets) set a gentler per-archetype `wonk:` amplitude.

## Adding a body, weapon, or biome

- **Monster silhouette / class weapon:** add a body part stack in
  `render/bodies/<shape>.ts`, register it in `render/bodies/index.ts`, then
  register the shape in `appearance.ts` (`BodyShape` + `BODY_SHAPES`) and map
  monster ids in `MONSTER_SHAPE`. Class weapons still live in `skins.tsx`
  (`WEAPON_SHAPES`) and map via `CLASS_WEAPON`. Skins switch on
  `bodyShape`/`weapon` — never on entity ids. `Bodies.test.ts` mechanically
  enforces the body contract (winding, budgets, paints) — if it passes, the body
  composes correctly at every LOD.
- **Biome:** extend `Biome` + `biomeForLocation` in `appearance.ts`, add a
  ground tile in `skins.tsx`, mottle shades in `terrain.tsx`
  (`MOTTLE_SHADES`), and a prop set in `props.ts`.
- **City building material / ground:** add a `BUILDING_LOOKS` entry in
  `buildings.ts` (roof lit/shade + wall + texture; `roofed:false` = a ruin) and,
  if it's a walkable surface, a wash + optional paving texture in `terrain.tsx`'s
  city `bands`/paving block. Both key off the mapgen `BarrierMaterial`/
  `SurfaceMaterial` vocab — a procgen city recipe that emits the material gets the
  look for free. Review in `?gallery=1` → "city tile catalog".
- **Whole new skin:** a new `TOKEN_SKINS` body + `ARENA_SKINS`/`FX_SKINS`
  entries. Read the contract comment atop `skins.tsx` first (memo'd bodies,
  quantized props, lean element counts).

## Inked top-down maps (the Prontera style — apply it to more maps)

The city look we landed on is a **flat-fill port of an external top-down
battlemap kit** (checked in at `reference/inked-topdown-battlemap-kit/` — its
`style_spec/*.json` is the source of truth for the look; the `generators/*.py`
are worked examples; the `assets/preview/*.png` are the target). We keep the
kit's *technique* — surfaces built from MANY small, individually-INKED, jittered
pieces so texture reads from piece-to-piece value variation — but adapt it to
our two hard rules: the kit fakes light with gradient overlays + gaussian-blur
shadows; **we use flat pool value-splits + flat offset shadows instead** (no
gradients/filters — Palette.test), and **seed every piece** (deterministic bake).

The pipeline, all in `src/render/`:

```
mapgen spec ─▶ terrain.tsx buildTerrainModel()   (reads collision materials,
   │              surface plane, scatter plane, landmark POI)
   ├─ BUILT walls (cut-stone/wood/rubble) ─▶ buildings.ts buildingMarkup()
   ├─ paved cells (road/stone-floor)      ─▶ inked.ts cobble() clusters
   ├─ landmark POI                        ─▶ terrain.tsx fountainMarkup()
   └─ everything ─▶ terrainSvg() ─▶ PaperTerrain rasterizes to a <canvas> bitmap
```

`inked.ts` holds the shared emitters (`ink`, `masonryBand`, `roofSlope`,
`mossClump`, `cobble`) and `palette.ts` holds `INK_POOLS` (the per-material value
pools). Everything switches on the mapgen **material/kind**, never a location id.

**To make another city:** nothing in `src/render/` changes. Add a location with
`mapGen: { recipe: 'city', seed }` + an `openWorldSize` big enough to read as a
town (Prontera is 50; see `src/data/locations.ts`). The recipe emits
`cut-stone`/`wood` buildings, `road`/`stone-floor` paving, and a `landmark` POI,
which the terrain renderer already draws inked. Then hand-place any NPCs on the
plaza (`src/data/npcs.ts`) — merchant/questgiver placement isn't spec-driven yet.

**To extend the inked look to a NEW recipe/biome** (a field, a dungeon):

1. Pick the mapgen **materials** that should read inked (a dungeon's `cut-stone`
   walls → `masonryBand`; `deep-water` → inked ripples; `rubble` → the ruin).
2. Add the emitter to `inked.ts` (a few small jittered pieces from a new
   `INK_POOLS` entry) and any new roles to `palette.ts`.
3. Wire it in `terrain.tsx`: branch in `buildTerrainModel` on the material/kind
   (mirror how BUILT-material walls split off from natural walls), emit in
   `terrainSvg`.
4. Keep the total piece count **bounded** — the whole map bakes into one SVG
   that's rasterized once, and the decode scales with path count (Prontera is
   ~3k paths / ~1.3MB; that's about the ceiling for a snappy transition).
5. Review the in-situ bake in `?gallery=1` → "city tile catalog" (add a panel
   for a new recipe), and screenshot a live location.

**Hard-won rules for baked map layers** (each cost real debug time — heed them):
- **The raster cost is PATH COUNT (SVG parse), not pixel res.** Bumping
  `TERRAIN_RES` for crispness is nearly free on the transition; adding thousands
  of paths is not. Don't lower res to speed a slow load — bound path count and
  prewarm instead.
- **A viewBox-only SVG has NO intrinsic size:** `<img>` rasterizes it at the
  default 300×150 and `drawImage` upscales that → blurry regardless of `res`.
  Always stamp `width`/`height=res` on the `<svg>` root before decoding.
- **Prewarm + cache any new baked raster** (see `prewarmTerrain`/`TERRAIN_BITMAPS`
  in `terrain.tsx`, prewarmed at boot in `App.tsx` and on the detail panel). The
  first cold decode is the ONLY slow moment; get it off the transition.
- **Reveal the whole field ATOMICALLY, never per-layer, never with a fade.** A
  240ms fade on the terrain while the tokens are instantly solid reads as "tokens
  first, map an instant later." Gate terrain + ground + grid + tokens on one
  readiness flag (`fieldReveal` in BattleView) and flip it pre-paint
  (`useLayoutEffect`) so a cache hit lands everything on the first frame.

**New building material** = a `BUILDING_LOOKS` entry (roof pool + ink, `roofed`).
**New paved/ground material** = a wash band + `cobble`/texture pass in the city
block of `buildTerrainModel`. Both are pure data keyed off the mapgen vocab, so a
procgen recipe that emits the material inherits the look for free.

### Monster-body runbook (reference sprite → layered cutout)

A creature is an ordered **stack of parts** in `render/bodies/<shape>.ts`, drawn
back-to-front by `skins.tsx`. Each part is either a `plate` (a full two-tone
cutout — dark base+outline + a lit copy nudged up-left; `shadow: true` casts a
flat drop shadow onto the parts below) or an `accent` (ONE flat fill — eyes,
teeth, a nose, a shell spiral — `fill` is a tone field `base`/`top`/`outline`/
`text` or a palette role, `stroke: true` outlines it). Five rules:

1. Redraw the reference as a **top-down** silhouette facing **+x** (nose right)
   in the 100×100 box, decomposed into the few parts that carry the read (the
   wolf: tail plume · torso · spiky mane ruff · eared head · nose), and map its
   id in `MONSTER_SHAPE` — the shape carries heading, so no side views and no id
   checks anywhere downstream. Monsters are **silhouette-only** (no text label),
   so the parts must do all the identifying.
2. Paint only with palette **roles**/tone fields (no hex, no filters, no
   gradients — `Palette.test.tsx` enforces it); give each `plate` a lit-scale
   origin `c` at its own centre; reach for `accent` parts (a face, teeth) only
   when the plates alone don't read.
3. Set a small `lean` (±4–8 units) on whichever parts should lead or lag in
   motion (head leads, tail lags), then trust the renderer — it casts the
   `shadow` plates' flat drop shadow, keeps the lit nudge up-left in screen
   space, rotates the whole token to facing, and concats the `plate`s for the KO
   crumple (accents drop). For a melee reaction, tag parts `atk: 'jab'` (heads —
   snaps toward the target) / `'trail'` (tails — lags back): the renderer emits
   `data-atk` on the part (free on plates, one wrapper `<g>` on an accent) and
   BattleView drives it with a CSS descendant animation on the chip wrapper
   (`--atk-x/y` user units) — so it stays OFF the memo'd body, and a struck token
   also recoils (`animate-hit-*`). All LOD-gated; keep `atk` parts few (each
   promotes a compositor layer during its 0.3s — ~0.8 fps on a 20-token pit).
   For a resting idle, tag parts `idle: 'breathe'` (the torso/abdomen swells
   through three poses: rest → inhale → exhale undershoot) / `'sway'` (antennae/
   fronds drift a few degrees): the same `data-idle` seam, run by `animate-idle`
   only while the token is at detail LOD, alive, still and not casting, with
   per-token phase/tempo seeded off the unit id so a nest never pulses in
   lockstep. It's a CONTINUOUS animation (a promoted compositor layer for the
   token's whole resting life) — keep idle parts to 1–3 and never un-gate it.
4. Stay lean — **a handful of flat paths per token** (a `plate` is 2–3 paths, an
   `accent` is 1) — because every element multiplies across 50+ gliding tokens
   and the memo only holds if the body receives primitives (no live engine
   objects, no per-token gradients). Dropping the monster text label pays for a
   couple of extra parts (measured net-flat on `skin-ab`). **Pack repeated thin
   features into ONE multi-subpath accent** (`M…Z M…Z`): the thief bug's six
   legs are two tripod-gait paths, its antenna pair one scissoring sway part —
   budgets and compositor layers count PARTS, not subpaths.
   **The contract is enforced, not prose** (`Bodies.test.ts` — run
   `npx vitest run Bodies` first when a body misbehaves): every plate winds the
   SAME direction (a counter-wound plate punches a hole in the far-LOD merge /
   KO crumple — invisible until zoomed out; flip a path by reversing its point
   order), ≤14 parts, ≤3 `idle` parts, `walk` phases in 1/2 pairs, absolute
   M/L/C/Q/A commands only, fills must be real tone fields/palette roles.
   Two visibility gotchas the contract can't see: a THIN feature filled
   `'outline'` (near-black) vanishes against the dark arena — use
   `fill: 'base', stroke: true` like legs; and anything inside x≈92 hides
   under the body silhouette (weapon-tip rule above).
5. Iterate against the **body sheet** (`?bodyshot=<shape>`, screenshot via
   `SHAPE=<shape> npm run body-shot`): one image renders the creature's full
   state machine as deterministic stills — the real index.css keyframes frozen
   at authored phases (3 idle breathe/sway poses, attack wind/strike/recover,
   hit recoil, walk gait) plus the facing wheel, scale ladder, far-LOD merge and
   KO crumple. Then verify with `?gallery=1` / `npm run gallery-shot` for the
   whole-language read and `npm run skin-ab` for the fps delta before you commit.

## Preferred monster style (what we've converged on — keep new creatures here)

The point of the layered system is that every monster reads as *one family* even
though nobody hand-tunes them together. New models stay cohesive by matching
these, not by taste:

- **Silhouette first, one signature.** Redraw the reference top-down (nose +x)
  and find the ONE shape that identifies it, then give it exactly one memorable
  accent — wolf = a spiky mane ruff; snake = a bulbous head + forked tongue;
  harpy = a beaked head; slime = eyes. A distinctive outline + a single accent
  beats a detailed blob. Monsters carry NO text label, so the shape does it all.
- **Read at every scale.** The token is tiny and rotating in play. If it only
  works big-and-static it's wrong. Check the far-LOD *merged* silhouette (the
  gallery's "motion + LOD" row) — that 2-path collapse is what a dense mob draws.
- **Flat two-tone, palette roles, deterministic.** Base + up-left lit, no
  filters/gradients, no hex at use sites, no `Math.random`. (Enforced.)
- **Lean = life.** Set a static `lean` so the head leads and the tail/foot lags
  in motion — locomotion without an animation loop.
- **Attack = the body lunges, not the disc slides.** Melee creatures tag their
  head/face `atk: 'jab'` and tail `atk: 'trail'`; struck tokens recoil. Motion
  is CSS on the chip wrapper (`data-atk`), never a body re-render. Prefer a
  reaction that comes from the reference's *attack* frames (the snake strike, the
  wolf bite) over a generic wiggle. Keep animated parts to 2–3 (compositor cost).
- **Idle = the body breathes, from the reference's idle frames.** Tag the main
  torso/abdomen plate `idle: 'breathe'` and one trailing feature (antennae,
  fronds, a tail tip) `idle: 'sway'` so a resting creature reads alive instead
  of frozen (the thief bug: carapace swells, antennae drift). Same rules as atk:
  CSS on the wrapper (`data-idle`), 1–3 parts, LOD-gated by BattleChip — the
  far-LOD merge drops idle with the other accents.
- **Lean on the part count.** ~5–12 paths per token; a `plate` is 2–3, an
  `accent` is 1. If a detail doesn't survive the far-LOD collapse, it's probably
  not worth its node.

Cohesion checklist for a PR adding a monster: distinct family silhouette? one
signature accent? reads merged at far-LOD? head-leads/tail-lags `lean` set?
`jab`/`trail` tagged if it melees? `breathe`/`sway` idle tagged? palette roles
only? — all visible on one `SHAPE=<shape> npm run body-shot` plus the
whole-language `npm run gallery-shot`.

## Perf contracts (why the weird constraints)

- **Token bodies are `memo`'d** and receive only primitives — quantized
  facing/dims, no live engine objects, no hp-bearing strings. Pinned by
  `BODY_RENDER_PROBE` + `Skins.test.tsx`.
- **Terrain bakes to ONE image, never live SVG DOM** — static elements inside
  the per-round-animated ground layer still join every style/layout pass
  (measured ~9 fps on `?perf`). The inked city SVG grew to ~3k paths, so a
  *vector* background got re-rasterized every zoom/pan (slow) and its parse froze
  the map transition ~4s. `PaperTerrain` now draws the SVG to a fixed-res
  `<canvas>` **raster** once (async): pan/zoom composite the bitmap on the GPU
  (free), the decode is off the critical path (terrain fades in). Keep the source
  piece density BOUNDED — the one-time decode scales with path count. The bake
  stamps explicit `width`/`height=res` on the SVG root before decoding (a
  viewBox-only SVG has no intrinsic size, so `<img>` rasterizes it at the default
  300×150 and `drawImage` then UPSCALES that — a blurry bake regardless of `res`)
  and `res` scales with clamped `devicePixelRatio` so mobile retina (where the
  hero-scale upscale shows) is crisp. **The decoded canvas is cached**
  (`TERRAIN_BITMAPS`, LRU, keyed by terrain sig+res): `prewarmTerrain()` bakes it
  while the location's detail panel is up (`prewarmLocationTerrain` in BattleView
  → LocationDetail), so dropping in paints the map on the FIRST frame (a
  `useLayoutEffect` draws the cached bitmap pre-paint) instead of after the
  ~200ms+ parse — no blank arena. `ready` (surfaced via `onReady`, fired in a
  `useLayoutEffect`) gates the Arena's ENTIRE field — terrain + ground + grid +
  **tokens** (the pan div's `fieldReveal`) — so the whole scene appears
  atomically, never tokens-on-a-bare-surface-then-map. **No fade**: a 240ms
  opacity transition delayed the terrain behind the un-faded tokens (read as
  "tokens first, map an instant later"); the reveal is an instant opacity flip the
  moment the bitmap is drawn. A 4s safety timeout + a decode-failure reveal keep
  the field from ever staying hidden. Pinned by `Terrain.test.tsx`.
- **Quantize relative to the element.** A viewport-sized element needs coarse
  steps (the hero light uses 8-cqmin); token-sized ones use eighth-cqmin.
- Verify any visual change with `npm run skin-ab` (median-of-windows fps A/B
  on the deterministic `?perf` scene; read gaps, not absolutes) and
  `skin-trace.spec.ts` for attribution.

## Tests that gate this directory

- `Palette.test.tsx` — palette contract: roles only, no filters/gradients, in
  data AND emitted svg AND rendered bodies.
- `Bodies.test.ts` — body contract: plate winding consistency (the far-LOD
  merge/KO invariant), part/idle budgets, walk-phase pairing, path parse +
  bounds, paint names; PLUS the animation perf contract on `index.css` (every
  keyframe transform/opacity-only; `data-*` part rules only start animations).
- `Terrain.test.tsx` — terrain determinism (no `Math.random`), scatter
  keep-clear, blob merging, baked single-div delivery, build memo.
- `Skins.test.tsx` — token body memo contract + skin swap.
