# Inked Top-Down Medieval Battlemap Kit

A small procedural-art system for making **overhead battlemap assets** in a
consistent hand-inked style: every shape carries a wobbly dark outline, surfaces
are built from hundreds of individually-drawn jittered pieces, everything is
weathered, and one upper-right sun casts soft shadows to the lower-left.

Everything here is deterministic — each asset is seeded, so the same script
always produces the same SVG and any asset can be regenerated or tweaked.

---

## What's inside

```
inked-topdown-battlemap-kit/
├── README.md                         ← you are here
├── style_spec/
│   └── inked_topdown_style_spec.json ← the full generic style spec (v2)
├── generators/
│   ├── gen_building.py               ← terracotta-roofed house      (seed 7)
│   ├── gen_fountain.py               ← tiered city-square fountain   (seed 14)
│   ├── gen_stall.py                  ← striped-awning market stall   (seed 23)
│   ├── gen_dungeon.py                ← walled room + 3 doors         (seed 31)
│   ├── gen_forest.py                 ← dense forest + clearing       (seed 42)
│   └── gen_forest_path.py            ← dense forest + winding path   (seed 45)
└── assets/
    ├── svg/                          ← the generated .svg files
    └── preview/                      ← flat .png previews of each
```

The **style spec** is the source of truth for the look; the **generators** are
worked examples that implement it. Read one generator alongside the spec and the
whole system is legible.

---

## Requirements

- **Python 3.8+** — the generators use only the standard library (`random`,
  `math`) to emit SVG. No dependencies needed to make the SVGs.
- **(optional) rendering to PNG** — to rasterise the SVGs:
  ```bash
  pip install cairosvg
  ```
  Any SVG viewer/browser also opens the `.svg` files directly.

---

## Quick start

Generate an asset (writes an `.svg` next to the script):

```bash
cd generators
python3 gen_building.py        # -> building.svg
python3 gen_forest_path.py     # -> forest_path.svg
```

Rasterise to PNG (optional):

```bash
python3 -c "import cairosvg; cairosvg.svg2png(url='building.svg', write_to='building.png')"
```

Change the look: open any generator and edit the `SEED = …` line near the top —
a new seed reshuffles every jittered piece deterministically. Swap a roof from
terracotta to slate by pointing the tile colors at `roof_slate_pool` /
`roof_slate_ink` instead of the red pool.

---

## How the style works (the 4 primitives)

Every asset is drawn with the same tiny toolkit (see `primitives` in the spec):

- **`jitter(v, a=0.9)`** — nudges a coordinate by ±a; this is the hand-drawn wobble.
- **`wrect(x,y,w,h)`** — a rectangle whose 4 corners are each jittered, emitted
  with softly rounded corners. Used for tiles, stone blocks, planks, doors.
- **`blob(cx,cy,r,n,amp)`** — a smoothed jittered polygon. Used for moss,
  cobbles, canopy lobes, water, sacks, rocks.
- **`P(d, fill, ink, w)`** — emits **one** `<path>` carrying *both* a fill and a
  stroke, so nothing is ever left un-inked.

Surfaces are made by **looping** one of these across a region with per-piece
color/size/offset randomness (a roof is ~hundreds of `wrect` tiles; a tree is
dozens of `blob` lobes). Light is faked with a lower-left cast shadow (blurred),
an up-right light rim, and a warm→dark global gradient overlay — applied the same
way on every asset so they agree when composited.

---

## Making a new asset

Follow `procedure_for_new_asset` in the spec. In short:

1. Set the shared constants + a fresh seed.
2. Lay the ground (cobble / grass / flagstone) or dark void.
3. Drop the footprint's lower-left cast shadow first.
4. Build the base in masonry/timber (inked, jittered pieces).
5. Fill the surface from the matching `material_system`.
6. Add spines/frames, then the shading pass (gradients + light overlay).
7. Weather it (moss, breaks, stains, cracks, rust).
8. Scatter props, each with its own small shadow.
9. Stroke the bold silhouette ink.
10. Check it tiles at the shared pitch and its shadow matches the sun.

Keep everything on the **shared constants** (70px/grid square, cobble pitch 26,
jitter 0.9, upper-right sun) and pull all colors from `palette_tokens`, and any
new asset will drop onto the same map as the examples.

---

## Consistency rules (so assets composite)

- **One light** — upper-right sun, lower-left shadows, identical offset/opacity/blur.
- **One scale** — 70px per 5-ft square; size everything to it.
- **One ground pitch** — cobble/grass 26px, flagstone 48px, so tiles and roads meet.
- **One hand** — the same 0.9px jitter everywhere.
- **One palette** — only introduce new hues through a defined `material_system`.
- **Seed + document** — every asset gets a fixed, recorded seed.

---

*Note: the PNG previews were rendered with cairosvg; open the `.svg` files for the
crisp vector originals.*
