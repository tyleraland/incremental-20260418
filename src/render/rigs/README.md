# Rigged monster prototype

`?riglab=1` proves a template-first authoring path without replacing the shipped
`BodyPart[]` renderer yet. A template owns a stable joint tree, layered parts,
parameterized bind points, pose deltas, and animation clips. A player draft is
only parameters plus per-pose joint offsets, so it is small enough to save,
copy, paste, or send through the mobile share sheet.

## Contract for a future skeleton producer

- Author top-down in a normalized box, facing `+x`, independent of final token
  pixels. Keep stable semantic joint ids across revisions.
- Supply a single-parent joint tree. A parent edit propagates to descendants;
  poses store local deltas from the parameterized bind skeleton.
- Give every joint an explicit finite `z`. Z is height/depth, not SVG DOM order:
  the renderer uses it for top-down projection and stable painter ordering.
- Keep artwork separate from motion. Parts reference joints and declare a base
  layer; poses never contain SVG paths.
- Provide bind, two idle keys, two diagonal gait keys, attack, and hit. Feet are
  independent targets so planted/raised legs can be distinguished.
- Emit flat closed geometry or primitive attachments. No gradients, filters,
  masks, embedded colors, CSS, or runtime randomness; final paints resolve
  through `palette.ts`.
- Declare a small set of meaningful proportions instead of baking one animal's
  dimensions into every point. The initial quadruped uses body length/width,
  head and neck size, leg length, stance, and tail length.

The supplied horse prototype contributed its joint graph, segmented legs,
opposed rear bends, diagonal gait, tail chain, and explicit z layers. Its
one-off DOM ids, page controls, gradients, turbulence, blur, and absolute
600×620 geometry intentionally are not part of the reusable contract.

## Production questions left open

- Compile a rig to the existing lean `BodyPart[]`/CSS system, or add a measured
  runtime rig skin. The lab's live SVG is an authoring preview, not evidence
  that dozens of continuously interpolated SVG rigs meet battle perf budgets.
- Decide whether final skin geometry is procedural primitives, producer-owned
  flat paths weighted to bones, or a hybrid.
- Version template upgrades so old shared drafts can migrate when joint graphs
  change.
- Add another genuinely different family (humanoid or segmented) before
  freezing the template schema.
