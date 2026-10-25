# Compiled paper-rig experiment

This is the build-time-oriented counterpart to the interactive `rigs/` lab. It
imports standalone workbench v2 `paper-rig/1@1.1.0` packages, validates their
opaque-flat contract, resolves each joint-local XYZ tree, rotates it through the
package's eight headings, and projects it at a producer-validated elevation into
static inline-SVG path data.

The compiler now consumes producer semantics instead of guessing them:

- six ordered compositing groups, including camera-relative left/right swaps;
- one opaque core occluder between far appendages and core surface plates;
- explicit joint gaskets (including knees and core connectors);
- palette roles, LOD tiers/merge groups, anchors, clips, paint-region metadata,
  and producer validation status.

`HorsePaperAsset` performs no rig math at render time. Detail mode draws one
outer silhouette plus the semantic core, 22 visible plates, and 20 opaque
gaskets without per-part strokes. Far LOD concatenates all physical geometry
into one body path. The `?rigperf=1` density probe compares existing paper,
compiled detail, three-part animation, and far LOD.

`npm run import-paper-rigs -- <workbench.html> horse humanoid rhino` opens the
authoring document, calls its own exporter, rejects failed packages, and writes
trimmed deterministic runtime JSON under `generated/`. The source HTML remains
an input artifact rather than an application dependency. `?rigstyles=1` compares
the three specimens at 60° in an inked pale treatment and a five-depth-band
stencil treatment. Paint-region paths are retained by the package today;
clipping/boolean-flattening them into runtime-free paths remains a build-time
compiler step.
