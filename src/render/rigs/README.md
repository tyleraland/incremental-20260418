# Rigged monster prototype

`?riglab=1` proves a template-first authoring path without replacing the shipped
`BodyPart[]` renderer yet. A template owns a stable joint tree, layered parts,
parameterized bind points, pose deltas, and animation clips. A player draft is
only parameters plus per-pose joint offsets, so it is small enough to save,
copy, paste, or send through the mobile share sheet.

The lab now treats idle poses as the authored foundation: `walkA` layers over
`idleA`, `walkB` over `idleB`, and attack/hit layer over `idleA`. Refining an
idle joint therefore updates derived actions automatically; editing an action
adds only a corrective overlay. The pose buttons expose this chain in their
tooltips and in the active-pose readout.

Edits can be propagated two ways. **Live mirror** applies a drag/numeric delta
to the paired near/far limb with lateral Y reflected. **Repeat last edit** keeps
the operation as a reusable Δ and can apply it later to the paired joint,
diagonal joint, or any selected target, optionally rotated or Y-flipped. This
keeps symmetry convenient without forcing a perfectly symmetric animal.

The selected joint is also shown as a focused chain in top (x/y), side (x/z),
and front (y/z) projections. Its absolute rig coordinates and parent-relative
coordinates are both editable; the panel also reports whole-rig center and
extent. The projection panel defaults to axis-normalized domains: X uses the
same fitted domain in top/side, Y in top/front, and Z in side/front, so subtle
depth changes remain visible without making the three views disagree. A true-
scale toggle instead gives every model unit the same screen size. Numbered
joints map to the coordinate table below the plots. Silhouette parts expose
round/tapered/angular/spiky geometry, width, sharpness, and exploratory
base/lit/outline color pickers. Custom colors remain draft data until a
production compiler maps them to palette roles.

Quadruped proportions deliberately have broad exploratory ranges. Head width
and head length are independent parameters; the latter controls the neck→head→
muzzle span. `modelScale` scales the complete rendered group around the rig
origin, including parts, horn attachments, rig overlay, and pose motion. Every
render also emits a concentric bottom shadow copy at 1.18× part thickness before
the visible model, so the shadow silhouette is strictly larger than every part
instead of relying on a fixed ground ellipse.

`hornNodes` are a small attachment graph stored in the shared draft. Each node
chooses any template joint or prior horn node as its parent and stores local
XYZ plus segment width. The resolver appends these nodes after posing the base
rig, so a horn follows idle/attack/hit inheritance automatically. The lab can
chain, reparent, resize, drag, numerically edit, or delete a horn branch; each
edge renders as a tapered paper segment and participates in all orthographic
views and selection surfaces.

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
- Declare pose inheritance explicitly. Action poses should be sparse overlays
  on an idle key rather than copied full-skeleton poses.
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
