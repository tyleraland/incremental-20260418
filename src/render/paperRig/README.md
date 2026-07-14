# Compiled paper-rig experiment

This is the build-time-oriented counterpart to the interactive `rigs/` lab. It
imports the standalone workbench v2 `paper-rig/1@1.1.0` horse package, validates
its opaque-flat contract, resolves its joint-local XYZ tree, rotates it through
the package's eight headings, and projects each at 60° into static inline-SVG
path data.

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

The typed horse fixture is an intentional transcription:
`paper-rig-workbench_v2.html` is an input artifact, not an application runtime
dependency. The next producer-integration step is a CLI that consumes the
creator's downloaded `.paper-rig.json` and emits this generated TypeScript shape.
Paint-region paths are retained by the package today; clipping/boolean-flattening
them into runtime-free paths remains a build-time compiler step.
