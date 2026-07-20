# How this kit maps into the game

This folder is the **reference toolkit** for the game's top-down map art — the
source of truth for the "inked" visual language. It is not built or imported by
the app; it's here so future asset work can reuse the spec + generators (and so
the look can be regenerated / extended).

## What's here (and what's omitted)

- `style_spec/inked_topdown_style_spec.json` — the full generic style spec (v2).
- `generators/*.py` — worked examples (stdlib-only Python that emits SVG).
- `assets/preview/*.png` — flat previews of each example (the visual target).
- **Omitted:** `assets/svg/*` (the generators' large SVG *outputs*, ~3 MB) — they
  are regenerable and not worth versioning. Recreate any with, e.g.:
  ```bash
  cd generators && python3 gen_building.py     # -> building.svg
  ```

## How it was ported into `src/render/`

The game keeps the kit's **technique** (surfaces = many small, individually
inked, jittered pieces from a value pool) but adapts it to two hard rules the
paper language enforces (`src/render/CLAUDE.md`, `Palette.test.tsx`):

| kit does | we do instead | why |
|---|---|---|
| gradient light overlays + slope gradients | flat lit/shade **pool value-split** | no gradients allowed (flat = the look + perf) |
| gaussian-blur cast shadows | flat offset shadow shapes | no filters allowed |
| `random.*` per asset | seeded `hash01` per piece | deterministic bake (replays/screenshots) |
| ships an SVG | SVG **rasterized to a `<canvas>` bitmap** once | GPU-composited pan/zoom, no re-raster |

Port locations:

- `style_spec` primitives (`wrect`, `blob`, `P`) → `src/render/authoring.ts`
  (`wrectPath`, `blobPath`/`roughCircle`, `pick`) + `src/render/inked.ts`
  (`ink`, `masonryBand`, `roofSlope`, `mossClump`, `cobble`).
- `palette_tokens` / material pools → `src/render/palette.ts` (`INK_POOLS`).
- `asset_recipes.building` / `.fountain` → `src/render/buildings.ts`
  (`BUILDING_LOOKS` + `buildingMarkup`) and `terrain.tsx` (`fountainMarkup`).
- `cobblestone_ground` → the paving pass in `terrain.tsx` `buildTerrainModel`.

First live consumer: **`prontera-city`** (a `mapGen: {recipe:'city'}` location).
See `src/render/CLAUDE.md` → *Inked top-down maps* for how to apply the style to
another city or extend it to a new recipe/biome (dungeon, field).
