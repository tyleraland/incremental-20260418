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
| `props.ts` | prop assets AS DATA: `PropDef`/`PropPath`, `cutout()`, the `TERRAIN_PROPS` registry (per-biome scatter decor) |
| `terrain.tsx` | the renderer: per-location terrain model + baked data-URI emitter, `propMarkup()` (the one PropDef→svg translation); §mapgen spec consumption (surface washes, scatter-plane props, material-aware collision paint) |
| `appearance.ts` | entity → visual resolver (glyph/tone/bodyShape/weapon/biome) — the ONLY id→visual translation |
| `skins.tsx` | token bodies (`TokenBodyProps` contract), `ARENA_SKINS` (grounds/terrain/heroLight/vignette), `FX_SKINS` |

## Adding a scatter prop (the common case)

A prop is 1–3 flat paths in a **±1 unit box, y down**, sized so the silhouette
fills roughly ±0.5–0.9. Three ways to make one, cheapest first:

1. **Workshop (start here):** run `npm run dev`, open `?workshop=1`. Click an
   existing prop as a starting point, edit the JSON, and watch it live on every
   biome ground, at every LOD size, and scattered with the game's real jitter.
   Validation names any rule violation as you type. When it reads well, "copy
   TS snippet" → paste into `TERRAIN_PROPS` in `props.ts`.
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

**Variants are free.** Each archetype in `TERRAIN_PROPS` is automatically
multiplied into seeded siblings (`variants()` in `props.ts`, riding
`wonkPathD` in `authoring.ts`) — author ONE good silhouette and the registry
grows by three. The re-cut keeps the command skeleton, roles, and the cutout
pair's sync (pinned by `Props.test.ts`). Props with fine registered detail
(the skull's eye sockets) set a gentler per-archetype `wonk:` amplitude.

## Adding a body, weapon, or biome

- **Monster silhouette / class weapon:** add the part stack in `skins.tsx`
  (`PAPER_BODIES` / `WEAPON_SHAPES`, palette roles only — see the runbook
  below), then map ids in `appearance.ts` (`MONSTER_SHAPE` / `CLASS_WEAPON`).
  Skins switch on `bodyShape`/`weapon` — never on entity ids.
- **Biome:** extend `Biome` + `biomeForLocation` in `appearance.ts`, add a
  ground tile in `skins.tsx`, mottle shades in `terrain.tsx`
  (`MOTTLE_SHADES`), and a prop set in `props.ts`.
- **Whole new skin:** a new `TOKEN_SKINS` body + `ARENA_SKINS`/`FX_SKINS`
  entries. Read the contract comment atop `skins.tsx` first (memo'd bodies,
  quantized props, lean element counts).

### Monster-body runbook (reference sprite → layered cutout)

A creature is an ordered **stack of parts** in `PAPER_BODIES[shape]`, drawn
back-to-front (`skins.tsx`). Each part is either a `plate` (a full two-tone
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
4. Stay lean — **a handful of flat paths per token** (a `plate` is 2–3 paths, an
   `accent` is 1) — because every element multiplies across 50+ gliding tokens
   and the memo only holds if the body receives primitives (no live engine
   objects, no per-token gradients). Dropping the monster text label pays for a
   couple of extra parts (measured net-flat on `skin-ab`).
5. Iterate in a scratchpad Playwright preview (a rotation grid, idle vs moving;
   inject CSS to hide `[data-skin="paper"] > span` so labels don't cover the
   silhouette), then verify with `?gallery=1` / `npm run gallery-shot` for the
   whole-language read and `npm run skin-ab` for the fps delta before you commit.

## Perf contracts (why the weird constraints)

- **Token bodies are `memo`'d** and receive only primitives — quantized
  facing/dims, no live engine objects, no hp-bearing strings. Pinned by
  `BODY_RENDER_PROBE` + `Skins.test.tsx`.
- **Terrain ships as ONE data-URI background image**, never live SVG DOM —
  static elements inside the per-round-animated ground layer still join every
  style/layout pass (measured ~9 fps on `?perf`). Pinned by `Terrain.test.tsx`.
- **Quantize relative to the element.** A viewport-sized element needs coarse
  steps (the hero light uses 8-cqmin); token-sized ones use eighth-cqmin.
- Verify any visual change with `npm run skin-ab` (median-of-windows fps A/B
  on the deterministic `?perf` scene; read gaps, not absolutes) and
  `skin-trace.spec.ts` for attribution.

## Tests that gate this directory

- `Palette.test.tsx` — palette contract: roles only, no filters/gradients, in
  data AND emitted svg AND rendered bodies.
- `Terrain.test.tsx` — terrain determinism (no `Math.random`), scatter
  keep-clear, blob merging, baked single-div delivery, build memo.
- `Skins.test.tsx` — token body memo contract + skin swap.
