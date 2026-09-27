// ── Setpiece authoring kit (shim over flora/kit.ts) ──────────────────────────
//
// Wave-2 setpiece groups (traps/loot/mining/…) import their runtime geometry
// helpers from HERE — a thin re-export of the flora kit so the two waves share
// one toolkit and the props.ts ⇄ setpieces import graph stays acyclic (this
// file, like flora/kit.ts, imports only authoring.ts + type-only from
// props/palette; it NEVER runtime-imports '@/render/props').
//
// Same four rules as the rest of the paper language (see src/render/CLAUDE.md):
//   1. palette ROLES only (no hex at the use site)   2. one light dir → cutout()
//   3. deterministic wonk (seeded helpers, no Math.random)   4. flat only.
//
// GLOW / LIGHT: the ONLY sanctioned glow is a flat `glowHalo(r)` blob filled
// with a glow role (ember / arcaneGlow / glowFungus / lampGlow) at low
// fill-opacity UNDER the object — never an SVG filter/gradient/blur (Palette
// test fails on those). Declare `light: { color, radius }` (+ `anim: true` for
// pulse/flame) alongside a `'glow'`/`'light'`/`'anim'` tag.

export {
  cutout, ring, rect, leaf, radialStar, lobeBlob, scatterDots, glowHalo,
  blobPath, roughCircle, polyPath, wrectPath, hash01, hashString, pick, wonkPathD,
} from '@/render/flora/kit'
export type { Pt } from '@/render/flora/kit'
