# Compiled paper-rig experiment

This is the build-time-oriented counterpart to the interactive `rigs/` lab. It
imports the standalone workbench's `paper-rig/1` horse contract, resolves its
joint-local XYZ tree, rotates it through eight headings, projects each at 60°,
sorts plates in camera depth, and produces static inline-SVG path data.

`HorsePaperAsset` performs no rig math at render time. Detail mode draws the 22
colored source plates; far LOD concatenates them into one body path. The
`?rigperf=1` density probe compares existing paper, compiled detail, three-part
animation, and far LOD. This remains a dev experiment and does not replace the
battle renderer.

The copied horse fixture is intentional: `paper-rig-workbench.html` is an input
artifact, not an application dependency. A production importer should consume
the creator's exported rig JSON and emit a generated TypeScript module.
