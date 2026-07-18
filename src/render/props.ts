import type { Biome } from '@/render/appearance'
import type { ScatterKind, ThemeTag } from '@/mapgen'
import type { PaperRole } from '@/render/palette'
import { hashString, hash01, wonkPathD, blobPath, type Pt } from '@/render/authoring'

// ── Flora asset-catalog groups (one file per builder; src/render/flora/*) ─────
// Each module exports a PropDef[] whose entries carry FULL inline placement meta
// (kinds/themes/role/pass/footprint …), so they flow into TERRAIN_PROPS +
// listAssets + the PROP_META merge below (a no-op for ids absent from PROP_META)
// without editing this file. Bucketed into the legacy biomes exactly like the
// themed props above: nature/farm/orchard → grass, alpine/arcane/volcanic → stone.
// Runtime helpers those files use live in flora/kit.ts (NOT re-imported here), so
// this graph stays acyclic.
import { CROPS_A } from '@/render/flora/crops-a'
import { CROPS_B } from '@/render/flora/crops-b'
import { FRUIT_TREES } from '@/render/flora/fruit-trees'
import { BERRIES } from '@/render/flora/berries'
import { VINES } from '@/render/flora/vines'
import { DESERT_FLORA } from '@/render/flora/desert'
import { WETLAND_FLORA } from '@/render/flora/wetland'
import { JUNGLE_FLORA } from '@/render/flora/jungle'
import { FOREST_FLORA } from '@/render/flora/forest'
import { ALPINE_FLORA } from '@/render/flora/alpine'
import { ARCANE_FLORA } from '@/render/flora/arcane'
import { VOLCANIC_FLORA } from '@/render/flora/volcanic'

// ── Prop assets as data ──────────────────────────────────────────────────────
//
// The paper language's scatter-prop registry (asset-pipeline step 3 — see
// src/render/CLAUDE.md for the full authoring guide). A prop is DATA, not JSX:
// 1–3 flat paths in a ~[-1,1] unit box, y-down (svg orientation), colored by
// palette ROLE — so assets are lint-able (Palette.test.tsx), batch-generable,
// and importable (scripts/import-svg.mjs), while the runtime (terrain.tsx and
// the ?workshop=1 authoring page) stays a dumb renderer.
//
// `lit: true` marks the two-tone top copy: the RENDERER applies the standard
// cutout nudge (up-left — one light direction everywhere), so authors never
// hand-place the offset. Prefer `cutout()` below over writing the pair by hand.

export interface PropPath {
  d: string            // path data in the unit box (y down)
  fill?: PaperRole     // palette role; absent → 'none' (stroke-only art)
  stroke?: PaperRole
  sw?: number          // stroke width, unit-box units (≈0.06–0.16)
  opacity?: number
  lit?: boolean        // the auto-nudged two-tone top copy
}

export interface PropDef {
  id: string
  size: number         // scale multiplier vs the placement's base (≈0.7–1.2)
  paths: PropPath[]
  // variant-generation amplitude override (unit-box units). The default ±0.07
  // suits chunky silhouettes; props with fine registered detail (a skull's eye
  // sockets) want a gentler re-cut. Undefined → the default.
  wonk?: number
  // ── discoverable asset metadata (see assets.ts / render/CLAUDE.md) ──
  // Which mapgen ScatterKind(s) this prop can stand in for. Spec-driven maps
  // place scatter by kind; the placer spreads a kind across ALL props tagged
  // with it, so a prop with no matching kind never appears on a generated map.
  // Empty/absent = not placed by scatter (e.g. `banner`/`lamppost`, placed by
  // the plaza decor ring). Stamped from PROP_META below; carried onto variants.
  kinds?: ScatterKind[]
  // True once an asset is a PLAYER choice (a cosmetic they pick), not just
  // procedural decor. Default false; the catalog + a future picker read it.
  playerSelectable?: boolean
  // Freeform labels for gallery grouping / search / procgen filters.
  tags?: string[]
  // ── PLACEMENT tags (the declarative scatter schema — see render/CLAUDE.md) ──
  // Read by the render's weighted/theme/rotate pick TODAY (terrain.tsx) and by
  // mapgen's clustering/edge/path passes LATER (phases 2–4). Optional; an
  // untagged prop is universal / field / weight-1 / upright — placeable but
  // "dumb" (never clumps, never prefers a theme). Stamped onto the def + its
  // seeded variants exactly like `kinds`, via PROP_META below.
  //
  // relative frequency WITHIN a kind (default 1) — signature props low
  // (a marquee canopy ≈0.2), filler high (a grass tuft 1).
  weight?: number
  // biomes/themes it belongs to (undefined = universal — placed anywhere).
  // The render keeps a candidate iff it's universal OR its themes intersect the
  // map's `regionTags`; an empty survivor set falls back to the full candidates.
  themes?: ThemeTag[]
  // placement archetype: field=area filler · cluster=forms clumps (groves/beds)
  // · edge=line feature along a boundary/verge · understory=sits near a parent
  // prop · accent=rare hero prop. Default 'field'.
  role?: PropRole
  // relationship HINTS for phase-2 mapgen (density/adjacency): draw it NEAR /
  // AVOID these features. Unused by the render today; fill them now.
  near?: Affinity[]
  avoid?: Affinity[]
  // rotation policy the render applies: 'upright' → ±12° wobble (things with a
  // clear "up": trees/flowers/crates); 'free' → full ±180° (radially-symmetric
  // rocks/gravel/cobbles); 'flat' → full rotation (decals). Default 'upright'.
  rotate?: RotatePolicy
  // prop ids that co-occur — phase-2 grove/bed companions (a canopy with ferns
  // and leaf litter). Fill where obvious; render ignores it today.
  clusterWith?: string[]
  // ── Part-2 placement/gameplay metadata (see render/CLAUDE.md) ──────────────
  // PASSABILITY: what a body can do at this prop's cell. REQUIRED on every
  // scatterable prop (AssetCatalog gate) — pathfinding/spawn-validity/cover
  // consume it later; declarative today (scatter stays visual-only).
  // solid = blocks movement · walkable = flat, walk straight over ·
  // overhang = trunk/post blocks but canopy overhangs (walk near, not through).
  pass?: PropPass
  // approx collision/reserve RADIUS in world cells at size 1 (placer overlap
  // reserve; a pebble ≈0.15, a canopy trunk ≈0.5). REQUIRED with `pass`.
  footprint?: number
  // which surface the prop lives on. Default 'ground'. 'water-surface' props
  // are skipped on legacy maps (no water plane); 'ceiling'/'wall'/'canopy'
  // guide future cave/indoor placement (stalactites hang, webs span corners).
  layer?: PropLayer
  // PER-THEME weight override (CONSUMED by the pick, both paths): when the
  // map's themes intersect these keys, the effective weight is the MAX of the
  // matching values, else `weight`. `deadtree` can be common in swamp and rare
  // in forest without splitting the asset.
  themeWeight?: Partial<Record<ThemeTag, number>>
  // clustering shape for phase-2+ placers: even (Poisson-ish spread) vs
  // clumped (blue-noise clumps). Declarative today.
  patch?: 'even' | 'clumped'
  // hard cap per map/chunk (accents: no five wells on one screen). Declarative.
  maxPerChunk?: number
  // gameplay affordances (reuses the interactable concept for scatter):
  // destructible/harvestable/lootable/flammable/climbable/cover. Declarative.
  gameplay?: GameplayTag[]
  // emissive props (brazier/wisp/glowshroom/lamppost): palette role + world-cell
  // radius, for a future procedural night/mood lighting pass. Declarative.
  light?: { color: PaperRole; radius: number }
  // true = the prop wants live animation (wisp/ripple/flame); the render's FX
  // budget decides what actually animates. Declarative.
  anim?: boolean
  // per-instance scale jitter range multiplier (CONSUMED at placement, seeded).
  scaleJitter?: [number, number]
  // tall upright (tree/pillar/post): y-sort anchor at the base + occluder flag
  // so bodies render behind it correctly later. Declarative.
  tall?: boolean
}

export type PropPass = 'solid' | 'walkable' | 'overhang'
export type PropLayer = 'ground' | 'wall' | 'ceiling' | 'water-surface' | 'canopy'
export type GameplayTag = 'destructible' | 'harvestable' | 'lootable' | 'flammable' | 'climbable' | 'cover'

// Placement archetype — how a prop wants to be laid down (read by mapgen phases).
export type PropRole = 'field' | 'cluster' | 'edge' | 'understory' | 'accent'
// Feature a prop wants to be near / avoid (phase-2 adjacency hints).
// 'accent' = other accent-role props (accents repel accents; sets attract).
export type Affinity = 'water' | 'wall' | 'path' | 'tree' | 'rock' | 'accent'
// Whole-token rotation policy the render applies at placement.
export type RotatePolicy = 'upright' | 'free' | 'flat'

// The placement-tag fields, as one reusable Pick (stamped by PROP_META + carried
// onto variants). Kept in sync with the PropDef fields above by construction.
export type PropPlacement = Pick<
  PropDef,
  | 'kinds' | 'playerSelectable' | 'tags' | 'weight' | 'themes' | 'role' | 'near' | 'avoid' | 'rotate' | 'clusterWith'
  | 'pass' | 'footprint' | 'layer' | 'themeWeight' | 'patch' | 'maxPerChunk' | 'gameplay' | 'light' | 'anim' | 'scaleJitter' | 'tall'
>

// ── Pure placement helpers (deterministic; also used by terrain.tsx) ─────────

// Keep a prop if it's universal (no themes) OR its themes intersect the map's.
// Unknown map themes ([]) keep everything — never empty a pool on missing data.
export function matchesThemes(def: PropDef, themes: readonly ThemeTag[]): boolean {
  if (!def.themes || def.themes.length === 0) return true
  if (themes.length === 0) return true
  return def.themes.some((t) => (themes as readonly string[]).includes(t))
}

// Theme-filter a candidate index list against the map themes, with the same
// never-render-nothing fallback ARCHETYPE_INDEX uses: an empty survivor set
// returns the full candidates.
export function themeFilteredCands(defs: PropDef[], cands: number[], themes: readonly ThemeTag[]): number[] {
  const kept = cands.filter((i) => matchesThemes(defs[i], themes))
  return kept.length ? kept : cands
}

// Effective weight for a prop on a map with `themes`: the MAX matching
// `themeWeight` entry when the map's themes intersect it, else the flat
// `weight`. This is how one asset is common in swamp and rare in forest.
export function effectiveWeight(def: PropDef, themes?: readonly ThemeTag[]): number {
  if (def.themeWeight && themes?.length) {
    let best = -1
    for (const t of themes) {
      const w = def.themeWeight[t]
      if (w !== undefined && w > best) best = w
    }
    if (best >= 0) return best
  }
  return def.weight ?? 1
}

// Weighted pick over an index list into `defs`, driven by a roll ∈ [0,1) and
// (optionally) the map's themes for per-theme weights. Returns the chosen
// index (an element of `idxs`). Deterministic — the caller supplies the roll.
export function weightedPick(defs: PropDef[], idxs: number[], roll: number, themes?: readonly ThemeTag[]): number {
  if (idxs.length === 0) return 0
  let total = 0
  for (const i of idxs) total += effectiveWeight(defs[i], themes)
  let t = roll * total
  for (const i of idxs) {
    t -= effectiveWeight(defs[i], themes)
    if (t < 0) return i
  }
  return idxs[idxs.length - 1]
}

// Rotation degrees for a policy, driven by a roll ∈ [0,1): 'upright' → ±12°
// wobble; 'free'/'flat' → full ±180°. Undefined → 'upright'.
export function rotForPolicy(policy: RotatePolicy | undefined, roll: number): number {
  const span = policy === 'free' || policy === 'flat' ? 360 : 24
  return (roll - 0.5) * span
}

// The standard two-tone cutout: base silhouette + lit top copy. THE way to give
// a shape the paper depth read — the offset itself lives in the renderer.
export function cutout(d: string, base: PaperRole, lit: PaperRole): PropPath[] {
  return [{ d, fill: base }, { d, fill: lit, lit: true }]
}

// Seeded variant family (asset-pipeline step 7 — variant generation): one
// authored archetype → `n` re-cut siblings via `wonkPathD`, so per-biome
// density is a multiplier, not art time. Seeded by the archetype id (stable
// across builds, byte-identical screenshots); a cutout pair's two identical
// `d` strings share the seed and stay in sync. Variants keep the archetype's
// roles/strokes, so the palette contract holds by construction.
export function variants(def: PropDef, n: number, amp = def.wonk ?? 0.07): PropDef[] {
  const base = hashString(def.id)
  return Array.from({ length: n }, (_, i) => ({
    id: `${def.id}~${i + 1}`,
    size: def.size,
    paths: def.paths.map((p) => ({ ...p, d: wonkPathD(p.d, base + (i + 1) * 7919, amp) })),
    kinds: def.kinds,
    playerSelectable: def.playerSelectable,
    tags: def.tags,
    // placement tags: variants inherit the parent's exactly (same rule as kinds)
    weight: def.weight,
    themes: def.themes,
    role: def.role,
    near: def.near,
    avoid: def.avoid,
    rotate: def.rotate,
    clusterWith: def.clusterWith,
    pass: def.pass,
    footprint: def.footprint,
    layer: def.layer,
    themeWeight: def.themeWeight,
    patch: def.patch,
    maxPerChunk: def.maxPerChunk,
    gameplay: def.gameplay,
    light: def.light,
    anim: def.anim,
    scaleJitter: def.scaleJitter,
    tall: def.tall,
  }))
}

// ── Prefab scatter SETS (the "interesting maps" lever) ───────────────────────
// Hand-authored mini-scenes the generator can stamp instead of loose props: a
// camp is a tent + fire ring + wagon + crates, a graveyard is stones + a dead
// tree + a wisp. Declarative registry — mapgen's clustering passes consume it
// later; today it's reviewable data (member ids are existence-checked by
// AssetCatalog.test). `n` = [min,max] members of that prop; `spread` = rough
// scene radius in world cells.
export interface ScatterSetDef {
  id: string
  themes: ThemeTag[]
  spread: number
  members: { prop: string; n: [number, number] }[]
}

export const SCATTER_SETS: ScatterSetDef[] = [
  { id: 'camp', themes: ['plains', 'forest', 'mountain'], spread: 4, members: [
    { prop: 'tent', n: [1, 2] }, { prop: 'campring', n: [1, 1] }, { prop: 'wagon', n: [0, 1] }, { prop: 'sack', n: [0, 2] },
  ] },
  { id: 'graveyard', themes: ['haunted', 'plains', 'forest'], spread: 5, members: [
    { prop: 'gravestone', n: [3, 6] }, { prop: 'deadtree', n: [1, 1] }, { prop: 'wisp', n: [0, 2] }, { prop: 'fencerun', n: [0, 3] },
  ] },
  { id: 'ruin', themes: ['ruins', 'dungeon', 'desert'], spread: 5, members: [
    { prop: 'pillar', n: [1, 3] }, { prop: 'rubble', n: [2, 4] }, { prop: 'bricks', n: [1, 2] }, { prop: 'moss', n: [0, 2] }, { prop: 'chest', n: [0, 1] },
  ] },
  { id: 'grove', themes: ['forest'], spread: 4, members: [
    { prop: 'canopy', n: [2, 3] }, { prop: 'fern', n: [1, 3] }, { prop: 'mushroom', n: [0, 2] }, { prop: 'leaves', n: [1, 2] },
  ] },
  { id: 'oasis', themes: ['desert'], spread: 4, members: [
    { prop: 'oasispalm', n: [1, 2] }, { prop: 'reeds', n: [1, 2] }, { prop: 'boulder', n: [0, 1] },
  ] },
  { id: 'boneyard', themes: ['desert', 'haunted'], spread: 4, members: [
    { prop: 'sunbones', n: [2, 3] }, { prop: 'skull', n: [0, 1] }, { prop: 'earthcrack', n: [1, 2] },
  ] },
  { id: 'fishing-spot', themes: ['water', 'beach'], spread: 3, members: [
    { prop: 'rowboat', n: [1, 1] }, { prop: 'fishnet', n: [1, 1] }, { prop: 'driftwood', n: [0, 2] }, { prop: 'steppingstone', n: [0, 1] },
  ] },
  { id: 'mine-camp', themes: ['mountain'], spread: 4, members: [
    { prop: 'minecart', n: [1, 1] }, { prop: 'beamframe', n: [1, 2] }, { prop: 'orevein', n: [1, 2] }, { prop: 'cask', n: [0, 1] },
  ] },
  { id: 'ritual-site', themes: ['haunted', 'arcane', 'dungeon'], spread: 4, members: [
    { prop: 'altar', n: [1, 1] }, { prop: 'brazier', n: [1, 2] }, { prop: 'bloodstain', n: [0, 1] }, { prop: 'bone', n: [0, 2] },
  ] },
  { id: 'farmstead', themes: ['plains'], spread: 5, members: [
    { prop: 'haybale', n: [1, 3] }, { prop: 'fencerun', n: [2, 4] }, { prop: 'scarecrow', n: [0, 1] }, { prop: 'wheat', n: [2, 4] },
  ] },
  { id: 'crossing', themes: ['water', 'swamp'], spread: 3, members: [
    { prop: 'bridgeplank', n: [1, 1] }, { prop: 'waysign', n: [0, 1] }, { prop: 'reeds', n: [1, 2] },
  ] },
  { id: 'rest-stop', themes: ['plains', 'forest', 'mountain'], spread: 4, members: [
    { prop: 'bonfire', n: [1, 1] }, { prop: 'shrine', n: [0, 1] }, { prop: 'waysign', n: [1, 1] }, { prop: 'tent', n: [0, 1] },
  ] },
  { id: 'ley-circle', themes: ['arcane'], spread: 4, members: [
    { prop: 'runestone', n: [2, 4] }, { prop: 'magiccircle', n: [1, 1] }, { prop: 'floatshard', n: [0, 2] },
  ] },
  { id: 'delve-mouth', themes: ['mountain', 'cave'], spread: 4, members: [
    { prop: 'mineentrance', n: [1, 1] }, { prop: 'minecart', n: [0, 1] }, { prop: 'beamframe', n: [1, 2] }, { prop: 'cask', n: [0, 1] },
  ] },
]

// Per-prop discoverable metadata, co-located so the PropDef path literals stay
// terse. `kinds` = the mapgen scatter kinds this prop can fill (see PropDef);
// props with no entry get an empty kinds set and are scatter-invisible on
// generated maps (fine for decor-ring-only assets). Stamped onto each base def
// (and its variants) by withVariants.
const PROP_META: Record<string, PropPlacement> = {
  // ── grass biome (plains / forest ground) ──
  tuft:     { kinds: ['bush', 'flower'], weight: 1, themes: ['plains', 'forest'], role: 'field', rotate: 'upright', near: ['path'], pass: 'walkable', footprint: 0.15, scaleJitter: [0.85, 1.15] },
  bush:     { kinds: ['tree', 'bush'], weight: 0.8, themes: ['plains', 'forest'], role: 'cluster', rotate: 'upright', near: ['tree'], pass: 'solid', footprint: 0.35 },
  pebble:   { kinds: ['rock'], weight: 0.8, themes: ['plains', 'forest', 'mountain', 'beach'], role: 'field', rotate: 'free', near: ['wall', 'rock'], pass: 'walkable', footprint: 0.15, themeWeight: { beach: 0.9, mountain: 0.85, plains: 0.7, forest: 0.7 }, scaleJitter: [0.85, 1.15] },
  bloom:    { kinds: ['flower'], weight: 0.5, themes: ['plains'], role: 'cluster', rotate: 'upright', near: ['path'], clusterWith: ['flowers', 'tuft'], pass: 'walkable', footprint: 0.1 },
  stump:    { kinds: ['stump'], weight: 0.6, themes: ['forest'], role: 'field', rotate: 'upright', near: ['tree'], pass: 'solid', footprint: 0.3 },
  mushroom: { kinds: ['flower', 'bush'], weight: 0.5, themes: ['forest'], role: 'understory', rotate: 'upright', near: ['tree'], pass: 'walkable', footprint: 0.15 },
  // water/wetland edge ONLY — reaches a forest map solely when it also has a
  // `water`/`beach` feature (a lake/stream); kept off dry forest by NOT being
  // themed `forest` and by reed-kind only emitting near water.
  reeds:    { kinds: ['reed', 'bush'], weight: 0.8, themes: ['water', 'beach'], role: 'edge', rotate: 'upright', near: ['water'], tags: ['wetland'], pass: 'walkable', footprint: 0.2, scaleJitter: [0.85, 1.15] },
  log:      { kinds: ['stump'], weight: 0.6, themes: ['forest'], role: 'field', rotate: 'free', near: ['tree'], pass: 'solid', footprint: 0.35, gameplay: ['flammable'] },
  grassclump: { kinds: ['bush', 'flower'], weight: 1, themes: ['plains', 'forest'], role: 'field', rotate: 'upright', near: ['path'], pass: 'walkable', footprint: 0.15, scaleJitter: [0.85, 1.15] },
  leaves:     { kinds: ['flower', 'bush'], weight: 0.7, themes: ['forest'], role: 'understory', rotate: 'free', near: ['tree'], pass: 'walkable', footprint: 0.1, scaleJitter: [0.85, 1.15] },
  // forest EDGE verge (fills the forest edge-role gap): a mossy fern skirt for
  // dry-forest outcrop/wall skirts. `flower` kind so the field recipe's flower
  // edge items pick it up; `bush` lets it serve as a general forest edge.
  fernverge:  { kinds: ['flower', 'bush'], weight: 0.8, themes: ['forest'], role: 'edge', rotate: 'upright', near: ['wall', 'path', 'tree'], clusterWith: ['fern', 'mushroom'], pass: 'walkable', footprint: 0.2 },
  // forest (from the inked top-down forest sheet)
  // weight 0.5: the only broadleaf tree-kind the forest theme has — at 0.2 a
  // themed forest field starved of tree mass (judge pass); in-theme it competes
  // with nothing, so weigh it against its in-theme pool, not the global one.
  canopy:   { kinds: ['tree'], weight: 0.5, themes: ['forest', 'plains'], role: 'cluster', rotate: 'upright', near: ['tree'], clusterWith: ['fern', 'leaves', 'mushroom'], pass: 'overhang', footprint: 0.5, tall: true },
  fern:     { kinds: ['bush', 'flower'], weight: 0.7, themes: ['forest'], role: 'understory', rotate: 'upright', near: ['tree'], pass: 'walkable', footprint: 0.2 },
  boulder:  { kinds: ['rock'], weight: 0.25, themes: ['mountain', 'forest', 'plains'], role: 'accent', rotate: 'upright', near: ['wall', 'rock'], pass: 'solid', footprint: 0.5, themeWeight: { mountain: 0.35, forest: 0.2, plains: 0.15 }, gameplay: ['cover'], maxPerChunk: 2 },
  flowers:  { kinds: ['flower'], weight: 0.5, themes: ['plains'], role: 'cluster', rotate: 'upright', near: ['path'], clusterWith: ['bloom', 'tuft'], pass: 'walkable', footprint: 0.15 },
  // ── stone biome (dungeon / ruins) ──
  rubble:   { kinds: ['stump', 'rock'], weight: 1, themes: ['dungeon', 'ruins'], role: 'cluster', rotate: 'free', near: ['wall'], pass: 'solid', footprint: 0.35, gameplay: ['cover'] },
  crack:    { kinds: ['reed', 'rock'], weight: 0.6, themes: ['dungeon', 'ruins'], role: 'field', rotate: 'flat', near: ['wall'], pass: 'walkable', footprint: 0.1 },
  shard:    { kinds: ['rock'], weight: 0.8, themes: ['dungeon', 'ruins', 'mountain'], role: 'field', rotate: 'free', near: ['rock', 'wall'], pass: 'walkable', footprint: 0.2 },
  bone:     { kinds: ['flower'], weight: 0.5, themes: ['dungeon', 'ruins', 'haunted'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.15 },
  pillar:   { kinds: ['tree', 'stump'], weight: 0.4, themes: ['dungeon', 'ruins'], role: 'accent', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.4, tall: true, gameplay: ['cover'], maxPerChunk: 2 },
  skull:    { kinds: ['flower', 'rock'], weight: 0.3, themes: ['dungeon', 'ruins', 'haunted'], role: 'accent', rotate: 'upright', pass: 'walkable', footprint: 0.2, maxPerChunk: 1 },
  spikes:   { kinds: ['tree'], weight: 0.5, themes: ['dungeon', 'ruins'], role: 'field', rotate: 'upright', pass: 'solid', footprint: 0.3 },
  moss:     { kinds: ['bush'], weight: 0.7, themes: ['dungeon', 'ruins'], role: 'edge', rotate: 'flat', near: ['wall'], pass: 'walkable', footprint: 0.15 },
  column:   { kinds: ['tree', 'stump'], weight: 0.3, themes: ['dungeon', 'ruins'], role: 'accent', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.45, tall: true, gameplay: ['cover'], maxPerChunk: 2 },
  bricks:   { kinds: ['rock', 'stump'], weight: 0.7, themes: ['dungeon', 'ruins'], role: 'cluster', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.35 },
  gravel:   { kinds: ['rock'], weight: 1, themes: ['dungeon', 'ruins', 'mountain'], role: 'field', rotate: 'free', near: ['path', 'wall'], pass: 'walkable', footprint: 0.15, scaleJitter: [0.85, 1.15] },
  cobweb:   { kinds: ['flower', 'bush'], weight: 0.4, themes: ['dungeon', 'ruins', 'haunted'], role: 'edge', rotate: 'flat', near: ['wall'], pass: 'walkable', footprint: 0.15, layer: 'wall' },
  // ── plaza biome (city market clutter fills the generic ground kinds) ──
  crate:    { kinds: ['stump'], weight: 1, themes: ['city'], role: 'field', rotate: 'upright', near: ['wall', 'path'], pass: 'solid', footprint: 0.35, gameplay: ['destructible'] },
  barrel:   { kinds: ['stump', 'rock'], weight: 0.9, themes: ['city'], role: 'field', rotate: 'upright', near: ['wall', 'path'], pass: 'solid', footprint: 0.3, gameplay: ['destructible'] },
  sack:     { kinds: ['rock', 'stump'], weight: 0.8, themes: ['city'], role: 'field', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.25 },
  wheel:    { kinds: ['stump'], weight: 0.4, themes: ['city'], role: 'accent', rotate: 'free', near: ['wall'], pass: 'walkable', footprint: 0.25, maxPerChunk: 1 },
  pot:      { kinds: ['bush', 'flower'], weight: 0.7, themes: ['city'], role: 'field', rotate: 'upright', near: ['wall', 'path'], pass: 'solid', footprint: 0.25, gameplay: ['destructible'] },
  signpost: { kinds: ['tree'], weight: 0.4, themes: ['city'], role: 'accent', rotate: 'upright', near: ['path'], pass: 'solid', footprint: 0.25, tall: true, maxPerChunk: 1 },
  coil:     { kinds: ['reed', 'rock'], weight: 0.5, themes: ['city'], role: 'field', rotate: 'free', near: ['wall'], pass: 'walkable', footprint: 0.15 },
  conifer:  { kinds: ['tree'], weight: 0.4, themes: ['city', 'mountain', 'forest'], role: 'cluster', rotate: 'upright', near: ['path'], pass: 'overhang', footprint: 0.45, tall: true, themeWeight: { mountain: 0.5, forest: 0.45, city: 0.2 } },
  cobbles:  { kinds: ['rock', 'stump'], weight: 0.9, themes: ['city'], role: 'edge', rotate: 'upright', near: ['path'], pass: 'walkable', footprint: 0.15, scaleJitter: [0.85, 1.15] },
  flagstone:{ kinds: ['stump', 'rock'], weight: 0.8, themes: ['city'], role: 'edge', rotate: 'upright', near: ['path'], pass: 'walkable', footprint: 0.15, scaleJitter: [0.85, 1.15] },
  // ── forest floor & wilderness ──
  deadtree:  { kinds: ['tree'], weight: 0.25, themes: ['forest', 'swamp', 'haunted'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.35, tall: true, themeWeight: { swamp: 0.45, haunted: 0.4, forest: 0.1 }, gameplay: ['flammable'], maxPerChunk: 1 },
  roots:     { kinds: ['stump', 'rock'], weight: 0.5, themes: ['forest', 'swamp'], role: 'field', rotate: 'free', near: ['tree'], pass: 'walkable', footprint: 0.2 },
  hollowlog: { kinds: ['stump'], weight: 0.45, themes: ['forest'], role: 'field', rotate: 'free', near: ['tree'], clusterWith: ['mushroom', 'leaves'], pass: 'solid', footprint: 0.4, gameplay: ['flammable'] },
  berrybush: { kinds: ['bush'], weight: 0.5, themes: ['forest', 'plains'], role: 'cluster', rotate: 'upright', clusterWith: ['bush', 'tuft'], pass: 'solid', footprint: 0.35, gameplay: ['harvestable'] },
  websnare:  { kinds: ['flower', 'bush'], weight: 0.3, themes: ['forest', 'haunted'], role: 'edge', rotate: 'flat', near: ['tree'], pass: 'walkable', footprint: 0.15, layer: 'wall' },
  campring:  { kinds: ['rock', 'stump'], weight: 0.25, themes: ['forest', 'plains', 'mountain'], role: 'accent', rotate: 'free', near: ['path'], pass: 'solid', footprint: 0.3, themeWeight: { forest: 0.3, mountain: 0.3, plains: 0.15 }, light: { color: 'ember', radius: 2.5 }, maxPerChunk: 1 },
  waysign:   { kinds: ['tree'], weight: 0.25, themes: ['forest', 'plains', 'mountain'], role: 'accent', rotate: 'upright', near: ['path'], pass: 'solid', footprint: 0.25, tall: true, themeWeight: { plains: 0.3, forest: 0.2, mountain: 0.2 }, maxPerChunk: 1 },
  // ── desert ──
  cactus:     { kinds: ['tree'], weight: 0.5, themes: ['desert'], role: 'accent', rotate: 'upright', clusterWith: ['cactuspad', 'tumbleweed'], pass: 'solid', footprint: 0.35, tall: true, maxPerChunk: 2 },
  cactuspad:  { kinds: ['bush'], weight: 0.6, themes: ['desert'], role: 'cluster', rotate: 'upright', clusterWith: ['cactus', 'duneripple'], pass: 'solid', footprint: 0.3 },
  tumbleweed: { kinds: ['bush', 'rock'], weight: 0.6, themes: ['desert'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.2 },
  sunbones:   { kinds: ['flower', 'rock'], weight: 0.35, themes: ['desert'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.2 },
  duneripple: { kinds: ['flower'], weight: 0.5, themes: ['desert', 'beach'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.1, scaleJitter: [0.85, 1.15] },
  earthcrack: { kinds: ['rock'], weight: 0.5, themes: ['desert'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.1 },
  oasispalm:  { kinds: ['tree'], weight: 0.25, themes: ['desert', 'beach'], role: 'accent', rotate: 'upright', near: ['water'], pass: 'overhang', footprint: 0.45, tall: true, maxPerChunk: 1 },
  obelisk:    { kinds: ['tree', 'stump'], weight: 0.2, themes: ['desert', 'ruins'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.45, tall: true, maxPerChunk: 1 },
  potsherds:  { kinds: ['rock', 'flower'], weight: 0.5, themes: ['desert', 'ruins'], role: 'field', rotate: 'free', clusterWith: ['obelisk'], pass: 'walkable', footprint: 0.15 },
  // ── plains / farmland ──
  haybale:   { kinds: ['stump', 'rock'], weight: 0.4, themes: ['plains'], role: 'field', rotate: 'free', clusterWith: ['fencerun', 'wheat'], pass: 'solid', footprint: 0.45, gameplay: ['cover', 'flammable'] },
  fencerun:  { kinds: ['tree', 'stump'], weight: 0.5, themes: ['plains'], role: 'edge', rotate: 'upright', near: ['path'], clusterWith: ['haybale'], pass: 'solid', footprint: 0.5 },
  wheat:     { kinds: ['reed', 'bush'], weight: 0.9, themes: ['plains'], role: 'field', rotate: 'upright', clusterWith: ['tuft', 'grassclump'], pass: 'walkable', footprint: 0.15, anim: true, scaleJitter: [0.85, 1.15] },
  scarecrow: { kinds: ['tree'], weight: 0.2, themes: ['plains'], role: 'accent', rotate: 'upright', clusterWith: ['wheat'], pass: 'solid', footprint: 0.25, tall: true, maxPerChunk: 1 },
  burrow:    { kinds: ['rock', 'flower'], weight: 0.4, themes: ['plains'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.2 },
  waystone:  { kinds: ['rock'], weight: 0.25, themes: ['plains', 'mountain'], role: 'accent', rotate: 'upright', near: ['path'], pass: 'solid', footprint: 0.35, maxPerChunk: 1 },
  // ── river / pond / shoreline ──
  // reed-kind ONLY: the field recipe emits `reed` cells near water, so floating
  // props stay off dry grass (a flower-kind lilypad/ripple landed mid-field).
  // layer 'water-surface': legacy (no-spec) maps have no water plane at all,
  // so the legacy scatter pick skips these entirely (terrain.tsx).
  lilypad:       { kinds: ['reed'], weight: 0.6, themes: ['water', 'swamp'], role: 'field', rotate: 'free', near: ['water'], clusterWith: ['ripple'], layer: 'water-surface', pass: 'walkable', footprint: 0.2 },
  steppingstone: { kinds: ['rock'], weight: 0.4, themes: ['water', 'beach'], role: 'edge', rotate: 'free', near: ['water', 'path'], pass: 'walkable', footprint: 0.25 },
  driftwood:     { kinds: ['stump'], weight: 0.5, themes: ['beach', 'water'], role: 'field', rotate: 'free', near: ['water'], pass: 'solid', footprint: 0.3, gameplay: ['flammable'] },
  rowboat:       { kinds: ['stump'], weight: 0.15, themes: ['water', 'beach'], role: 'accent', rotate: 'upright', near: ['water'], pass: 'solid', footprint: 0.6, maxPerChunk: 1 },
  fishnet:       { kinds: ['flower', 'bush'], weight: 0.25, themes: ['water', 'beach', 'city'], role: 'edge', rotate: 'flat', near: ['water'], pass: 'walkable', footprint: 0.2 },
  ripple:        { kinds: ['reed'], weight: 0.8, themes: ['water'], role: 'field', rotate: 'flat', near: ['water'], clusterWith: ['lilypad'], layer: 'water-surface', anim: true, pass: 'walkable', footprint: 0.1, scaleJitter: [0.85, 1.15] },
  mudbank:       { kinds: ['bush', 'flower'], weight: 0.5, themes: ['water', 'swamp'], role: 'field', rotate: 'flat', near: ['water'], pass: 'walkable', footprint: 0.2, themeWeight: { swamp: 0.55, water: 0.35 } },
  // ── swamp + cross-biome structures ──
  gnarltree:  { kinds: ['tree'], weight: 0.25, themes: ['swamp', 'haunted'], role: 'accent', rotate: 'upright', pass: 'overhang', footprint: 0.45, tall: true, maxPerChunk: 1 },
  hangmoss:   { kinds: ['bush', 'flower'], weight: 0.5, themes: ['swamp'], role: 'understory', rotate: 'free', near: ['tree'], pass: 'walkable', footprint: 0.15, layer: 'canopy' },
  murkpool:   { kinds: ['flower', 'rock'], weight: 0.6, themes: ['swamp'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.15 },
  glowshroom: { kinds: ['flower', 'bush'], weight: 0.4, themes: ['swamp', 'dungeon'], role: 'understory', rotate: 'upright', near: ['tree'], pass: 'walkable', footprint: 0.2, themeWeight: { swamp: 0.45, dungeon: 0.3 }, light: { color: 'glowFungus', radius: 1.5 } },
  sunkenlog:  { kinds: ['stump'], weight: 0.5, themes: ['swamp', 'water'], role: 'field', rotate: 'free', near: ['water'], pass: 'solid', footprint: 0.35, themeWeight: { swamp: 0.55, water: 0.4 } },
  wisp:       { kinds: ['flower'], weight: 0.2, themes: ['swamp', 'haunted'], role: 'accent', rotate: 'free', pass: 'walkable', footprint: 0.1, light: { color: 'glowFungus', radius: 2 }, anim: true, maxPerChunk: 2 },
  plankwalk:  { kinds: ['stump', 'rock'], weight: 0.4, themes: ['swamp'], role: 'edge', rotate: 'upright', near: ['path', 'water'], pass: 'walkable', footprint: 0.2 },
  gaspocket:  { kinds: ['flower'], weight: 0.5, themes: ['swamp'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.1, anim: true },
  well:       { kinds: ['rock', 'stump'], weight: 0.2, themes: ['plains', 'forest', 'city'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.55, maxPerChunk: 1 },
  // weight 0.12: a random grave can appear on a sunny starter field (it keeps
  // the cross-biome themes), but rarely — headline frequency is haunted work.
  gravestone: { kinds: ['rock', 'stump'], weight: 0.12, themes: ['haunted', 'plains', 'forest'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.3, themeWeight: { haunted: 0.5, plains: 0.06, forest: 0.06 }, maxPerChunk: 2 },
  tent:       { kinds: ['stump', 'tree'], weight: 0.2, themes: ['plains', 'forest', 'mountain'], role: 'accent', rotate: 'upright', clusterWith: ['campring'], pass: 'solid', footprint: 0.6, maxPerChunk: 1 },
  wagon:      { kinds: ['stump'], weight: 0.2, themes: ['plains', 'city'], role: 'accent', rotate: 'upright', near: ['path'], pass: 'solid', footprint: 0.6, maxPerChunk: 1 },
  // ── dungeon dressing ──
  brazier:    { kinds: ['tree', 'flower'], weight: 0.3, themes: ['dungeon', 'ruins'], role: 'accent', rotate: 'free', near: ['wall'], pass: 'solid', footprint: 0.3, light: { color: 'ember', radius: 3 }, maxPerChunk: 2 },
  chains:     { kinds: ['reed', 'flower'], weight: 0.4, themes: ['dungeon', 'ruins', 'haunted'], role: 'field', rotate: 'free', near: ['wall'], clusterWith: ['cage'], pass: 'walkable', footprint: 0.1 },
  cage:       { kinds: ['stump', 'tree'], weight: 0.2, themes: ['dungeon', 'haunted'], role: 'accent', rotate: 'upright', near: ['wall'], clusterWith: ['chains', 'bone'], pass: 'solid', footprint: 0.5, maxPerChunk: 1 },
  urn:        { kinds: ['flower', 'bush'], weight: 0.6, themes: ['dungeon', 'ruins'], role: 'field', rotate: 'upright', near: ['wall'], clusterWith: ['cask'], pass: 'solid', footprint: 0.25, gameplay: ['destructible'] },
  grate:      { kinds: ['rock', 'stump'], weight: 0.35, themes: ['dungeon'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.15 },
  puddle:     { kinds: ['flower', 'rock'], weight: 0.5, themes: ['dungeon', 'ruins'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.1 },
  bloodstain: { kinds: ['flower'], weight: 0.35, themes: ['dungeon', 'haunted'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.1 },
  statue:     { kinds: ['tree', 'stump'], weight: 0.2, themes: ['dungeon', 'ruins', 'city'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.5, tall: true, themeWeight: { ruins: 0.25, dungeon: 0.2, city: 0.15 }, maxPerChunk: 1 },
  altar:      { kinds: ['stump', 'rock'], weight: 0.2, themes: ['dungeon', 'haunted', 'arcane'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.5, maxPerChunk: 1 },
  chest:      { kinds: ['stump', 'rock'], weight: 0.15, themes: ['dungeon', 'ruins'], role: 'accent', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.3, gameplay: ['lootable'], maxPerChunk: 1 },
  spiketrap:  { kinds: ['rock', 'stump'], weight: 0.2, themes: ['dungeon'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.2 },
  cask:       { kinds: ['stump', 'rock'], weight: 0.5, themes: ['dungeon', 'ruins'], role: 'field', rotate: 'upright', near: ['wall'], clusterWith: ['urn'], pass: 'solid', footprint: 0.3, gameplay: ['destructible'] },
  // ── mountain / high country ──
  pine:        { kinds: ['tree'], weight: 0.6, themes: ['mountain', 'forest'], role: 'cluster', rotate: 'upright', clusterWith: ['snag', 'snowpatch'], pass: 'overhang', footprint: 0.45, tall: true, themeWeight: { mountain: 0.65, forest: 0.5 } },
  snag:        { kinds: ['tree'], weight: 0.25, themes: ['mountain', 'haunted'], role: 'accent', rotate: 'upright', near: ['rock'], pass: 'solid', footprint: 0.3, tall: true, themeWeight: { mountain: 0.3, haunted: 0.2 }, gameplay: ['flammable'], maxPerChunk: 1 },
  snowpatch:   { kinds: ['flower', 'bush'], weight: 0.7, themes: ['mountain'], role: 'field', rotate: 'flat', clusterWith: ['pine'], pass: 'walkable', footprint: 0.15, scaleJitter: [0.85, 1.15] },
  orevein:     { kinds: ['rock'], weight: 0.3, themes: ['mountain'], role: 'accent', rotate: 'free', near: ['wall', 'rock'], pass: 'solid', footprint: 0.35, gameplay: ['harvestable'], maxPerChunk: 2 },
  minecart:    { kinds: ['stump', 'rock'], weight: 0.2, themes: ['mountain'], role: 'accent', rotate: 'upright', near: ['path', 'wall'], clusterWith: ['beamframe'], pass: 'solid', footprint: 0.45, maxPerChunk: 1 },
  beamframe:   { kinds: ['tree', 'stump'], weight: 0.35, themes: ['mountain', 'dungeon'], role: 'field', rotate: 'free', near: ['wall'], pass: 'solid', footprint: 0.4, themeWeight: { mountain: 0.4, dungeon: 0.25 } },
  cairn:       { kinds: ['rock', 'stump'], weight: 0.3, themes: ['mountain'], role: 'accent', rotate: 'free', near: ['path'], pass: 'solid', footprint: 0.3, maxPerChunk: 2 },
  alpinebloom: { kinds: ['flower'], weight: 0.5, themes: ['mountain'], role: 'field', rotate: 'upright', near: ['rock'], pass: 'walkable', footprint: 0.1 },
  // ── interactable STATE assets (future interactable system; kinds: [] keeps
  // them off the scatter placer — reachable via the catalog/gallery only) ──
  // Interactable/stateful asset library — NOT scatter-placed (empty kinds keeps
  // them off the scatter placer, like lamppost/banner); tagged for the future
  // interactable system. Paired states share base geometry so a flip reads as
  // the same object changing, not a swap.
  doorshut:   { kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.5 },
  dooropen:   { kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.5 },
  lever:      { kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.2 },
  floorplate: { kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3 },
  chestopen:  { kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.4 },
  urnshards:  { kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3 },
  campcold:   { kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.45 },
  // ── pickup/loot assets (future pickup system; same non-scatter rule) ──
  coin:   { kinds: [], tags: ['pickup'], pass: 'walkable', footprint: 0.1 },
  gem:    { kinds: [], tags: ['pickup'], pass: 'walkable', footprint: 0.1 },
  potion: { kinds: [], tags: ['pickup'], pass: 'walkable', footprint: 0.1 },
  key:    { kinds: [], tags: ['pickup'], pass: 'walkable', footprint: 0.1 },
  // ── snow / tundra ──
  frozenpond:    { kinds: ['flower', 'rock'], weight: 0.5, themes: ['snow'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.3 },
  snowdrift:     { kinds: ['bush', 'flower'], weight: 0.8, themes: ['snow'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.2, scaleJitter: [0.85, 1.2] },
  iciclecluster: { kinds: ['rock'], weight: 0.4, themes: ['snow', 'mountain', 'cave'], role: 'field', rotate: 'upright', near: ['wall', 'rock'], pass: 'solid', footprint: 0.3 },
  icetree:       { kinds: ['tree'], weight: 0.3, themes: ['snow'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.35, tall: true, maxPerChunk: 3 },
  icehut:        { kinds: ['stump', 'rock'], weight: 0.15, themes: ['snow'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.6, maxPerChunk: 1 },
  icefloe:       { kinds: ['rock', 'flower'], weight: 0.4, themes: ['snow', 'water'], role: 'field', rotate: 'free', near: ['water'], pass: 'walkable', footprint: 0.3, layer: 'water-surface' },
  // ── volcanic ──
  lavacrack:    { kinds: ['rock', 'reed'], weight: 0.6, themes: ['volcanic'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.2, light: { color: 'ember', radius: 1.5 }, anim: true },
  obsidianflow: { kinds: ['rock', 'bush'], weight: 0.5, themes: ['volcanic'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.3 },
  sulfurvent:   { kinds: ['rock', 'flower'], weight: 0.4, themes: ['volcanic'], role: 'field', rotate: 'free', pass: 'solid', footprint: 0.3, anim: true },
  ashpile:      { kinds: ['bush', 'flower'], weight: 0.7, themes: ['volcanic'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.2, scaleJitter: [0.85, 1.2] },
  charsnag:     { kinds: ['tree'], weight: 0.3, themes: ['volcanic', 'haunted'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.3, tall: true, gameplay: ['flammable'], maxPerChunk: 2 },
  geyserpool:   { kinds: ['rock', 'flower'], weight: 0.25, themes: ['volcanic'], role: 'accent', rotate: 'free', pass: 'solid', footprint: 0.4, anim: true, maxPerChunk: 2 },
  // ── arcane ──
  runestone:    { kinds: ['rock', 'tree'], weight: 0.3, themes: ['arcane', 'ruins'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.4, tall: true, light: { color: 'bannerBlue', radius: 1.5 }, maxPerChunk: 3 },
  floatshard:   { kinds: ['rock', 'flower'], weight: 0.4, themes: ['arcane'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.15, anim: true },
  manapool:     { kinds: ['flower', 'rock'], weight: 0.35, themes: ['arcane'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.35, light: { color: 'bannerBlue', radius: 2 } },
  magiccircle:  { kinds: ['flower', 'rock'], weight: 0.25, themes: ['arcane', 'dungeon'], role: 'accent', rotate: 'flat', pass: 'walkable', footprint: 0.45, maxPerChunk: 1 },
  portalframe:  { kinds: ['tree', 'stump'], weight: 0.15, themes: ['arcane', 'ruins'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.55, tall: true, tags: ['portal'], maxPerChunk: 1, anim: true },
  crystalspire: { kinds: ['tree', 'rock'], weight: 0.25, themes: ['arcane', 'cave'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.4, tall: true, light: { color: 'bannerBlue', radius: 2.5 }, maxPerChunk: 2 },
  // ── connective structures: bridges, gates, portals, waypoints ──
  bridgeplank:  { kinds: ['stump'], weight: 0.2, themes: ['water', 'swamp', 'plains', 'forest'], role: 'accent', rotate: 'upright', near: ['water', 'path'], pass: 'walkable', footprint: 0.5, maxPerChunk: 1 },
  bridgestone:  { kinds: ['stump', 'rock'], weight: 0.15, themes: ['water', 'mountain', 'city'], role: 'accent', rotate: 'upright', near: ['water', 'path'], pass: 'walkable', footprint: 0.55, maxPerChunk: 1 },
  bridgerope:   { kinds: ['stump'], weight: 0.15, themes: ['mountain', 'jungle', 'swamp'], role: 'accent', rotate: 'upright', near: ['water'], pass: 'walkable', footprint: 0.5, maxPerChunk: 1 },
  woodgate:     { kinds: ['tree', 'stump'], weight: 0.2, themes: ['plains', 'forest', 'city'], role: 'accent', rotate: 'upright', near: ['path'], clusterWith: ['fencerun'], pass: 'solid', footprint: 0.5, maxPerChunk: 2, tags: ['interactable'] },
  woodgateopen: { kinds: ['tree', 'stump'], weight: 0.2, themes: ['plains', 'forest', 'city'], role: 'accent', rotate: 'upright', near: ['path'], clusterWith: ['fencerun'], pass: 'walkable', footprint: 0.5, maxPerChunk: 2, tags: ['interactable'] },
  portcullis:   { kinds: ['stump', 'tree'], weight: 0.2, themes: ['dungeon', 'ruins', 'city'], role: 'accent', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.55, maxPerChunk: 2, tags: ['interactable'] },
  brokengate:   { kinds: ['stump', 'rock'], weight: 0.25, themes: ['ruins', 'dungeon', 'haunted'], role: 'accent', rotate: 'upright', near: ['wall'], pass: 'walkable', footprint: 0.5, maxPerChunk: 2 },
  cavemouth:    { kinds: ['rock', 'tree'], weight: 0.2, themes: ['mountain', 'cave', 'forest'], role: 'accent', rotate: 'upright', near: ['wall', 'rock'], pass: 'solid', footprint: 0.7, maxPerChunk: 1, tags: ['portal'] },
  mineentrance: { kinds: ['stump', 'tree'], weight: 0.15, themes: ['mountain', 'cave'], role: 'accent', rotate: 'upright', near: ['wall'], clusterWith: ['minecart', 'beamframe'], pass: 'solid', footprint: 0.6, maxPerChunk: 1, tags: ['portal'] },
  stairdown:    { kinds: ['rock', 'stump'], weight: 0.15, themes: ['dungeon', 'ruins', 'cave'], role: 'accent', rotate: 'upright', pass: 'walkable', footprint: 0.5, maxPerChunk: 1, tags: ['portal'] },
  ladder:       { kinds: ['stump'], weight: 0.15, themes: ['dungeon', 'cave', 'city'], role: 'accent', rotate: 'upright', pass: 'walkable', footprint: 0.35, maxPerChunk: 1, tags: ['portal'], gameplay: ['climbable'] },
  cellarhatch:  { kinds: ['stump', 'rock'], weight: 0.15, themes: ['city', 'plains'], role: 'accent', rotate: 'upright', near: ['wall'], pass: 'walkable', footprint: 0.45, maxPerChunk: 1, tags: ['portal'] },
  shrine:       { kinds: ['rock', 'stump'], weight: 0.15, themes: ['forest', 'plains', 'mountain', 'arcane'], role: 'accent', rotate: 'upright', near: ['path'], pass: 'solid', footprint: 0.45, maxPerChunk: 1, light: { color: 'ember', radius: 1.5 }, tags: ['waypoint'] },
  bonfire:      { kinds: ['rock', 'stump'], weight: 0.15, themes: ['plains', 'forest', 'mountain', 'haunted'], role: 'accent', rotate: 'free', near: ['path'], clusterWith: ['tent', 'campring'], pass: 'solid', footprint: 0.5, maxPerChunk: 1, light: { color: 'ember', radius: 3.5 }, anim: true, tags: ['waypoint'] },
  // ── cave / underground ──
  stalagmite:     { kinds: ['tree', 'rock'], weight: 0.6, themes: ['cave'], role: 'field', rotate: 'free', pass: 'solid', footprint: 0.35, tall: true },
  stalactite:     { kinds: ['flower', 'rock'], weight: 0.4, themes: ['cave'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.15, layer: 'ceiling' },
  crystalcluster: { kinds: ['rock', 'tree'], weight: 0.3, themes: ['cave', 'arcane'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.35, light: { color: 'bannerBlue', radius: 1.5 }, maxPerChunk: 3 },
  cavepool:       { kinds: ['flower', 'rock'], weight: 0.4, themes: ['cave'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.35 },
  glowworms:      { kinds: ['flower'], weight: 0.4, themes: ['cave'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.2, layer: 'ceiling', light: { color: 'glowFungus', radius: 2 } },
  flowstone:      { kinds: ['rock', 'bush'], weight: 0.5, themes: ['cave'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.3 },
  // ── jungle ──
  hangvines:   { kinds: ['bush', 'flower'], weight: 0.5, themes: ['jungle'], role: 'understory', rotate: 'free', near: ['tree'], pass: 'walkable', footprint: 0.2, layer: 'canopy' },
  giantleaf:   { kinds: ['bush', 'flower'], weight: 0.7, themes: ['jungle'], role: 'field', rotate: 'upright', pass: 'walkable', footprint: 0.2, scaleJitter: [0.9, 1.25] },
  bamboo:      { kinds: ['tree', 'reed'], weight: 0.6, themes: ['jungle'], role: 'cluster', rotate: 'upright', pass: 'solid', footprint: 0.3, tall: true },
  exoticbloom: { kinds: ['flower'], weight: 0.4, themes: ['jungle'], role: 'accent', rotate: 'upright', pass: 'walkable', footprint: 0.2, maxPerChunk: 3 },
  // ── forest & desert fills ──
  bramble:       { kinds: ['bush'], weight: 0.5, themes: ['forest', 'haunted'], role: 'field', rotate: 'free', pass: 'solid', footprint: 0.3, gameplay: ['flammable'] },
  beehive:       { kinds: ['flower', 'bush'], weight: 0.25, themes: ['forest'], role: 'accent', rotate: 'upright', near: ['tree'], pass: 'walkable', footprint: 0.15, layer: 'canopy', maxPerChunk: 2, gameplay: ['destructible'] },
  toadstoolring: { kinds: ['flower', 'bush'], weight: 0.3, themes: ['forest'], role: 'accent', rotate: 'free', pass: 'walkable', footprint: 0.4, maxPerChunk: 2 },
  quicksand:     { kinds: ['rock', 'flower'], weight: 0.3, themes: ['desert'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.4, maxPerChunk: 2 },
  digspot:       { kinds: ['flower', 'rock'], weight: 0.3, themes: ['desert', 'beach'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.25, gameplay: ['lootable'] },
  // ── shore & beach fills ──
  pier:       { kinds: ['stump'], weight: 0.2, themes: ['water', 'beach', 'city'], role: 'accent', rotate: 'upright', near: ['water'], clusterWith: ['rowboat', 'fishnet'], pass: 'walkable', footprint: 0.5, maxPerChunk: 1 },
  buoy:       { kinds: ['reed'], weight: 0.3, themes: ['water'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.12, layer: 'water-surface' },
  algaemat:   { kinds: ['reed'], weight: 0.5, themes: ['water', 'swamp'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.25, layer: 'water-surface', scaleJitter: [0.85, 1.2] },
  seashells:  { kinds: ['flower', 'rock'], weight: 0.7, themes: ['beach'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.12, scaleJitter: [0.85, 1.15] },
  tidepool:   { kinds: ['rock', 'flower'], weight: 0.4, themes: ['beach'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.3 },
  coral:      { kinds: ['rock', 'bush'], weight: 0.35, themes: ['beach'], role: 'field', rotate: 'free', pass: 'walkable', footprint: 0.2 },
  sandcastle: { kinds: ['stump', 'rock'], weight: 0.15, themes: ['beach'], role: 'accent', rotate: 'upright', pass: 'walkable', footprint: 0.25, maxPerChunk: 1, gameplay: ['destructible'] },
  // ── city & dungeon furniture ──
  marketstall: { kinds: ['stump', 'tree'], weight: 0.3, themes: ['city'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.6, maxPerChunk: 3, clusterWith: ['crate', 'sack', 'barrel'] },
  bench:       { kinds: ['stump'], weight: 0.4, themes: ['city'], role: 'field', rotate: 'upright', near: ['path', 'wall'], pass: 'solid', footprint: 0.35 },
  awning:      { kinds: ['flower', 'bush'], weight: 0.3, themes: ['city'], role: 'edge', rotate: 'upright', near: ['wall'], pass: 'walkable', footprint: 0.2, layer: 'wall' },
  hanglantern: { kinds: ['flower'], weight: 0.3, themes: ['city'], role: 'field', rotate: 'upright', pass: 'walkable', footprint: 0.1, layer: 'canopy', light: { color: 'lampGlow', radius: 2 } },
  sarcophagus: { kinds: ['stump', 'rock'], weight: 0.2, themes: ['dungeon', 'ruins', 'haunted'], role: 'accent', rotate: 'upright', pass: 'solid', footprint: 0.55, maxPerChunk: 2, gameplay: ['lootable'] },
  bookshelf:   { kinds: ['stump', 'tree'], weight: 0.3, themes: ['dungeon', 'city'], role: 'field', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.45, gameplay: ['flammable'] },
  weaponrack:  { kinds: ['stump', 'tree'], weight: 0.25, themes: ['dungeon', 'city'], role: 'field', rotate: 'upright', near: ['wall'], pass: 'solid', footprint: 0.4, gameplay: ['lootable'] },
  hoard:       { kinds: ['rock', 'flower'], weight: 0.15, themes: ['dungeon', 'ruins'], role: 'accent', rotate: 'free', pass: 'walkable', footprint: 0.35, maxPerChunk: 1, gameplay: ['lootable'], light: { color: 'bannerGold', radius: 1 } },
  floorrunes:  { kinds: ['flower'], weight: 0.3, themes: ['dungeon', 'arcane', 'ruins'], role: 'field', rotate: 'flat', pass: 'walkable', footprint: 0.3 },
  // ── state pairs II ──
  berrypicked: { kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3 },
  braziercold: { kinds: [], tags: ['interactable'], pass: 'solid', footprint: 0.3 },
  cratedebris: { kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.3 },
  potdebris:   { kinds: [], tags: ['interactable'], pass: 'walkable', footprint: 0.25 },
  // decor-ring assets: placed by the plaza landmark ring, not scatter (no
  // placement tags needed — empty kinds keeps them off the scatter placer)
  lamppost: { kinds: [] },
  banner:   { kinds: [] },
}

const withVariants = (defs: PropDef[], n = 2): PropDef[] =>
  defs.flatMap((d) => {
    const based: PropDef = { ...d, ...PROP_META[d.id] }
    return [based, ...variants(based, n)]
  })

const BUSH_D = 'M0 -0.75C0.55 -0.7 0.9 -0.3 0.85 0.2C0.8 0.65 0.35 0.85 0 0.85C-0.4 0.85 -0.85 0.6 -0.87 0.15C-0.9 -0.35 -0.5 -0.72 0 -0.75Z'
const PEBBLE_D = 'M-0.45 0.1C-0.42 -0.25 -0.15 -0.38 0.05 -0.35C0.32 -0.31 0.45 -0.12 0.42 0.1C0.38 0.3 0.15 0.38 -0.05 0.36C-0.28 0.34 -0.47 0.28 -0.45 0.1Z'
const RUBBLE_D = 'M-0.7 0.3L-0.2 -0.42L0.32 0L0 0.45Z'
const SHARD_D = 'M-0.5 0.25L-0.1 -0.4L0.5 -0.15L0.2 0.35Z'
const CRATE_D = 'M-0.5 -0.42L0.48 -0.5L0.52 0.46L-0.44 0.5Z'
const BARREL_D = 'M-0.42 0A0.42 0.42 0 1 0 0.42 0A0.42 0.42 0 1 0 -0.42 0Z'
const SACK_D = 'M-0.35 -0.5C0.1 -0.62 0.42 -0.3 0.45 0.05C0.5 0.4 0.2 0.55 -0.05 0.55C-0.38 0.55 -0.55 0.32 -0.52 0C-0.5 -0.25 -0.5 -0.42 -0.35 -0.5Z'
const LOG_D = 'M-0.85 -0.15C-0.86 -0.3 -0.72 -0.36 -0.6 -0.34L0.62 -0.28C0.78 -0.27 0.87 -0.14 0.86 0.01C0.85 0.16 0.74 0.26 0.6 0.26L-0.6 0.32C-0.76 0.33 -0.84 0.02 -0.85 -0.15Z'
const MUSHCAP_D = 'M-0.55 -0.02C-0.56 -0.5 0.54 -0.52 0.55 -0.04C0.28 0.05 -0.28 0.06 -0.55 -0.02Z'
const PILLAR_D = 'M-0.34 0.6L-0.38 -0.32L-0.14 -0.55L0.08 -0.32L0.14 -0.52L0.37 -0.4L0.34 0.6Z'
const SPIKES_D = 'M-0.7 0.55L-0.45 -0.22L-0.25 0.08L-0.04 -0.65L0.2 0.02L0.42 -0.32L0.66 0.55Z'
const SKULL_D = 'M-0.4 0.08C-0.46 -0.35 -0.16 -0.56 0.05 -0.54C0.31 -0.5 0.49 -0.28 0.46 0.04C0.44 0.24 0.31 0.31 0.2 0.33L0.17 0.46L-0.24 0.43L-0.27 0.27C-0.35 0.23 -0.38 0.18 -0.4 0.08Z'
const POT_D = 'M-0.38 -0.12C-0.42 0.08 -0.3 0.48 -0.19 0.55L0.2 0.55C0.31 0.48 0.42 0.08 0.38 -0.12L0.46 -0.26L-0.46 -0.24Z'
const BOARD_D = 'M-0.55 -0.56L0.5 -0.62L0.53 -0.26L-0.52 -0.21Z'

// Deterministic radial STAR (a top-down conifer crown / cog): `n` points, outer
// radius `ro`, valley radius `ri`. Pure trig, no Math.random — a static path
// string, so it wonks + variants like any hand-authored prop.
function starPath(n: number, ro: number, ri: number, rot = 0): string {
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3)
  }
  return d + 'Z'
}
const CONIFER_OUT = starPath(9, 0.92, 0.44, 0.2)
const CONIFER_IN = starPath(9, 0.66, 0.3, 0.2)
const BANNER_D = 'M0.02 -0.52L0.44 -0.46L0.5 0.5L0.12 0.56Z'

// Deterministic rounded-LOBE ring (a top-down deciduous crown / cauliflower
// bush): `n` lobes alternating outer radius `ro` / valley `ri`, smoothed by
// blobPath. Trig only, no Math.random — a static path that wonks + variants
// like any hand-authored prop, the leafy round-tree counterpart to starPath's
// spiky conifer crown.
function lobeRing(n: number, ro: number, ri: number, cx = 0, cy = 0): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return pts
}
const CANOPY_D = blobPath(lobeRing(7, 0.82, 0.6, 0, -0.06))
const BOULDER_D = 'M-0.6 0.12C-0.64 -0.22 -0.34 -0.5 0.02 -0.52C0.4 -0.54 0.66 -0.28 0.64 0.04C0.62 0.34 0.36 0.5 0.02 0.5C-0.32 0.5 -0.56 0.42 -0.6 0.12Z'

// ── Dungeon stone props (top-down inked dungeon sheet: round columns, cut-brick
// courses, loose gravel, corner cobwebs) ────────────────────────────────────
const r3 = (v: number) => Math.round(v * 1000) / 1000
// A closed circle as two arcs (wonkPathD-safe: radii wobble, flags stay exact).
const ringPath = (r: number, cx = 0, cy = 0) =>
  `M${r3(cx - r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(cx + r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(cx - r)} ${r3(cy)}Z`
const rectD = (x: number, y: number, w: number, h: number) =>
  `M${r3(x)} ${r3(y)}L${r3(x + w)} ${r3(y)}L${r3(x + w)} ${r3(y + h)}L${r3(x)} ${r3(y + h)}Z`

// Running-bond course of cut stones (three rows, alternating offset) as one
// multi-rect path — the sheet's "Exterior Bricks" read.
const BRICK_ROWS: { y: number; xs: [number, number][] }[] = [
  { y: -0.46, xs: [[-0.58, -0.22], [-0.18, 0.18], [0.22, 0.58]] },
  { y: -0.2, xs: [[-0.66, -0.3], [-0.26, 0.14], [0.18, 0.62]] },
  { y: 0.06, xs: [[-0.58, -0.22], [-0.18, 0.18], [0.22, 0.58]] },
]
const BRICKS_D = BRICK_ROWS.map((r) => r.xs.map(([x0, x1]) => rectD(x0, r.y, x1 - x0, 0.22)).join('')).join('')
const BRICK_SEAMS = 'M-0.66 -0.23L0.62 -0.23M-0.66 0.03L0.62 0.03M-0.18 -0.46L-0.18 -0.24M0.22 -0.46L0.22 -0.24M-0.26 -0.2L-0.26 0.02M0.18 -0.2L0.18 0.02'

// A fine scatter of small loose stones (Rubble E/F/G) — seeded, deterministic,
// so the base+lit cutout pair stays in sync.
const gravelD = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 911) - 0.5) * 1.55
    const y = (hash01(seed + i * 911 + 331) - 0.5) * 1.4
    const r = 0.1 + hash01(seed + i * 911 + 613) * 0.09
    d += ringPath(r, x, y)
  }
  return d
}
const GRAVEL_D = gravelD(hashString('gravel'), 13)

// Corner spider-web: radial spokes from a corner anchor + connecting arcs bowed
// back toward the corner. Pale strokes at low opacity — a decal, not a solid.
const COBWEB = (() => {
  const cx = -0.82, cy = -0.82, S = 5, R = 1.7
  const dirs = Array.from({ length: S }, (_, i) => {
    const a = (i / (S - 1)) * (Math.PI / 2)
    return { x: Math.cos(a), y: Math.sin(a) }
  })
  let spokes = ''
  for (const d of dirs) spokes += `M${r3(cx)} ${r3(cy)}L${r3(cx + d.x * R)} ${r3(cy + d.y * R)}`
  let arcs = ''
  for (const rr of [0.55, 0.95, 1.35]) {
    for (let j = 0; j < S - 1; j++) {
      const p0 = { x: cx + dirs[j].x * rr, y: cy + dirs[j].y * rr }
      const p1 = { x: cx + dirs[j + 1].x * rr, y: cy + dirs[j + 1].y * rr }
      const mx = (dirs[j].x + dirs[j + 1].x) / 2, my = (dirs[j].y + dirs[j + 1].y) / 2
      const ml = Math.hypot(mx, my) || 1
      const ctrl = { x: cx + (mx / ml) * rr * 0.72, y: cy + (my / ml) * rr * 0.72 }
      arcs += `M${r3(p0.x)} ${r3(p0.y)}Q${r3(ctrl.x)} ${r3(ctrl.y)} ${r3(p1.x)} ${r3(p1.y)}`
    }
  }
  return { spokes, arcs }
})()

// ── "Ribbon" pack point-decor (grass clumps, leaf piles, loose paving) ───────
// A small almond leaf: a lens between two tips, bulged by control points on the
// perpendicular. M/Q only, so it wonks + variants cleanly.
const leafD = (cx: number, cy: number, len: number, wid: number, ang: number): string => {
  const dx = Math.cos(ang), dy = Math.sin(ang)
  const px = -dy, py = dx
  const t1x = cx + dx * len, t1y = cy + dy * len
  const t2x = cx - dx * len, t2y = cy - dy * len
  const c1x = cx + px * wid, c1y = cy + py * wid
  const c2x = cx - px * wid, c2y = cy - py * wid
  return `M${r3(t1x)} ${r3(t1y)}Q${r3(c1x)} ${r3(c1y)} ${r3(t2x)} ${r3(t2y)}Q${r3(c2x)} ${r3(c2y)} ${r3(t1x)} ${r3(t1y)}Z`
}
// A seeded scatter of small fallen leaves in one tone (hash01-mixed positions,
// so the base stays deterministic — three tones layered = the "Leaf Piles" read).
const leafScatterD = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 733) - 0.5) * 1.5
    const y = (hash01(seed + i * 733 + 211) - 0.5) * 1.35
    const len = 0.16 + hash01(seed + i * 733 + 401) * 0.09
    const ang = hash01(seed + i * 733 + 577) * Math.PI
    d += leafD(x, y, len, len * 0.52, ang)
  }
  return d
}
const LEAVES_WARM = leafScatterD(hashString('leaves-warm'), 5)
const LEAVES_TAN = leafScatterD(hashString('leaves-tan'), 4)
const LEAVES_GREEN = leafScatterD(hashString('leaves-green'), 4)

// A lush bushy grass MOUND (Grass 2/3 blobs) — fuller than the thin-bladed
// tuft: a lumpy two-tone dome with a few tall lit blade tips poking out.
const GRASSCLUMP_D = 'M-0.82 0.5C-0.9 0.12 -0.72 -0.18 -0.5 -0.28C-0.56 -0.56 -0.18 -0.66 -0.04 -0.44C0.06 -0.7 0.42 -0.64 0.44 -0.34C0.66 -0.52 0.9 -0.22 0.82 0.14C0.79 0.34 0.86 0.42 0.8 0.5Z'

// A loose cluster of round cobbles (Cobble Scattered / Round read): a few pale
// two-tone paving stones. cutout gives each a dark seam rim on the far side.
const cobbleClusterD = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 617) - 0.5) * 1.15
    const y = (hash01(seed + i * 617 + 149) - 0.5) * 0.95
    const r = 0.23 + hash01(seed + i * 617 + 331) * 0.13
    d += ringPath(r, x, y)
  }
  return d
}
const COBBLES_D = cobbleClusterD(hashString('cobbles'), 5)
const COBBLES_SHADOW = ringPath(0.92, 0.06, 0.14)

// A single dressed SQUARE paving slab (Cobble Square tile) with a scored mortar
// edge — the calm counterpoint to the loose cobble cluster.
const FLAGSTONE_D = rectD(-0.56, -0.52, 1.12, 1.04)
const FLAGSTONE_SEAM = rectD(-0.42, -0.39, 0.84, 0.78)
const FLAGSTONE_SHADOW = rectD(-0.48, -0.4, 1.12, 1.04)

// ── forest floor & wilderness props ─────────────────────────────────────────────────────
// Bare dead tree seen from above: gnarled branches radiating from a trunk core.
// Main limbs kink once (Q) with short straight fork subpaths; a lit overlay
// picks out the up-left limbs.
const DEADTREE_BRANCHES = 'M0.02 0Q0.3 -0.42 0.22 -0.82M0.14 -0.5L0.48 -0.62M0 0.02Q0.52 0.12 0.85 -0.06M0.5 0.1L0.7 0.4M-0.02 0Q-0.15 0.5 0.12 0.85M-0.08 0.42L-0.42 0.62M-0.02 -0.02Q-0.55 -0.15 -0.85 -0.42M-0.5 -0.18L-0.6 0.15M0 -0.04Q-0.1 -0.42 -0.4 -0.72'
const DEADTREE_LIT = 'M-0.02 -0.02Q-0.55 -0.15 -0.85 -0.42M0 -0.04Q-0.1 -0.42 -0.4 -0.72'
const DEADTREE_CORE = ringPath(0.17)

// Surface roots breaking through soil: six sinuous strokes radiating from a
// root-crown knot; three upper roots take the lit copy.
// Kept SHORT and knotless (judge pass): at full deadtree-like reach with a
// trunk-core disc, roots was an effective duplicate of `deadtree` at scatter
// size. Shorter, thicker limbs with no center = ground texture, not a tree.
const ROOTS_DK = 'M-0.04 -0.02Q-0.33 -0.1 -0.6 0.04M0 0.02Q-0.2 0.24 -0.4 0.45M0.04 0.02Q0.25 0.2 0.55 0.25M0.02 -0.03Q0.2 -0.25 0.13 -0.55M-0.01 0.04Q-0.03 0.3 0.2 0.5M0.01 -0.01Q0.4 -0.04 0.58 -0.22'
const ROOTS_LIT = 'M0.02 -0.03Q0.2 -0.25 0.13 -0.55M-0.04 -0.02Q-0.33 -0.1 -0.6 0.04M0.01 -0.01Q0.4 -0.04 0.58 -0.22'

// Fallen hollow log: fatter and stubbier than LOG_D, with a dark open bore at
// the left end and a moss saddle patch mid-top.
const HOLLOWLOG_D = 'M-0.84 -0.14C-0.86 -0.34 -0.7 -0.44 -0.55 -0.42L0.58 -0.38C0.78 -0.36 0.88 -0.18 0.86 0.02C0.84 0.24 0.7 0.36 0.54 0.36L-0.56 0.42C-0.74 0.44 -0.82 0.06 -0.84 -0.14Z'
const HOLLOWLOG_BORE = 'M-0.82 0A0.14 0.26 0 1 0 -0.54 0A0.14 0.26 0 1 0 -0.82 0Z'
const HOLLOWLOG_MOSS = 'M0.05 -0.3C0.25 -0.42 0.5 -0.34 0.52 -0.16C0.53 -0.02 0.32 0.06 0.14 0.02C-0.02 -0.02 -0.08 -0.2 0.05 -0.3Z'

// Round berry bush: a slightly rounder blob than BUSH_D; berries are one
// multi-subpath scatter of six small bloom-colored circles.
const BERRYBUSH_D = 'M0 -0.7C0.5 -0.68 0.82 -0.32 0.78 0.12C0.74 0.55 0.38 0.78 -0.02 0.78C-0.42 0.78 -0.78 0.52 -0.8 0.1C-0.82 -0.34 -0.46 -0.68 0 -0.7Z'
const BERRYBUSH_BERRIES = 'M-0.44 -0.18A0.08 0.08 0 1 0 -0.28 -0.18A0.08 0.08 0 1 0 -0.44 -0.18ZM0.08 -0.38A0.08 0.08 0 1 0 0.24 -0.38A0.08 0.08 0 1 0 0.08 -0.38ZM0.3 0.08A0.07 0.07 0 1 0 0.44 0.08A0.07 0.07 0 1 0 0.3 0.08ZM-0.14 0.22A0.08 0.08 0 1 0 0.02 0.22A0.08 0.08 0 1 0 -0.14 0.22ZM-0.5 0.3A0.07 0.07 0 1 0 -0.36 0.3A0.07 0.07 0 1 0 -0.5 0.3ZM0.16 -0.08A0.07 0.07 0 1 0 0.3 -0.08A0.07 0.07 0 1 0 0.16 -0.08Z'

// Full radial spiderweb strung between two anchor stubs: 8 spokes + two rings
// of sag arcs bowed back toward the hub (COBWEB's corner technique, but a free-
// standing orb). Pure trig IIFE — deterministic, wonk/variant-safe (M/L/Q only).
const WEBSNARE = (() => {
  const S = 8, R = 0.68
  const dirs = Array.from({ length: S }, (_, i) => {
    const a = (i / S) * Math.PI * 2
    return { x: Math.cos(a), y: Math.sin(a) }
  })
  let spokes = ''
  for (const d of dirs) spokes += `M0 0L${r3(d.x * R)} ${r3(d.y * R)}`
  let arcs = ''
  for (const rr of [0.3, 0.52]) {
    for (let j = 0; j < S; j++) {
      const d0 = dirs[j], d1 = dirs[(j + 1) % S]
      const mx = (d0.x + d1.x) / 2, my = (d0.y + d1.y) / 2
      const ml = Math.hypot(mx, my) || 1
      arcs += `M${r3(d0.x * rr)} ${r3(d0.y * rr)}Q${r3((mx / ml) * rr * 0.78)} ${r3((my / ml) * rr * 0.78)} ${r3(d1.x * rr)} ${r3(d1.y * rr)}`
    }
  }
  return { spokes, arcs }
})()
const WEBSNARE_STUBS = ringPath(0.09, -0.7, 0) + ringPath(0.09, 0.7, 0)

// Campfire ring: eight small stones seeded around a 0.6-radius circle (angle /
// radius / size jitter via hash01), enclosing a charred disc + ember glow.
const CAMPRING_STONES = (() => {
  const seed = hashString('campring')
  let d = ''
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (hash01(seed + i * 373) - 0.5) * 0.3
    const rad = 0.6 + (hash01(seed + i * 373 + 131) - 0.5) * 0.08
    const r = 0.12 + hash01(seed + i * 373 + 211) * 0.05
    d += ringPath(r, r3(Math.cos(a) * rad), r3(Math.sin(a) * rad))
  }
  return d
})()

// Wilderness signpost, top-down: two arrow-tipped planks nailed across a post
// (opposed directions), the pale post cap on top. Distinct from the city
// `signpost` (single board on a side post).
// Real chevron arrowheads (judge pass: the shallow tips read as a lumber pile)
// — each plank is shaft + a wide notched head, the two visibly opposed.
const WAYSIGN_PLANKS = 'M-0.3 -0.32L0.3 -0.28L0.3 -0.42L0.74 -0.16L0.3 0.08L0.3 -0.06L-0.28 -0.1ZM0.3 0.14L-0.3 0.18L-0.3 0.04L-0.74 0.3L-0.3 0.54L-0.3 0.4L0.32 0.36Z'

// ── desert props ─────────────────────────────────────────────────────
// Top-down saguaro: round main crown + three arm lobes (capsules radiating
// up-left / right / down-left, rounded tips as half-circle arcs).
const CACTUS_D =
  ringPath(0.36, 0, 0.08) +
  'M0.014 -0.156L-0.353 -0.523A0.12 0.12 0 0 0 -0.523 -0.353L-0.156 0.014Z' +
  'M0.076 0.144L0.527 0.307A0.11 0.11 0 0 0 0.601 0.101L0.15 -0.062Z' +
  'M-0.156 0.049L-0.371 0.424A0.11 0.11 0 0 0 -0.179 0.534L0.036 0.159Z'
const CACTUS_SPINES =
  ringPath(0.035, 0, 0.06) + ringPath(0.03, -0.44, -0.44) + ringPath(0.03, 0.56, 0.2) +
  ringPath(0.03, -0.27, 0.47) + ringPath(0.03, 0.18, -0.12)

// Prickly-pear cluster: four overlapping oval pads at mixed angles (rotated
// ellipses as arc pairs), spine dots on the lit faces.
const CACTUSPAD_D =
  'M-0.153 -0.522A0.3 0.2 115 1 0 -0.407 0.022A0.3 0.2 115 1 0 -0.153 -0.522Z' +
  'M0.09 -0.477A0.32 0.2 60 1 0 0.41 0.077A0.32 0.2 60 1 0 0.09 -0.477Z' +
  'M0.355 0.241A0.34 0.22 170 1 0 -0.315 0.359A0.34 0.22 170 1 0 0.355 0.241Z' +
  'M-0.619 0.113A0.26 0.17 40 1 0 -0.221 0.447A0.26 0.17 40 1 0 -0.619 0.113Z'
const CACTUSPAD_SPINES =
  ringPath(0.028, -0.3, -0.34) + ringPath(0.028, -0.18, -0.1) + ringPath(0.028, 0.2, -0.3) +
  ringPath(0.028, 0.33, -0.03) + ringPath(0.028, 0.05, 0.31) + ringPath(0.028, -0.42, 0.3)

// Tumbleweed: two layered open scribble stroke sets — a dark tangle + a lit
// inner tangle — so the ball stays airy (no fill).
const TUMBLEWEED_OUT =
  'M-0.5 -0.1C-0.3 -0.55 0.3 -0.55 0.5 -0.05M-0.35 0.4C-0.55 0 -0.1 -0.5 0.35 -0.35' +
  'M0.45 0.25C0.1 0.55 -0.4 0.35 -0.3 -0.2M-0.05 -0.5C0.4 -0.3 0.45 0.3 0 0.45' +
  'M-0.5 0.15C-0.35 -0.15 0.2 -0.4 0.42 -0.22'
const TUMBLEWEED_IN =
  'M-0.35 -0.25C0 -0.5 0.4 -0.2 0.25 0.2M0.3 -0.38C0.05 0.02 -0.3 0.15 -0.4 0.12' +
  'M-0.15 0.4C-0.3 0.05 0.15 -0.15 0.32 0.06'

// Sun-bleached remains: a straight spine with four rib hoops arcing over it,
// plus a pair of curved horns off the skull (one stroke path), a small skull
// blob, and two dark socket rings.
const SUNBONES_RIBS =
  'M-0.22 0.02L0.72 -0.04' +
  'M-0.15 -0.3Q0.05 -0.42 0.1 -0.05Q0.12 0.2 -0.02 0.32' +
  'M0.08 -0.32Q0.28 -0.42 0.32 -0.06Q0.34 0.18 0.2 0.3' +
  'M0.3 -0.3Q0.5 -0.38 0.52 -0.04Q0.54 0.16 0.42 0.26' +
  'M0.5 -0.26Q0.68 -0.32 0.68 0Q0.68 0.14 0.6 0.22' +
  'M-0.6 -0.22Q-0.76 -0.4 -0.64 -0.58M-0.34 -0.24Q-0.24 -0.46 -0.34 -0.62'
const SUNBONES_SKULL =
  'M-0.66 -0.1C-0.6 -0.28 -0.4 -0.3 -0.3 -0.16C-0.22 -0.04 -0.24 0.14 -0.36 0.22C-0.5 0.3 -0.64 0.2 -0.66 -0.1Z'
const SUNBONES_SOCKETS = ringPath(0.045, -0.54, -0.06) + ringPath(0.045, -0.39, -0.04)

// Wind-ripple decal: a faint round sand wash under four long parallel lit
// ripple strokes.
const DUNERIPPLE_WASH = blobPath(lobeRing(6, 0.82, 0.66))
const DUNERIPPLE_LINES =
  'M-0.75 -0.4Q-0.1 -0.55 0.7 -0.38M-0.8 -0.05Q0 -0.22 0.78 -0.02' +
  'M-0.75 0.3Q-0.05 0.12 0.72 0.34M-0.6 0.6Q0 0.46 0.6 0.62'

// Dried cracked earth: five angular plates in a rough disc, with a branching
// dark crack running through the seams between them.
const EARTHCRACK_D =
  'M-0.68 -0.1L-0.3 -0.55L0.05 -0.3L-0.25 0.05Z' +
  'M0.1 -0.62L0.55 -0.4L0.4 -0.05L0 -0.22Z' +
  'M0.48 0.02L0.68 0.25L0.35 0.55L0.15 0.2Z' +
  'M-0.2 0.12L0.08 0.28L-0.05 0.6L-0.45 0.5Z' +
  'M-0.62 0.05L-0.32 0.1L-0.5 0.42Z'
const EARTHCRACK_SEAMS =
  'M-0.28 -0.58L-0.18 -0.05L-0.35 0.5M-0.18 -0.05L0.12 -0.16L0.35 0.02L0.6 -0.08M0.35 0.02L0.28 0.35'

// Top-down palm: a 7-frond radial star (longer, deeper-notched than the
// 9-point conifer) with a lit inner frond star and a trunk dot.
const OASISPALM_OUT = starPath(7, 0.95, 0.34, 0.25)
const OASISPALM_IN = starPath(7, 0.7, 0.26, 0.25)

// Half-buried leaning obelisk: a tapered slab with a pyramidion tip pointing
// up-right, a sand drift swallowing the base, and three etched rune ticks.
const OBELISK_D = 'M-0.52 0.3L0.32 -0.47L0.5 -0.52L0.46 -0.34L-0.28 0.56Z'
const OBELISK_SHADOW = 'M-0.42 0.42L0.5 -0.38L0.58 -0.26L-0.24 0.64Z'
// Wide LOW drift wash under the buried base (judge pass: a saturated sand ball
// attached to the shaft read as a torch head — flat wash, not a blob).
const OBELISK_SAND =
  'M-0.88 0.3C-0.8 0.08 -0.42 0 -0.12 0.12C0.14 0.22 0.16 0.46 -0.1 0.58C-0.44 0.72 -0.84 0.56 -0.88 0.3Z'
const OBELISK_RUNES = 'M-0.05 -0.02L0.07 0.08M0.06 -0.16L0.17 -0.06M-0.17 0.1L-0.05 0.2'

// Scattered pottery: five small angular sherds around one larger broken rim —
// a 120° annular band (outer arc, step in, inner arc back).
const POTSHERDS_D =
  'M-0.55 -0.15L-0.35 -0.3L-0.3 -0.08Z' +
  'M-0.1 -0.45L0.14 -0.5L0.2 -0.28L-0.02 -0.24Z' +
  'M0.35 -0.15L0.55 -0.2L0.5 0.05Z' +
  'M-0.35 0.25L-0.12 0.18L-0.2 0.42Z' +
  'M0.1 0.3L0.32 0.28L0.28 0.5L0.06 0.48Z' +
  'M-0.269 0.196A0.34 0.34 0 0 1 0.109 -0.255L0.09 -0.147A0.23 0.23 0 0 0 -0.166 0.159Z'

// ── plains / farmland props ─────────────────────────────────────────────────────
// round HAY BALE seen end-on from above: a drum disc + a wound-straw spiral
const HAYBALE_D = ringPath(0.55)
const HAYBALE_SPIRAL = 'M-0.42 0A0.42 0.42 0 0 1 0.42 0A0.32 0.32 0 0 1 -0.22 0A0.22 0.22 0 0 1 0.22 0A0.13 0.13 0 0 1 -0.04 0'
// short FENCE run: two round post tops + a pair of rails slung between them
const FENCERUN_POSTS = ringPath(0.15, -0.68, 0.01) + ringPath(0.15, 0.68, -0.02)
const FENCERUN_RAILS = 'M-0.68 -0.1L0.68 -0.14M-0.68 0.12L0.68 0.1'
// WHEAT stand: four tall bowed stalks, ripe seed-head lenses at the tips
const WHEAT_STALKS = 'M-0.44 0.62Q-0.36 -0.05 -0.52 -0.72M-0.14 0.65Q-0.08 -0.1 -0.18 -0.84M0.14 0.65Q0.18 -0.05 0.1 -0.8M0.44 0.6Q0.42 0 0.54 -0.66'
const WHEAT_STALKS_LIT = 'M-0.14 0.65Q-0.08 -0.1 -0.18 -0.84M0.14 0.65Q0.18 -0.05 0.1 -0.8'
const WHEAT_HEADS = 'M-0.58 -0.74A0.06 0.12 -14 1 0 -0.46 -0.74A0.06 0.12 -14 1 0 -0.58 -0.74ZM-0.24 -0.86A0.06 0.12 -4 1 0 -0.12 -0.86A0.06 0.12 -4 1 0 -0.24 -0.86ZM0.04 -0.82A0.06 0.12 6 1 0 0.16 -0.82A0.06 0.12 6 1 0 0.04 -0.82ZM0.48 -0.68A0.06 0.12 14 1 0 0.6 -0.68A0.06 0.12 14 1 0 0.48 -0.68Z'
// SCARECROW from above: cross-arm frame, ragged tunic, straw hat over the middle
const SCARECROW_TUNIC = 'M-0.34 -0.1C-0.46 0.1 -0.4 0.34 -0.28 0.46L-0.2 0.38L-0.12 0.52C0 0.6 0.14 0.58 0.24 0.5L0.2 0.38L0.34 0.42C0.44 0.28 0.44 0.06 0.32 -0.1Z'
const SCARECROW_FRAME = 'M-0.78 -0.1L0.78 -0.14M0 -0.2L0 0.66'
const SCARECROW_HAT = ringPath(0.3, 0, -0.12)
// animal BURROW: dark oval hole with an earthen rim + a kicked-out dirt fan
const BURROW_FAN = 'M0 -0.06C0.34 -0.24 0.74 -0.12 0.86 0.16C0.92 0.4 0.62 0.6 0.32 0.54C0.06 0.48 -0.08 0.18 0 -0.06Z'
const BURROW_SPECKS = ringPath(0.05, 0.52, 0.14) + ringPath(0.04, 0.68, 0.32) + ringPath(0.045, 0.4, 0.4)
const BURROW_RIM = 'M-0.6 0.05A0.38 0.28 0 1 0 0.16 0.05A0.38 0.28 0 1 0 -0.6 0.05Z'
const BURROW_HOLE = 'M-0.5 0.05A0.28 0.18 0 1 0 0.06 0.05A0.28 0.18 0 1 0 -0.5 0.05Z'
// WAYSTONE: a squat round-shouldered standing slab (taller than wide — distinct
// from the lumpy `boulder`), carved grooves + a moss fleck at the foot
// Angular tapered menhir (judge pass: the rounded-shoulder slab was one blink
// from `gravestone` on the same sheet — faceted standing-stone shape instead).
const WAYSTONE_D = 'M-0.24 0.6L-0.34 -0.42L-0.1 -0.72L0.18 -0.62L0.3 -0.4L0.24 0.6Z'
const WAYSTONE_GROOVES = 'M-0.16 -0.34L0.16 -0.3M-0.14 -0.12L0.14 -0.08'
const WAYSTONE_MOSS = 'M-0.34 0.3C-0.36 0.16 -0.2 0.1 -0.08 0.16C0 0.22 -0.04 0.36 -0.16 0.4C-0.26 0.42 -0.32 0.4 -0.34 0.3Z'

// ── river / pond / shoreline props ─────────────────────────────────────────────────────
// Three round pads, each a disc with a pie-notch wedge cut (M center → L notch
// edge → the long-way arc back → Z), one multi-subpath fill.
const LILYPAD_D =
  'M-0.34 -0.26L-0.019 0.011A0.42 0.42 0 1 1 0.078 -0.218Z' +
  'M0.42 0.3L0.244 -0.014A0.36 0.36 0 1 1 0.097 0.141Z' +
  'M0.05 -0.62L-0.142 -0.476A0.24 0.24 0 1 1 -0.028 -0.393Z'

// A short diagonal run of three flat worn crossing stones.
const STEPPINGSTONE_D = ringPath(0.3, -0.62, 0.42) + ringPath(0.26, 0.02, 0) + ringPath(0.28, 0.62, -0.4)
const STEPPINGSTONE_SHADOW = ringPath(0.3, -0.57, 0.48) + ringPath(0.26, 0.07, 0.06) + ringPath(0.28, 0.67, -0.34)

// Bleached sinuous limb + two broken stub branches (one multi-subpath fill).
const DRIFTWOOD_D =
  'M-0.85 0.12C-0.5 -0.08 -0.1 -0.25 0.4 -0.22C0.6 -0.21 0.78 -0.26 0.84 -0.3L0.8 -0.14C0.6 -0.08 0.3 -0.06 -0.05 -0.02C-0.35 0.02 -0.6 0.16 -0.82 0.26Z' +
  'M-0.1 -0.11L0.02 -0.46L0.12 -0.42L0.05 -0.08Z' +
  'M-0.5 0.12L-0.66 0.42L-0.56 0.48L-0.4 0.16Z'

// Pointed-oval hull, bow up, squared stern.
const ROWBOAT_D = 'M0 -0.88C0.3 -0.62 0.4 -0.2 0.34 0.42C0.32 0.66 0.2 0.74 0 0.74C-0.2 0.74 -0.32 0.66 -0.34 0.42C-0.4 -0.2 -0.3 -0.62 0 -0.88Z'
const ROWBOAT_SHADOW = 'M0.06 -0.81C0.36 -0.55 0.46 -0.13 0.4 0.49C0.38 0.73 0.26 0.81 0.06 0.81C-0.14 0.81 -0.26 0.73 -0.28 0.49C-0.34 -0.13 -0.24 -0.55 0.06 -0.81Z'
const ROWBOAT_RIM = 'M0 -0.72C0.24 -0.5 0.31 -0.16 0.26 0.4C0.25 0.58 0.15 0.62 0 0.62C-0.15 0.62 -0.25 0.58 -0.26 0.4C-0.31 -0.16 -0.24 -0.5 0 -0.72'

// Diamond lattice: both 45° line families clipped to the draped band — a
// deterministic loop (no hash needed; the lattice is regular).
const FISHNET_MESH = (() => {
  const X = 0.6, Y = 0.32, cy = 0.1
  let d = ''
  for (let k = -3; k <= 3; k++) {
    const c = k * 0.2
    let x0 = Math.max(-X, -Y - c), x1 = Math.min(X, Y - c)
    if (x1 > x0) d += `M${r3(x0)} ${r3(x0 + c + cy)}L${r3(x1)} ${r3(x1 + c + cy)}`
    x0 = Math.max(-X, c - Y); x1 = Math.min(X, c + Y)
    if (x1 > x0) d += `M${r3(x0)} ${r3(c - x0 + cy)}L${r3(x1)} ${r3(c - x1 + cy)}`
  }
  return d
})()
const FISHNET_POSTS = ringPath(0.09, -0.78, -0.34) + ringPath(0.09, 0.78, -0.34)

// Concentric BROKEN arc segments (each < half a turn: large-arc 0, sweep 1).
const RIPPLE_INNER =
  'M0.287 0.089A0.3 0.3 0 0 1 -0.221 0.203M-0.281 -0.105A0.3 0.3 0 0 1 0.233 -0.189' +
  'M0.383 0.395A0.55 0.55 0 0 1 -0.324 0.445M-0.534 0.132A0.55 0.55 0 0 1 -0.316 -0.45M0.048 -0.548A0.55 0.55 0 0 1 0.528 -0.154'
const RIPPLE_OUTER =
  'M0.804 0.163A0.82 0.82 0 0 1 0.058 0.818M-0.546 0.611A0.82 0.82 0 0 1 -0.793 -0.21M-0.329 -0.751A0.82 0.82 0 0 1 0.581 -0.579'

// Wide, low irregular silt blob.
const MUDBANK_D = 'M-0.9 0.1C-0.85 -0.25 -0.45 -0.35 -0.1 -0.3C0.3 -0.38 0.75 -0.28 0.85 -0.02C0.92 0.2 0.6 0.34 0.15 0.32C-0.3 0.38 -0.82 0.34 -0.9 0.1Z'

// ── swamp + cross-biome structures props ─────────────────────────────────────────────────────
// warped asymmetric top-down crown — hand-cut lobes, deliberately lopsided
// (vs the regular lobeRing canopy), so the tree reads sick/twisted.
const GNARLTREE_D = 'M0.72 -0.08Q0.7 -0.4 0.42 -0.4Q0.5 -0.78 0.16 -0.66Q0.02 -0.9 -0.22 -0.62Q-0.56 -0.74 -0.5 -0.42Q-0.85 -0.4 -0.68 -0.1Q-0.9 0.18 -0.55 0.3Q-0.6 0.66 -0.26 0.56Q-0.1 0.85 0.18 0.6Q0.5 0.72 0.44 0.38Q0.8 0.3 0.72 -0.08Z'
// two crooked bare branches breaking the crown (one forked)
const GNARLTREE_BRANCHES = 'M0.28 -0.16L0.58 -0.5L0.52 -0.74M0.58 -0.5L0.8 -0.56M-0.35 0.22L-0.68 0.56L-0.62 0.78'

const HANGMOSS_STRANDS = 'M-0.68 -0.42Q-0.58 0.08 -0.66 0.55M-0.38 -0.5Q-0.3 0.05 -0.4 0.7M-0.05 -0.56Q0.02 0.1 -0.04 0.8M0.28 -0.5Q0.38 0 0.3 0.66M0.58 -0.42Q0.66 0.1 0.58 0.5'
const HANGMOSS_LIT = 'M-0.38 -0.5Q-0.3 0.05 -0.4 0.7M-0.05 -0.56Q0.02 0.1 -0.04 0.8M0.28 -0.5Q0.38 0 0.3 0.66'

const MURKPOOL_D = 'M0.78 0.06Q0.74 -0.34 0.4 -0.42Q0.22 -0.6 -0.12 -0.5Q-0.5 -0.58 -0.64 -0.28Q-0.86 -0.06 -0.66 0.22Q-0.6 0.5 -0.22 0.52Q0.12 0.64 0.38 0.44Q0.7 0.38 0.78 0.06Z'
const MURKPOOL_DEEP = 'M0.44 0.04Q0.4 -0.2 0.16 -0.26Q-0.1 -0.34 -0.32 -0.18Q-0.5 -0.02 -0.36 0.18Q-0.16 0.34 0.1 0.3Q0.36 0.26 0.44 0.04Z'
const MURKPOOL_SCUM = 'M0.6 0.05Q0.55 -0.28 0.24 -0.36Q-0.1 -0.44 -0.42 -0.24Q-0.64 -0.04 -0.5 0.22Q-0.34 0.44 0 0.42Q0.5 0.36 0.6 0.05Z'

const GLOWSHROOM_CAPS = ringPath(0.24, -0.32, -0.02) + ringPath(0.3, 0.08, -0.12) + ringPath(0.16, 0.37, 0.16)
const GLOWSHROOM_SPOTS = ringPath(0.05, -0.36, -0.06) + ringPath(0.06, 0.03, -0.16) + ringPath(0.035, 0.35, 0.13)

const SUNKENLOG_D = 'M-0.8 -0.14C-0.82 -0.28 -0.68 -0.36 -0.55 -0.34L0.6 -0.26C0.74 -0.24 0.82 -0.12 0.8 0.02C0.78 0.16 0.66 0.26 0.52 0.26L-0.58 0.3C-0.72 0.31 -0.78 0 -0.8 -0.14Z'
const SUNKENLOG_MURK = 'M0.88 0Q0.86 -0.26 0.6 -0.32Q0.36 -0.38 0.26 -0.12Q0.2 0.14 0.42 0.28Q0.68 0.4 0.82 0.22Q0.9 0.12 0.88 0Z'

const WISP_HALOS = ringPath(0.22, 0.04, -0.06) + ringPath(0.36, 0.04, -0.06)

// three whole planks + one broken half; the missing right half is the read
const PLANKWALK_D = rectD(-0.72, -0.64, 1.44, 0.25) + rectD(-0.66, -0.31, 1.38, 0.25) + rectD(-0.7, 0.02, 0.52, 0.24) + rectD(-0.72, 0.36, 1.42, 0.25)

// seeded cluster of small bog bubbles (deterministic, like gravelD)
const GASPOCKET_BUBBLES = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 419) - 0.5) * 1.15
    const y = (hash01(seed + i * 419 + 173) - 0.5) * 1.05
    const r = 0.07 + hash01(seed + i * 419 + 257) * 0.08
    d += ringPath(r, r3(x), r3(y))
  }
  return d
}
const GASPOCKET_D = GASPOCKET_BUBBLES(hashString('gaspocket'), 7)
const GASPOCKET_POPS = ringPath(0.17, 0.34, -0.3) + ringPath(0.12, -0.38, 0.32)

const WELL_RIM = ringPath(0.6)

const GRAVESTONE_MOUND = 'M-0.28 -0.06Q-0.4 0.3 -0.3 0.6Q0 0.76 0.3 0.6Q0.4 0.3 0.28 -0.06Q0 -0.18 -0.28 -0.06Z'
const GRAVESTONE_SLAB = 'M-0.32 -0.1L-0.32 -0.52Q-0.32 -0.76 0 -0.76Q0.32 -0.76 0.32 -0.52L0.32 -0.1Z'

const TENT_D = 'M-0.78 0L-0.46 -0.4L0.46 -0.4L0.78 0L0.46 0.4L-0.46 0.4Z'

const WAGON_D = rectD(-0.62, -0.38, 1.24, 0.76)
const WAGON_WHEELS = ringPath(0.19, 0.08, -0.5) + ringPath(0.19, 0.08, 0.5)

// ── dungeon dressing props ─────────────────────────────────────────────────────
// Standing iron BRAZIER, top-down: three leg stubs poking past the rim, a dark
// iron ring, an emberDeep coal bed, a live flame blob and two flicker dots.
const BRAZIER_RIM = ringPath(0.5)
const BRAZIER_BOWL = ringPath(0.36)
const BRAZIER_LEGS = (() => {
  let d = ''
  for (const a of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
    const dx = Math.cos(a), dy = Math.sin(a)
    d += `M${r3(dx * 0.46)} ${r3(dy * 0.46)}L${r3(dx * 0.68)} ${r3(dy * 0.68)}`
  }
  return d
})()
const BRAZIER_FLAME = 'M-0.18 0.08C-0.24 -0.08 -0.12 -0.22 0.03 -0.19C0.18 -0.16 0.24 -0.02 0.17 0.1C0.07 0.22 -0.1 0.2 -0.18 0.08Z'

// Heavy fallen CHAIN: a run of oval links along a slack curve, alternating
// face-on / edge-on radii so it reads as twisted links, not a dotted line.
// Seeded per-link jitter keeps the sag irregular; angles follow the tangent.
const CHAINS_LINK = (cx: number, cy: number, ang: number, rx: number, ry: number): string => {
  const dx = Math.cos(ang), dy = Math.sin(ang)
  const x1 = r3(cx - dx * rx), y1 = r3(cy - dy * rx)
  const x2 = r3(cx + dx * rx), y2 = r3(cy + dy * rx)
  const deg = r3((ang * 180) / Math.PI)
  return `M${x1} ${y1}A${r3(rx)} ${r3(ry)} ${deg} 1 0 ${x2} ${y2}A${r3(rx)} ${r3(ry)} ${deg} 1 0 ${x1} ${y1}Z`
}
// Five FAT links (judge pass: seven small links collapsed to a dotted scratch
// at gameplay size — fewer, bigger links along the same sag curve).
const CHAINS_RUN = (seed: number, idx: number[]): string => {
  let d = ''
  for (const i of idx) {
    const t = i / 4
    const cx = -0.72 + t * 1.44
    const cy = 0.16 - t * 0.3 + Math.sin(t * Math.PI) * 0.18 + (hash01(seed + i * 131) - 0.5) * 0.06
    const ang = Math.atan2(-0.3 + 0.18 * Math.PI * Math.cos(t * Math.PI), 1.44)
    d += CHAINS_LINK(cx, cy, ang, 0.17, i % 2 ? 0.08 : 0.115)
  }
  return d
}
const CHAINS_D = CHAINS_RUN(hashString('chains'), [0, 1, 2, 3, 4])
const CHAINS_HI = CHAINS_RUN(hashString('chains'), [0, 2, 4])

// Iron CAGE cell, top-down: a dark recess under a heavy stroked frame, thin
// bars across it, and one pale bone dropped inside.
const CAGE_RECESS = rectD(-0.52, -0.52, 1.04, 1.04)
const CAGE_FRAME = rectD(-0.55, -0.55, 1.1, 1.1)
const CAGE_BARS = 'M-0.28 -0.55L-0.28 0.55M0 -0.55L0 0.55M0.28 -0.55L0.28 0.55'
const CAGE_BONE = 'M-0.3 0.14L0.12 0.28M0.06 0.36L0.2 0.2'

// Breakable clay URN cluster: one big-bellied upright urn (two-tone) with an
// inked rim ring, plus a small tipped urn spilling right with a dark mouth.
const URN_BIG = ringPath(0.42, -0.24, 0)
const URN_RIM = ringPath(0.27, -0.24, 0)
const URN_TIPPED = 'M0.3 0.22C0.3 0.08 0.42 -0.02 0.56 0C0.72 0.02 0.82 0.14 0.8 0.26C0.78 0.4 0.64 0.46 0.5 0.42C0.38 0.38 0.3 0.32 0.3 0.22Z'
const URN_MOUTH = 'M0.27 0.22A0.05 0.1 0 1 0 0.37 0.22A0.05 0.1 0 1 0 0.27 0.22Z'

// Round floor GRATE: a dark recess disc, chord bars, an iron rim ring.
const GRATE_RECESS = ringPath(0.55)
const GRATE_BARS = 'M-0.46 -0.3L0.46 -0.3M-0.5 0L0.5 0M-0.46 0.3L0.46 0.3'

// Stagnant PUDDLE decal: one irregular translucent blob + a thin glint stroke.
const PUDDLE_D = 'M-0.62 0.1C-0.72 -0.18 -0.44 -0.38 -0.12 -0.34C0.08 -0.5 0.5 -0.42 0.6 -0.16C0.72 0.08 0.5 0.3 0.22 0.32C0.02 0.44 -0.34 0.42 -0.62 0.1Z'
const PUDDLE_GLINT = 'M-0.34 -0.08Q-0.1 -0.22 0.26 -0.12'

// Dried BLOODSTAIN decal: a main blob + a seeded ring of small splatter dots.
const BLOODSTAIN_D = 'M-0.5 0.02C-0.56 -0.26 -0.28 -0.44 0 -0.36C0.24 -0.5 0.52 -0.3 0.5 -0.04C0.6 0.18 0.32 0.38 0.06 0.32C-0.2 0.42 -0.44 0.3 -0.5 0.02Z'
const BLOODSTAIN_DOT_D = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = hash01(seed + i * 977) * Math.PI * 2
    const rad = 0.52 + hash01(seed + i * 977 + 271) * 0.3
    const r = 0.028 + hash01(seed + i * 977 + 523) * 0.045
    d += ringPath(r, Math.cos(a) * rad, Math.sin(a) * rad)
  }
  return d
}
const BLOODSTAIN_DOTS = BLOODSTAIN_DOT_D(hashString('bloodstain'), 6)

// Weathered STATUE on a plinth, top-down: cast shadow, two-tone square plinth,
// pale shoulder oval with a dark hood disc — the hooded-figure read.
const STATUE_SHADOW = 'M-0.34 0.58A0.48 0.26 0 1 0 0.62 0.58A0.48 0.26 0 1 0 -0.34 0.58Z'
const STATUE_PLINTH = rectD(-0.5, -0.5, 1, 1)
// Shoulders OVERHANG the plinth up-left and the hood casts a small offset
// shadow (judge pass: fully-inset ovals read as a carved glyph ON the block,
// not a figure standing above it).
const STATUE_FIGURE = 'M-0.56 -0.1A0.4 0.28 -18 1 0 0.24 -0.14A0.4 0.28 -18 1 0 -0.56 -0.1Z'
const STATUE_HOODSHADOW = ringPath(0.18, -0.06, -0.14)
const STATUE_HOOD = ringPath(0.17, -0.14, -0.24)

// Low stone ALTAR slab: drop shadow, two-tone slab, a cloth runner stripe,
// a pair of cream candle dots on the corners.
const ALTAR_SHADOW = rectD(-0.56, -0.36, 1.24, 0.84)
const ALTAR_SLAB = rectD(-0.62, -0.42, 1.24, 0.84)
const ALTAR_RUNNER = rectD(-0.14, -0.42, 0.28, 0.84)
const ALTAR_CANDLES = ringPath(0.09, -0.38, -0.18) + ringPath(0.075, 0.4, 0.14)

// Treasure CHEST, top-down: two-tone wood lid, one ink path for the lid seam +
// both straps, a bannerGold clasp dot on the front edge.
const CHEST_D = rectD(-0.5, -0.38, 1, 0.76)
// One central strap + a BIG gold hasp on it (judge pass: a 3×2 strap grid read
// as crate slats and a ~1px clasp lost the "reward" cue).
const CHEST_STRAPS = 'M-0.5 -0.02L0.5 -0.02M0 -0.38L0 0.38'
const CHEST_CLASP = ringPath(0.14, 0, 0.16)

// Floor SPIKE TRAP plate: a dark plate with a scored border and a 3×3 grid of
// steel spike triangles, each with a tiny cream tip dot. Pure loops, no RNG.
const SPIKETRAP_PLATE = rectD(-0.55, -0.55, 1.1, 1.1)
const SPIKETRAP_BORDER = rectD(-0.47, -0.47, 0.94, 0.94)
// 2×2 grid of BIG spikes (judge pass: a 3×3 grid of small triangles with
// bright tips collapsed into checker noise at 1-unit scale).
const SPIKETRAP_SPIKES = (() => {
  let d = ''
  for (const cy of [-0.24, 0.26])
    for (const cx of [-0.24, 0.24])
      d += `M${r3(cx - 0.16)} ${r3(cy + 0.13)}L${r3(cx + 0.16)} ${r3(cy + 0.13)}L${r3(cx)} ${r3(cy - 0.2)}Z`
  return d
})()
const SPIKETRAP_TIPS = (() => {
  let d = ''
  for (const cy of [-0.24, 0.26]) for (const cx of [-0.24, 0.24]) d += ringPath(0.04, cx, cy - 0.09)
  return d
})()

// Storage CASK + crate, top-down: a two-tone barrel disc with an ink hoop and
// a small lighter crate tucked beside it with one ink strap.
const CASK_BARREL = ringPath(0.4, -0.22, 0.08)
const CASK_HOOP = ringPath(0.26, -0.22, 0.08)
const CASK_CRATE = 'M0.22 -0.46L0.72 -0.42L0.68 0.06L0.18 0.02Z'
const CASK_STRAP = 'M0.2 -0.22L0.7 -0.18'

// ── mountain / high country props ─────────────────────────────────────────────────────
// mountain PINE crown: 7-arm star with deep valleys (vs conifer's 9-arm/0.44) —
// leaner, sharper, visibly a different tree at scatter size.
const PINE_OUT = starPath(7, 0.92, 0.3, -0.4)
const PINE_IN = starPath(7, 0.6, 0.2, -0.4)
// snow dust on the up-left (lit-side) spike shoulders
const PINE_SNOW = ringPath(0.09, -0.62, -0.05) + ringPath(0.08, -0.38, -0.5) + ringPath(0.07, -0.08, -0.64)

// dead SNAG seen from above: crooked bare limbs radiating from the broken trunk
const SNAG_BRANCHES =
  'M0 0.04L0.3 -0.26L0.38 -0.7M0.3 -0.26L0.6 -0.34M0 0.04L0.66 0.08L0.88 -0.12M0 0.04L0.42 0.46L0.4 0.78M0 0.04L-0.52 0.34L-0.84 0.3M0 0.04L-0.3 -0.4L-0.22 -0.8M-0.3 -0.4L-0.56 -0.52'
const SNAG_TRUNK = ringPath(0.19)

// SNOWPATCH ground decal: wide low drift blob + a lighter core offset up-left
const SNOWPATCH_D =
  'M-0.85 0.1C-0.9 -0.25 -0.5 -0.42 -0.15 -0.35C0.1 -0.5 0.55 -0.45 0.75 -0.2C0.92 0 0.8 0.3 0.45 0.4C0.1 0.52 -0.35 0.5 -0.62 0.4C-0.8 0.32 -0.83 0.25 -0.85 0.1Z'
const SNOWPATCH_CORE =
  'M-0.6 0C-0.62 -0.22 -0.32 -0.32 -0.05 -0.28C0.2 -0.36 0.5 -0.28 0.58 -0.1C0.64 0.06 0.5 0.2 0.22 0.26C-0.08 0.32 -0.45 0.28 -0.6 0Z'

// OREVEIN boulder + a glinting jagged gold seam and a few steel nuggets
const OREVEIN_D =
  'M-0.6 0.1C-0.66 -0.22 -0.42 -0.46 -0.06 -0.5C0.3 -0.53 0.62 -0.34 0.62 -0.02C0.62 0.28 0.34 0.48 -0.02 0.47C-0.36 0.46 -0.55 0.36 -0.6 0.1Z'
const OREVEIN_SEAM = 'M-0.44 -0.16L-0.16 -0.02L0.06 -0.22L0.34 -0.06M-0.16 -0.02L-0.06 0.24'
const OREVEIN_NUGGETS = ringPath(0.05, -0.3, 0.12) + ringPath(0.04, 0.24, 0.18) + ringPath(0.045, 0.4, -0.24)

// MINECART: open plank box over a rail pair, dark ore bed showing inside
const MINECART_RAILS = 'M-0.24 -0.95L-0.24 0.95M0.24 -0.95L0.24 0.95'
const MINECART_BOX = rectD(-0.4, -0.55, 0.8, 1.1)
const MINECART_BED = rectD(-0.26, -0.41, 0.52, 0.82)

// BEAMFRAME: two collapsed crossed support timbers + a broken splinter
const BEAMFRAME_D = 'M-0.82 -0.45L0.72 0.5M-0.6 0.58L0.78 -0.42'
const BEAMFRAME_SPLINTER = 'M-0.2 -0.68L0.4 -0.55'

// CAIRN: stacked discs, each smaller and nudged up-left, snow-dab cap
const CAIRN_BASE = ringPath(0.52, 0.05, 0.1)
const CAIRN_MID = ringPath(0.38, -0.02, 0)
const CAIRN_TOP = ringPath(0.26, -0.08, -0.09)
const CAIRN_CAP = ringPath(0.11, -0.13, -0.15)

// ALPINEBLOOM: two crevice pebbles, foliage flecks, tiny blooms
const ALPINEBLOOM_ROCKS = ringPath(0.3, -0.3, 0.2) + ringPath(0.24, 0.28, 0.3)
const ALPINEBLOOM_LEAVES = leafD(-0.08, -0.14, 0.16, 0.08, 2.2) + leafD(0.14, -0.06, 0.14, 0.07, 0.9) + leafD(-0.26, -0.3, 0.13, 0.06, 1.6)
const ALPINEBLOOM_DOTS = ringPath(0.13, -0.04, -0.34) + ringPath(0.11, 0.2, -0.18)
const ALPINEBLOOM_CREAM = ringPath(0.08, -0.26, -0.46)

// ── interactable state props ─────────────────────────────────────────────
// DOOR pair: two stone jamb stubs flanking a 1.0-wide gap; the plank panel is
// the SAME rect in both states — `doorshut` spans the gap, `dooropen` is that
// exact rect rotated 70° about the left-jamb hinge at (-0.5, 0).
const DOOR_JAMBS = rectD(-0.82, -0.2, 0.32, 0.4) + rectD(0.5, -0.2, 0.32, 0.4)
const DOOR_PANEL = rectD(-0.5, -0.09, 1, 0.18)
// hinge ticks (left, hinge side) + two plank seams across the panel
const DOORSHUT_TICKS = 'M-0.42 -0.09L-0.42 0.09M-0.34 -0.09L-0.34 0.09M0.02 -0.08L0.02 0.08M0.28 -0.08L0.28 0.08'
// DOOR_PANEL's four corners rotated -70° about the hinge (-0.5, 0) — same
// 1 × 0.18 plank, swung up-left; NOT a new shape.
const DOOROPEN_PANEL = 'M-0.585 -0.031L-0.243 -0.971L-0.073 -0.909L-0.415 0.031Z'
// revealed dark doorway spanning the gap + the hinge pin dot, one ink path
const DOOROPEN_GAP = rectD(-0.5, -0.13, 1, 0.26) + ringPath(0.05, -0.5, 0)

// LEVER: stone base plate, dark throw slot, angled iron handle to a gold knob
const LEVER_PLATE = rectD(-0.3, -0.26, 0.6, 0.52)
const LEVER_SLOT = 'M-0.18 0.17L0.18 -0.21'
const LEVER_HANDLE = 'M-0.14 0.13L0.4 -0.44'
const LEVER_KNOB = ringPath(0.11, 0.46, -0.5)

// FLOORPLATE: dark recess, inset pressure plate, worn center dimple
const FLOORPLATE_RECESS = rectD(-0.5, -0.5, 1, 1)
const FLOORPLATE_D = rectD(-0.38, -0.38, 0.76, 0.76)
const FLOORPLATE_DIMPLE = ringPath(0.12, 0.02, 0.02)

// CHESTOPEN: reuses CHEST_D (the closed chest's exact body rect); the lid is a
// second rect flipped up behind it, inner face lit; ink interior + gold loot
// glints (the hasp dot rides the lid's flipped face at (0, -0.62)).
const CHESTOPEN_LID = rectD(-0.5, -0.74, 1, 0.36)
const CHESTOPEN_HOLLOW = rectD(-0.4, -0.28, 0.8, 0.56)
const CHESTOPEN_GLINTS = ringPath(0.07, -0.18, -0.02) + ringPath(0.055, 0.12, 0.1) + ringPath(0.05, 0.2, -0.14) + ringPath(0.09, 0, -0.62)

// URNSHARDS: broken `urn` — angular ceramic fragments ringing the big urn's
// old footprint (URN_BIG sat at (-0.24, 0)), incl. one out by the tipped small
// urn; a dark spill blob underneath and one surviving rim-arc shard.
const URNSHARDS_D =
  'M-0.72 -0.3L-0.5 -0.46L-0.4 -0.28L-0.62 -0.18Z' +
  'M-0.22 -0.54L-0.02 -0.44L-0.14 -0.28Z' +
  'M0.16 -0.12L0.36 -0.2L0.44 0.02L0.22 0.08Z' +
  'M0.08 0.28L0.28 0.36L0.08 0.5Z' +
  'M-0.28 0.36L-0.12 0.5L-0.38 0.56Z' +
  'M-0.78 0.08L-0.6 0.04L-0.58 0.26L-0.76 0.3Z' +
  'M0.52 0.16L0.72 0.24L0.56 0.38Z'
const URNSHARDS_SPILL = 'M-0.56 0C-0.6 -0.18 -0.44 -0.3 -0.24 -0.28C-0.04 -0.26 0.08 -0.12 0.04 0.06C0 0.22 -0.16 0.3 -0.34 0.26C-0.5 0.22 -0.54 0.14 -0.56 0Z'
const URNSHARDS_RIM = 'M-0.48 -0.14A0.27 0.27 0 0 1 -0.08 -0.08'

// CAMPCOLD reuses CAMPRING_STONES + campring's charred disc / crossed sticks
// verbatim; only the ember layers change to cold char (no ember roles).
const CAMPCOLD_STICKS = 'M-0.3 -0.26L0.32 0.3M-0.28 0.3L0.26 -0.3'

// ── pickup props ─────────────────────────────────────────────────────────
// ── Pickup props (loot library — placed by a future pickup system, not scatter) ──
// Gold coin: a second coin peeks from under the main disc down-right; the main
// disc is a gold cutout with an inset dark rim ring and a lit crescent glint.
const COIN_UNDER = ringPath(0.34, 0.26, 0.22)
const COIN_D = ringPath(0.44, -0.08, -0.06)
const COIN_RIM = ringPath(0.36, -0.08, -0.06)
const COIN_GLINT = 'M-0.38 -0.16A0.32 0.32 0 0 1 -0.16 -0.38'

// Cut gem: flat-topped pentagon silhouette; seam strokes trace the table
// trapezoid and radiate to the girdle points and culet; one cream sparkle.
const GEM_D = 'M-0.32 -0.48L0.32 -0.48L0.56 -0.1L0 0.58L-0.56 -0.1Z'
const GEM_SEAMS = 'M-0.32 -0.48L-0.2 -0.14L0.2 -0.14L0.32 -0.48M-0.2 -0.14L-0.56 -0.1M0.2 -0.14L0.56 -0.1M-0.2 -0.14L0 0.58M0.2 -0.14L0 0.58'
const GEM_SPARK = ringPath(0.07, -0.16, -0.3)

// Round-bellied flask: dark glass belly + neck (one multi-subpath cutout), a
// bright liquid fill disc, a cream cork dot capping the neck, a glass glint arc.
const POTION_GLASS = ringPath(0.42, 0, 0.16) + rectD(-0.13, -0.62, 0.26, 0.42)
const POTION_LIQUID = ringPath(0.31, 0, 0.19)
const POTION_CORK = ringPath(0.1, 0, -0.62)
const POTION_GLINT = 'M-0.31 0A0.34 0.34 0 0 1 -0.13 -0.16'

// Old iron key lying flat: round bow as a thick ring stroke, straight shaft,
// two square teeth hanging off the far end; a lit steel edge sells the metal.
const KEY_FRAME = ringPath(0.24, -0.5, 0) + 'M-0.28 0L0.64 0'
const KEY_TEETH = rectD(0.36, 0.06, 0.12, 0.24) + rectD(0.56, 0.06, 0.12, 0.32)
const KEY_HI = 'M-0.72 0.06A0.23 0.23 0 0 1 -0.5 -0.24M-0.2 -0.02L0.5 -0.02'

// ── snow / tundra props ─────────────────────────────────────────────────────
// FROZEN POND decal: pale blue-grey ice blob, a steel sheen offset up-left,
// two thin polyline cracks, and a snow rim crescent hugging the up-left shore.
const FROZENPOND_D =
  'M-0.78 0.05C-0.8 -0.35 -0.45 -0.6 -0.05 -0.62C0.35 -0.64 0.72 -0.42 0.76 -0.05C0.8 0.3 0.5 0.58 0.08 0.6C-0.35 0.62 -0.76 0.42 -0.78 0.05Z'
const FROZENPOND_SHEEN =
  'M-0.5 -0.1C-0.5 -0.35 -0.25 -0.48 0.02 -0.46C0.3 -0.44 0.48 -0.28 0.46 -0.05C0.44 0.16 0.2 0.28 -0.08 0.26C-0.35 0.24 -0.5 0.1 -0.5 -0.1Z'
const FROZENPOND_CRACKS = 'M-0.45 0.2L-0.1 0.02L0.15 0.1L0.5 -0.12M-0.15 -0.4L-0.02 -0.12L0.3 0.3'
const FROZENPOND_RIM =
  'M-0.76 0.02C-0.78 -0.32 -0.45 -0.56 -0.08 -0.58C-0.12 -0.45 -0.3 -0.44 -0.42 -0.32C-0.55 -0.2 -0.6 -0.05 -0.62 0.08C-0.7 0.1 -0.75 0.1 -0.76 0.02Z'

// SNOWDRIFT: wind-tailed drift — a two-tone elongated blob whose eastern end
// streamlines into a tapering tail (wind read); free rotation spins the tail.
const SNOWDRIFT_D =
  'M-0.85 0.02C-0.88 -0.22 -0.62 -0.38 -0.32 -0.36C-0.05 -0.35 0.3 -0.24 0.9 -0.04C0.55 0.06 0.15 0.18 -0.25 0.2C-0.6 0.22 -0.83 0.18 -0.85 0.02Z'
const SNOWDRIFT_CORE =
  'M-0.7 -0.04C-0.7 -0.2 -0.5 -0.3 -0.26 -0.29C-0.02 -0.28 0.25 -0.2 0.62 -0.07C0.35 -0.02 0.05 0.05 -0.25 0.07C-0.52 0.09 -0.68 0.07 -0.7 -0.04Z'

// ICICLE CLUSTER: a low rock lip with four translucent pale spikes jutting
// down-right (away from the light) — one multi-subpath triangle fan.
const ICICLECLUSTER_ROCK =
  'M-0.6 -0.12C-0.64 -0.4 -0.4 -0.58 -0.08 -0.6C0.24 -0.61 0.46 -0.44 0.46 -0.18C0.45 0.04 0.22 0.18 -0.1 0.17C-0.4 0.16 -0.57 0.08 -0.6 -0.12Z'
const ICICLECLUSTER_SPIKES =
  'M-0.38 0.1L-0.2 0.14L-0.31 0.62Z' +
  'M-0.12 0.14L0.06 0.15L-0.02 0.72Z' +
  'M0.12 0.12L0.3 0.08L0.28 0.6Z' +
  'M0.36 0.02L0.48 -0.06L0.55 0.42Z'

// ICE TREE: frozen dead snag from above — crooked bare limbs off a broken
// trunk disc, with snow/ice dabs clinging to the up-left (lit-side) limbs.
const ICETREE_BRANCHES =
  'M0 0.02L0.34 -0.2L0.5 -0.62M0.34 -0.2L0.66 -0.28M0 0.02L0.56 0.24L0.84 0.14M0 0.02L0.1 0.5L-0.1 0.8M0 0.02L-0.46 0.3L-0.78 0.24M0 0.02L-0.34 -0.34L-0.3 -0.76M-0.34 -0.34L-0.62 -0.44'
const ICETREE_TRUNK = ringPath(0.18)
const ICETREE_ICE =
  ringPath(0.08, -0.34, -0.34) + ringPath(0.07, -0.62, -0.44) + ringPath(0.065, -0.3, -0.72) + ringPath(0.06, -0.14, -0.12)

// ICE HUT (igloo) from above: shade dome + a lit snow cap nudged up-left (two
// distinct blobs, cairn-style — not a cutout pair, so the snow can stay muted),
// spiral block-course seams (two concentric arcs + radial ticks), and a dark
// entrance tunnel stub jutting down-right.
const ICEHUT_SHADOW = 'M0.6 0.18A0.55 0.34 0 1 0 0.62 0.22Z'
const ICEHUT_DOME = ringPath(0.55, -0.02, 0)
const ICEHUT_CAP = ringPath(0.4, -0.12, -0.1)
const ICEHUT_SEAMS =
  'M-0.44 0.1A0.44 0.44 0 0 1 -0.08 -0.44M0.1 -0.29A0.31 0.31 0 0 1 0.28 0.1M-0.3 -0.02L-0.16 -0.01M0.02 -0.36L0.04 -0.22M0.15 0.28L0.22 0.4'
const ICEHUT_DOOR = 'M0.24 0.4L0.52 0.28L0.62 0.5L0.34 0.62Z'

// ICE FLOE: three angular pale plates drifting over a waterDeep gap that shows
// between them (one multi-subpath plate layer), pale glint on two broken edges.
const ICEFLOE_GAP =
  'M-0.7 0.05C-0.72 -0.3 -0.4 -0.55 0 -0.56C0.4 -0.57 0.7 -0.32 0.7 0.02C0.7 0.35 0.4 0.55 0 0.55C-0.4 0.55 -0.68 0.35 -0.7 0.05Z'
const ICEFLOE_PLATES =
  'M-0.66 -0.05L-0.4 -0.44L-0.05 -0.3L-0.12 0.05L-0.45 0.18Z' +
  'M0.06 -0.4L0.5 -0.35L0.62 0L0.3 0.12L0.08 -0.08Z' +
  'M-0.25 0.28L0.12 0.2L0.3 0.42L-0.05 0.52Z'
const ICEFLOE_EDGE = 'M-0.4 -0.44L-0.05 -0.3M0.5 -0.35L0.62 0'

// ── volcanic props ─────────────────────────────────────────────────────
// ── volcanic props (glowing fissures, cooled flows, fumaroles, ash, char) ────
// Glowing FISSURE decal: one branching crack polyline (wider than `crack`),
// drawn three times — dark gape, cooling emberDeep mid, live ember core along
// the main run only (the single glow accent).
const LAVACRACK_MAIN = 'M-0.85 -0.28L-0.42 -0.16L-0.08 0.1L0.38 0.22L0.8 0.42M-0.42 -0.16L-0.28 -0.55M-0.08 0.1L-0.18 0.5M0.38 0.22L0.55 -0.12'
const LAVACRACK_CORE = 'M-0.78 -0.26L-0.42 -0.16L-0.08 0.1L0.38 0.22L0.72 0.38'

// Cooled OBSIDIAN lobe: a lumpy multi-lobe flow blob, near-black two-tone
// (stoneDark base under an ink lit face), one thin cream glint for the gloss.
const OBSIDIANFLOW_D = 'M-0.78 -0.1C-0.82 -0.42 -0.5 -0.58 -0.18 -0.48C0.02 -0.66 0.42 -0.6 0.55 -0.38C0.82 -0.34 0.92 -0.06 0.74 0.14C0.78 0.4 0.5 0.56 0.24 0.46C0.06 0.62 -0.3 0.58 -0.42 0.4C-0.7 0.4 -0.84 0.16 -0.78 -0.1Z'
const OBSIDIANFLOW_GLINT = 'M-0.45 -0.2Q-0.05 -0.4 0.4 -0.22'

// FUMAROLE: a low two-tone crater cone ringed by a sulfur crust, with a faint
// downwind sulfur stain fan and a dark vent throat.
const SULFURVENT_FAN = 'M0.05 0.08C0.4 -0.02 0.78 0.12 0.82 0.32C0.8 0.52 0.45 0.62 0.2 0.52C0.02 0.42 -0.02 0.22 0.05 0.08Z'
const SULFURVENT_CONE = ringPath(0.42)
const SULFURVENT_CRUST = ringPath(0.27)
const SULFURVENT_THROAT = ringPath(0.13)

// Soft ASH drift: wide low mound (snowpatch technique — dark wash + a pale
// wind-lit core offset up-left, no cutout pair) with a few unburnt flecks.
const ASHPILE_D = 'M-0.8 0.12C-0.85 -0.2 -0.5 -0.4 -0.12 -0.34C0.25 -0.46 0.68 -0.34 0.8 -0.05C0.88 0.2 0.6 0.4 0.22 0.44C-0.18 0.52 -0.62 0.44 -0.8 0.12Z'
const ASHPILE_CORE = 'M-0.52 0C-0.55 -0.2 -0.28 -0.3 -0.02 -0.26C0.22 -0.32 0.5 -0.22 0.55 -0.04C0.58 0.12 0.4 0.24 0.12 0.26C-0.18 0.3 -0.48 0.22 -0.52 0Z'
const ASHPILE_FLECKS = ringPath(0.045, -0.3, 0.05) + ringPath(0.035, 0.15, -0.12) + ringPath(0.04, 0.35, 0.18) + ringPath(0.03, -0.05, 0.28)

// CHARRED SNAG from above: bare ink limbs radiating from a burnt trunk disc
// (the coal-black cousin of mountain `snag`), two limb tips still smoldering —
// an emberDeep coal under a smaller live-ember dot at each.
const CHARSNAG_LIMBS = 'M0 0.02L0.32 -0.3L0.28 -0.72M0.32 -0.3L0.6 -0.42M0 0.02L0.72 0.16M0 0.02L-0.38 0.48L-0.7 0.62M-0.38 0.48L-0.32 0.8M0 0.02L-0.58 -0.26L-0.84 -0.18'
const CHARSNAG_TRUNK = ringPath(0.15)
const CHARSNAG_COALS = ringPath(0.07, 0.28, -0.72) + ringPath(0.06, -0.7, 0.62)
const CHARSNAG_TIPS = ringPath(0.04, 0.28, -0.72) + ringPath(0.032, -0.7, 0.62)

// GEYSER mouth: concentric mineral terraces — two-tone stone outer ring, a th2
// sulfur-crust ring, a dark rim, and the pale steaming pool dot at the center.
const GEYSERPOOL_TERRACE = ringPath(0.62)
const GEYSERPOOL_CRUST = ringPath(0.38)
const GEYSERPOOL_RIM = ringPath(0.24)
const GEYSERPOOL_POOL = ringPath(0.15)

// ── arcane props ─────────────────────────────────────────────────────
// ── arcane props (bannerBlue energy accents on rockDeep/rock stonework) ──────
// Carved STANDING RUNE STONE: a broad flat-topped tapered slab (visibly not the
// pointed `waystone` menhir or the leaning `obelisk`), three glowing rune ticks
// down the face.
const RUNESTONE_D = 'M-0.34 0.62L-0.42 -0.4L-0.22 -0.66L0.16 -0.72L0.38 -0.44L0.3 0.6Z'
// three angular runic marks, the middle one a kinked chevron
const RUNESTONE_RUNES = 'M-0.1 -0.46L0.08 -0.36M-0.12 -0.14L0.02 -0.26L0.12 -0.08M-0.1 0.12L0.08 0.22'

// LEVITATING SHARD: the shard cutout hangs up-left of its own detached soft
// shadow — the gap between body and shadow sells the float.
const FLOATSHARD_SHADOW = 'M-0.1 0.38A0.28 0.13 0 1 0 0.46 0.38A0.28 0.13 0 1 0 -0.1 0.38Z'
const FLOATSHARD_D = 'M-0.52 -0.24L-0.28 -0.64L0.08 -0.54L0.18 -0.16L-0.16 0Z'
const FLOATSHARD_GLINT = 'M-0.52 -0.24L-0.28 -0.64L0.08 -0.54'

// GLOWING MANA POOL decal (murkpool's flat-blob build, arcane-blue): dark pool,
// bright inner welling, one thin cream rim glint on the up-left lip.
const MANAPOOL_D = 'M0.74 0.02Q0.72 -0.32 0.4 -0.44Q0.1 -0.6 -0.24 -0.48Q-0.6 -0.42 -0.7 -0.12Q-0.78 0.2 -0.5 0.4Q-0.2 0.58 0.16 0.5Q0.6 0.4 0.74 0.02Z'
const MANAPOOL_CORE = 'M0.4 0Q0.36 -0.22 0.12 -0.28Q-0.16 -0.36 -0.36 -0.18Q-0.5 0 -0.36 0.18Q-0.16 0.36 0.1 0.3Q0.36 0.22 0.4 0Z'
const MANAPOOL_GLINT = 'M-0.56 -0.26Q-0.2 -0.5 0.28 -0.38'

// Inscribed RITUAL CIRCLE decal: two concentric inked rings, a triangle strung
// between them, three glowing node dots on the outer ring at the vertices.
const MAGICCIRCLE_RINGS = ringPath(0.62) + ringPath(0.42)
const MAGICCIRCLE_TRI = 'M0 -0.52L-0.45 0.26L0.45 0.26Z'
const MAGICCIRCLE_NODES = ringPath(0.07, 0, -0.62) + ringPath(0.07, -0.537, 0.31) + ringPath(0.07, 0.537, 0.31)

// Freestanding BROKEN PORTAL frame, top-down: two ragged pillar stubs (one
// multi-subpath cutout) with a faint arcane shimmer arcing across the gap.
const PORTALFRAME_D =
  'M-0.78 0.44L-0.84 -0.28L-0.64 -0.52L-0.44 -0.32L-0.46 0.46Z' +
  'M0.46 0.44L0.42 -0.34L0.6 -0.54L0.8 -0.28L0.76 0.46Z'
const PORTALFRAME_SHIMMER = 'M-0.5 -0.16Q0 -0.7 0.48 -0.18'
const PORTALFRAME_HAZE = 'M-0.54 0.04Q0 -0.46 0.52 0.02'

// Tall ARCANE CRYSTAL spire: one big faceted spike + two satellite shards, all
// one two-tone cutout, with a cream facet-seam glint.
const CRYSTALSPIRE_SHADOW = 'M-0.3 0.52A0.42 0.18 0 1 0 0.54 0.52A0.42 0.18 0 1 0 -0.3 0.52Z'
const CRYSTALSPIRE_D =
  'M-0.08 0.5L-0.32 0.08L-0.2 -0.55L0.04 -0.88L0.3 -0.35L0.2 0.42Z' +
  'M-0.66 0.36L-0.5 -0.06L-0.3 0.4Z' +
  'M0.36 0.46L0.54 0.08L0.68 0.44Z'
const CRYSTALSPIRE_GLINT = 'M0.02 -0.76L-0.1 0.36M-0.5 0.02L-0.44 0.24'

// ── connective structure props ──────────────────────────────────────────
// Plank footbridge: deck of cross-planks between two side rails (span reads
// horizontally; the placer's upright wobble keeps it roughly axis-aligned).
const BRIDGEPLANK_D = (() => {
  let d = ''
  for (let i = 0; i < 7; i++) d += rectD(-0.82 + i * 0.24, -0.38, 0.2, 0.76)
  return d
})()
const BRIDGEPLANK_RAILS = 'M-0.85 -0.44L0.85 -0.44M-0.85 0.44L0.85 0.44'

// Stone arch bridge from above: dressed deck slab, parapet edges, masonry
// seams with a keystone line at mid-span.
const BRIDGESTONE_D = rectD(-0.85, -0.42, 1.7, 0.84)
const BRIDGESTONE_SEAMS = 'M-0.55 -0.42L-0.55 0.42M-0.28 -0.42L-0.28 0.42M0 -0.42L0 0.42M0.28 -0.42L0.28 0.42M0.55 -0.42L0.55 0.42'
const BRIDGESTONE_PARAPET = 'M-0.85 -0.42L0.85 -0.42M-0.85 0.42L0.85 0.42'

// Rope bridge: two inward-sagging side ropes + slat run with two missing slats.
const BRIDGEROPE_ROPES = 'M-0.85 -0.36Q0 -0.24 0.85 -0.36M-0.85 0.36Q0 0.24 0.85 0.36'
const BRIDGEROPE_SLATS = (() => {
  let d = ''
  for (const x of [-0.74, -0.54, -0.34, 0.06, 0.26, 0.66]) d += rectD(x, -0.28, 0.14, 0.56)
  return d
})()

// Fence gate (state pair): two round post tops + a plank panel between them;
// the open state swings the same panel ~75° from the left post hinge.
const WOODGATE_D = ringPath(0.13, -0.7, 0) + ringPath(0.13, 0.7, 0) + rectD(-0.57, -0.09, 1.14, 0.18)
const WOODGATE_BRACE = 'M-0.52 -0.07L0.52 0.07'
const WOODGATEOPEN_D = ringPath(0.13, -0.7, 0) + ringPath(0.13, 0.7, 0) + 'M-0.613 0.023L-0.787 -0.023L-0.541 -0.941L-0.367 -0.895Z'
const WOODGATEOPEN_BRACE = 'M-0.73 -0.06L-0.42 -0.86'

// Portcullis: stone jambs + an iron lattice (two-tone like `chains`).
const PORTCULLIS_JAMBS = rectD(-0.85, -0.5, 0.25, 1) + rectD(0.6, -0.5, 0.25, 1)
const PORTCULLIS_GRID = 'M-0.45 -0.42L-0.45 0.42M-0.15 -0.42L-0.15 0.42M0.15 -0.42L0.15 0.42M0.45 -0.42L0.45 0.42M-0.58 -0.28L0.58 -0.28M-0.58 0L0.58 0M-0.58 0.28L0.58 0.28'
const PORTCULLIS_GRID_HI = 'M-0.45 -0.42L-0.45 0.42M0.15 -0.42L0.15 0.42M-0.58 0L0.58 0'

// Ruined gate: one standing jamb, one toppled slab, splintered plank scraps.
const BROKENGATE_D = rectD(-0.8, -0.5, 0.24, 1) + 'M0.05 0.28L0.75 0.05L0.82 0.22L0.12 0.45Z'
const BROKENGATE_SPLINTERS = 'M-0.3 -0.05L-0.05 -0.18L-0.12 0.02ZM0.2 -0.3L0.42 -0.38L0.3 -0.15ZM-0.45 0.3L-0.28 0.22L-0.35 0.42Z'

// Cave mouth: rocky arch blob around a dark maw, scree at the lip.
const CAVEMOUTH_D = blobPath(lobeRing(7, 0.74, 0.6))
const CAVEMOUTH_MAW = 'M-0.42 0.2A0.42 0.32 0 1 0 0.42 0.2A0.42 0.32 0 1 0 -0.42 0.2Z'
const CAVEMOUTH_SCREE = ringPath(0.09, -0.3, 0.58) + ringPath(0.07, 0.05, 0.64) + ringPath(0.08, 0.38, 0.56)

// Mine adit: dark opening framed by timber uprights + a lintel, rail stubs out.
const MINEENTRANCE_MAW = rectD(-0.36, -0.36, 0.72, 0.78)
const MINEENTRANCE_BEAMS = 'M-0.44 -0.5L-0.44 0.46M0.44 -0.5L0.44 0.46'
const MINEENTRANCE_LINTEL = 'M-0.58 -0.46L0.58 -0.46'
const MINEENTRANCE_RAILS = 'M-0.12 0.44L-0.12 0.88M0.12 0.44L0.12 0.88'

// Stairwell: banded steps descending into ink.
const STAIRDOWN_WELL = rectD(-0.5, -0.62, 1, 1.24)
const STAIRDOWN_S1 = rectD(-0.44, -0.56, 0.88, 0.26)
const STAIRDOWN_S2 = rectD(-0.44, -0.27, 0.88, 0.26)
const STAIRDOWN_S3 = rectD(-0.44, 0.02, 0.88, 0.26)
const STAIRDOWN_PIT = rectD(-0.44, 0.31, 0.88, 0.28)

// Ladder over a dark hatch: rails + rungs across an ink circle.
const LADDER_HATCH = ringPath(0.36)
const LADDER_RAILS = 'M-0.16 -0.72L-0.16 0.72M0.16 -0.72L0.16 0.72'
const LADDER_RUNGS = 'M-0.16 -0.52L0.16 -0.52M-0.16 -0.26L0.16 -0.26M-0.16 0L0.16 0M-0.16 0.26L0.16 0.26M-0.16 0.52L0.16 0.52'

// Cellar hatch: stone frame around two plank leaves with a ring handle.
const CELLARHATCH_FRAME = rectD(-0.55, -0.45, 1.1, 0.9)
const CELLARHATCH_LEAVES = rectD(-0.45, -0.35, 0.42, 0.7) + rectD(0.03, -0.35, 0.42, 0.7)
const CELLARHATCH_HANDLE = ringPath(0.07, 0.24, 0)

// Roadside shrine: stone base, roofed niche, dark recess, votive ember.
const SHRINE_BASE = rectD(-0.4, 0.05, 0.8, 0.45)
const SHRINE_NICHE = 'M-0.3 0.05L-0.3 -0.35L0 -0.6L0.3 -0.35L0.3 0.05Z'
const SHRINE_RECESS = 'M-0.16 0.05L-0.16 -0.28L0 -0.42L0.16 -0.28L0.16 0.05Z'
const SHRINE_VOTIVE = ringPath(0.06, 0, -0.08)

// Waypoint bonfire: a wider seeded stone ring than campring, log tripod, big
// two-stage flame.
const BONFIRE_STONES = (() => {
  const seed = hashString('bonfire')
  let d = ''
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (hash01(seed + i * 373) - 0.5) * 0.25
    const rad = 0.72 + (hash01(seed + i * 373 + 131) - 0.5) * 0.08
    const r = 0.11 + hash01(seed + i * 373 + 211) * 0.05
    d += ringPath(r, r3(Math.cos(a) * rad), r3(Math.sin(a) * rad))
  }
  return d
})()
const BONFIRE_LOGS = 'M0 0.05L-0.38 -0.3M0 0.05L0.4 -0.26M0 0.05L0.02 0.42'
const BONFIRE_FLAME = 'M-0.26 0.1C-0.32 -0.14 -0.14 -0.32 0.04 -0.28C0.24 -0.24 0.32 -0.02 0.22 0.16C0.08 0.32 -0.16 0.28 -0.26 0.1Z'

// ── cave / underground props ─────────────────────────────────────────────────────
// STALAGMITE: two concentric-ringed cone discs (one big, one small) sharing one
// two-tone rockDeep/rock cutout (both cones' outer rims in one multi-subpath d),
// a flat stoneBase mid-ring per cone for the "concentric" contour read, and a
// pale cream tip dot per cone offset up-left as the light-caught peak.
const STALAGMITE_OUTER = ringPath(0.5, 0.08, 0.08) + ringPath(0.26, -0.42, -0.4)
const STALAGMITE_MID = ringPath(0.3, 0.08, 0.08) + ringPath(0.16, -0.42, -0.4)
const STALAGMITE_TIP = ringPath(0.08, -0.04, -0.04) + ringPath(0.05, -0.5, -0.48)

// STALACTITE: a soft down-right ground shadow disc under a small pale
// rockDeep/cream tip disc offset up-left — the shadow implies the ceiling
// spike hangs above the point where its shadow lands.
const STALACTITE_SHADOW = ringPath(0.28, 0.12, 0.14)
const STALACTITE_TIP = ringPath(0.2, -0.12, -0.12)

// CRYSTALCLUSTER: 4 clumped angular shards (one center-tall + 3 short
// satellites, all shorter and more tightly packed than the existing tall
// `crystalspire`), one bannerBlueDk/bannerBlue two-tone cutout, cast shadow,
// one cream facet glint.
const CRYSTALCLUSTER_SHADOW = 'M-0.2 0.42A0.3 0.13 0 1 0 0.4 0.42A0.3 0.13 0 1 0 -0.2 0.42Z'
const CRYSTALCLUSTER_D =
  'M-0.06 0.4L-0.2 0.05L-0.04 -0.5L0.12 -0.12L0.2 0.38Z' +
  'M-0.5 0.32L-0.36 -0.02L-0.18 0.3Z' +
  'M0.32 0.36L0.46 0.02L0.62 0.34Z' +
  'M0.05 0.42L0.22 0.15L0.34 0.44Z'
const CRYSTALCLUSTER_GLINT = 'M-0.02 0.32L0 -0.42M-0.42 0.22L-0.36 0'

// CAVEPOOL: still waterDeep blob (blobPath/lobeRing, matches murkpool's flat
// no-cutout decal style), one thin waterHi rim-glint arc, two pale cream
// drip-ring dots where ceiling drips have pocked the surface.
const CAVEPOOL_D = blobPath(lobeRing(6, 0.6, 0.46, 0.02, 0.02))
const CAVEPOOL_RIM = 'M-0.42 -0.18Q-0.1 -0.44 0.32 -0.22'
// asymmetric drips (judge pass: two same-size dots side by side read as eyes)
const CAVEPOOL_DOTS = ringPath(0.055, -0.28, 0.16) + ringPath(0.03, 0.24, -0.14)

// GLOWWORMS: a seeded scatter of tiny glowFungus dots (gravelD-style helper,
// prefixed distinctly so it doesn't collide with the existing `gravelD`) over
// a faint flat low-opacity glow blob, matching glowshroom's glow-disc read.
const glowwormScatterD = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 733) - 0.5) * 1.1
    const y = (hash01(seed + i * 733 + 271) - 0.5) * 0.9
    const r = 0.03 + hash01(seed + i * 733 + 409) * 0.03
    d += ringPath(r, r3(x), r3(y))
  }
  return d
}
const GLOWWORMS_DOTS_D = glowwormScatterD(hashString('glowworms'), 9)

// FLOWSTONE: 3 stacked smooth crescent lobes (leafD lenses stacked top-to-
// bottom, widening downward like a draped terrace) in one rock/stoneBase
// two-tone cutout, plus two faint rib seams marking the lobe boundaries.
const FLOWSTONE_D =
  leafD(0.05, -0.42, 0.38, 0.14, 0.15) +
  leafD(0, -0.05, 0.5, 0.18, -0.1) +
  leafD(-0.03, 0.38, 0.6, 0.2, 0.05)
const FLOWSTONE_RIBS = 'M-0.3 -0.2Q0.05 -0.28 0.35 -0.15M-0.35 0.15Q0 0.05 0.35 0.2'

// ── jungle props ─────────────────────────────────────────────────────
// hangvines — canopy-edge bar + 6 trailing vine strands (deep + lit subset),
// each strand ending in 1-2 leafD leaves.
const HANGVINES_BAR = 'M-0.85 -0.62Q0 -0.72 0.85 -0.62'
const HANGVINES_VINES = 'M-0.78 -0.55Q-0.84 -0.05 -0.72 0.48M-0.46 -0.56Q-0.38 0.05 -0.5 0.66M-0.15 -0.58Q-0.07 0.1 -0.16 0.74M0.15 -0.56Q0.23 0 0.14 0.55M0.46 -0.58Q0.54 0.08 0.44 0.7M0.78 -0.55Q0.86 -0.02 0.72 0.46'
const HANGVINES_VINES_LIT = 'M-0.46 -0.56Q-0.38 0.05 -0.5 0.66M-0.15 -0.58Q-0.07 0.1 -0.16 0.74M0.46 -0.58Q0.54 0.08 0.44 0.7'
const HANGVINES_LEAF_TIP1 = leafD(-0.72, 0.48, 0.13, 0.065, 2.0)
const HANGVINES_LEAF_TIP2 = leafD(-0.5, 0.66, 0.14, 0.07, 1.85)
const HANGVINES_LEAF_MID2 = leafD(-0.55, 0.42, 0.1, 0.05, 2.1)
const HANGVINES_LEAF_TIP3 = leafD(-0.16, 0.74, 0.15, 0.075, 1.6)
const HANGVINES_LEAF_TIP4 = leafD(0.14, 0.55, 0.12, 0.06, 1.5)
const HANGVINES_LEAF_TIP5 = leafD(0.44, 0.7, 0.14, 0.07, 1.3)
const HANGVINES_LEAF_MID5 = leafD(0.5, 0.44, 0.1, 0.05, 1.1)
const HANGVINES_LEAF_TIP6 = leafD(0.72, 0.46, 0.13, 0.065, 1.0)
const HANGVINES_LEAVES_DEEP = HANGVINES_LEAF_TIP1 + HANGVINES_LEAF_TIP2 + HANGVINES_LEAF_MID2 + HANGVINES_LEAF_TIP3 + HANGVINES_LEAF_TIP4 + HANGVINES_LEAF_TIP5 + HANGVINES_LEAF_MID5 + HANGVINES_LEAF_TIP6
const HANGVINES_LEAVES_LIT = HANGVINES_LEAF_TIP2 + HANGVINES_LEAF_TIP3 + HANGVINES_LEAF_TIP5

// giantleaf — 2 huge paddle-leaf lenses (notches baked into the outline as
// small inward L-dips) sharing a base, + a center rib stroke per leaf.
const GIANTLEAF_A = 'M-0.08 0.76C-0.34 0.6 -0.5 0.28 -0.52 -0.06L-0.62 -0.02C-0.66 -0.2 -0.58 -0.3 -0.48 -0.34C-0.56 -0.52 -0.5 -0.66 -0.36 -0.76C-0.2 -0.86 -0.02 -0.84 0.06 -0.7C0.14 -0.4 0.16 -0.02 0.1 0.34C0.06 0.54 0 0.68 -0.08 0.76Z'
const GIANTLEAF_B = 'M0.1 0.72C0.36 0.54 0.52 0.22 0.52 -0.12L0.64 -0.06C0.68 -0.24 0.6 -0.34 0.5 -0.38C0.58 -0.56 0.52 -0.7 0.38 -0.8C0.22 -0.9 0.04 -0.86 -0.04 -0.72C-0.12 -0.42 -0.14 -0.04 -0.06 0.32C-0.02 0.52 0.02 0.64 0.1 0.72Z'
const GIANTLEAF_D = GIANTLEAF_A + GIANTLEAF_B
const GIANTLEAF_RIB = 'M-0.06 0.7Q-0.2 0.05 -0.14 -0.72M0.08 0.68Q0.22 0.02 0.16 -0.74'
const GIANTLEAF_SHADOW = 'M-0.4 0.78C-0.2 0.66 0.3 0.66 0.5 0.8C0.36 0.96 -0.26 0.96 -0.4 0.78Z'

// bamboo — tight cluster of 6 ringed culm cross-sections (cutout foliage/
// pineLit) + cream node dots + 2 thin leaf-blade strokes.
const BAMBOO_CULMS = ringPath(0.2, -0.34, -0.18) + ringPath(0.18, 0.02, -0.32) + ringPath(0.19, 0.36, -0.14) + ringPath(0.21, -0.18, 0.16) + ringPath(0.17, 0.2, 0.28) + ringPath(0.16, -0.4, 0.32)
const BAMBOO_NODES = ringPath(0.05, -0.37, -0.21) + ringPath(0.045, -0.01, -0.35) + ringPath(0.05, 0.33, -0.17) + ringPath(0.055, -0.21, 0.13) + ringPath(0.045, 0.17, 0.25) + ringPath(0.04, -0.43, 0.29)
const BAMBOO_LEAVES = 'M-0.48 -0.32Q-0.72 -0.55 -0.9 -0.74M0.4 0.34Q0.64 0.54 0.86 0.7'
const BAMBOO_SHADOW = 'M-0.55 0.42C-0.3 0.56 0.35 0.56 0.58 0.4C0.5 0.64 -0.48 0.64 -0.55 0.42Z'

// exoticbloom — layered pointed petals (bloom outer star + cream inner star)
// over a pair of dark leaves, one bannerGold stamen dot.
const EXOTICBLOOM_LEAVES = leafD(-0.3, 0.55, 0.28, 0.12, 2.5) + leafD(0.3, 0.55, 0.28, 0.12, 0.65)
const EXOTICBLOOM_OUTER = starPath(6, 0.62, 0.24, 0)
const EXOTICBLOOM_INNER = starPath(6, 0.34, 0.13, 0.52)
const EXOTICBLOOM_STAMEN = ringPath(0.07, 0, -0.02)
const EXOTICBLOOM_SHADOW = 'M-0.42 0.66C-0.2 0.78 0.26 0.78 0.46 0.64C0.36 0.86 -0.3 0.86 -0.42 0.66Z'

// ── forest & desert fills props ─────────────────────────────────────────────────────
// bramble: a denser two-layer scribble tangle than `tumbleweed` (7 dark outer
// strokes + 4 woodDeep inner twigs, lit), tiny thorn ticks off the branches,
// a few dried-blood berry dots.
const BRAMBLE_TANGLE_OUT =
  'M-0.55 -0.2C-0.35 -0.62 0.32 -0.6 0.52 -0.15M-0.4 0.5C-0.65 0.05 -0.12 -0.55 0.4 -0.42' +
  'M0.52 0.3C0.18 0.62 -0.42 0.42 -0.32 -0.18M-0.05 -0.58C0.4 -0.35 0.5 0.3 0.02 0.48' +
  'M-0.58 0.18C-0.4 -0.2 0.2 -0.42 0.45 -0.22M0.15 -0.6C0.5 -0.28 0.3 0.18 -0.12 0.15' +
  'M-0.55 -0.02C-0.3 0.25 0.08 -0.08 -0.18 -0.4'
const BRAMBLE_TANGLE_IN =
  'M-0.28 -0.28C0 -0.5 0.32 -0.12 0.18 0.25M0.32 -0.32C0.05 0.05 -0.32 0.1 -0.4 0.05' +
  'M-0.15 0.38C-0.28 0.05 0.15 -0.18 0.32 0.02M0.02 -0.48Q0.28 -0.32 0.12 -0.02'
const BRAMBLE_THORNS =
  'M-0.35 -0.4L-0.28 -0.48M0.1 -0.55L0.18 -0.48M0.45 -0.05L0.54 0.02' +
  'M0.3 0.4L0.38 0.46M-0.5 0.15L-0.58 0.08M-0.15 0.45L-0.08 0.52'
const BRAMBLE_BERRIES =
  'M-0.2 -0.1A0.05 0.05 0 1 0 -0.1 -0.1A0.05 0.05 0 1 0 -0.2 -0.1Z' +
  'M0.15 0.05A0.045 0.045 0 1 0 0.24 0.05A0.045 0.045 0 1 0 0.15 0.05Z' +
  'M-0.05 0.3A0.05 0.05 0 1 0 0.05 0.3A0.05 0.05 0 1 0 -0.05 0.3Z'

// beehive: a hanging paper-nest teardrop built from two stacked thatch-tone
// bands (th4 top+tip / th2 mid), an ink entrance dot, all shifted up-left off
// the origin so a separate down-right ground shadow reads DETACHED — the gap
// is what sells "hanging from a branch" in a top-down view.
const BEEHIVE_LIGHT = 'M-0.42 -0.58L0.22 -0.58L0.32 -0.3L-0.52 -0.3Z' + 'M-0.4 0L0.2 0L-0.1 0.32Z'
const BEEHIVE_DARK = 'M-0.52 -0.3L0.32 -0.3L0.2 0L-0.4 0Z'

// toadstoolring: a seeded ring (CAMPRING_STONES' technique) of 7 tiny mushrooms
// around an EMPTY center — caps reuse `mushroom`'s exact MUSHCAP_D control
// points (translated + scaled per instance) so the cap tones match; stems are
// small cream rects drawn first so the caps overlap and hide their tops.
const TOADCAP_PTS: [number, number][] = [
  [-0.55, -0.02], [-0.56, -0.5], [0.54, -0.52], [0.55, -0.04], [0.28, 0.05], [-0.28, 0.06], [-0.55, -0.02],
]
const toadMushcapAt = (cx: number, cy: number, s: number): string => {
  const T = (i: number) => `${r3(cx + TOADCAP_PTS[i][0] * s)} ${r3(cy + TOADCAP_PTS[i][1] * s)}`
  return `M${T(0)}C${T(1)} ${T(2)} ${T(3)}C${T(4)} ${T(5)} ${T(6)}Z`
}
const toadStemAt = (cx: number, cy: number, s: number): string =>
  rectD(cx - 0.045 * s, cy - 0.02 * s, 0.09 * s, 0.36 * s)
const TOADSTOOLRING = (() => {
  const seed = hashString('toadstoolring')
  const n = 7
  let caps = '', stems = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (hash01(seed + i * 191) - 0.5) * 0.25
    const rad = 0.5 + (hash01(seed + i * 191 + 61) - 0.5) * 0.2
    const s = 0.24 + hash01(seed + i * 191 + 127) * 0.06
    const cx = r3(Math.cos(a) * rad), cy = r3(Math.sin(a) * rad)
    caps += toadMushcapAt(cx, cy, s)
    stems += toadStemAt(cx, cy, s)
  }
  return { caps, stems }
})()

// quicksand: concentric sand/sandLit target-rings (largest-first, so each
// smaller circle drawn on top leaves the outer tone as a visible ring) under a
// faint inward spiral stroke + one half-sunk stick.
const quicksandSpiralD = (turns: number, r0: number, steps: number): string => {
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * turns * Math.PI * 2
    const r = r0 * (1 - t * 0.82)
    d += (i ? 'L' : 'M') + r3(Math.cos(a) * r) + ' ' + r3(Math.sin(a) * r)
  }
  return d
}
const QUICKSAND_SPIRAL = quicksandSpiralD(2.4, 0.55, 18)

// digspot: two overlapping dirtPath mounds (one multi-subpath fill), a small
// flung-crumb fan, and a subtle woodDeep X dig-marker between them.
const DIGSPOT_MOUNDS =
  'M-0.5 0.1C-0.55 -0.15 -0.3 -0.28 -0.08 -0.2C0.05 -0.12 0.02 0.15 -0.15 0.22C-0.35 0.3 -0.48 0.25 -0.5 0.1Z' +
  'M0.55 0.15C0.6 -0.1 0.35 -0.24 0.12 -0.16C-0.02 -0.08 0.02 0.2 0.2 0.26C0.4 0.32 0.53 0.28 0.55 0.15Z'
const DIGSPOT_CRUMBS =
  'M0.15 -0.4A0.045 0.045 0 1 0 0.24 -0.4A0.045 0.045 0 1 0 0.15 -0.4Z' +
  'M0.3 -0.5A0.04 0.04 0 1 0 0.38 -0.5A0.04 0.04 0 1 0 0.3 -0.5Z' +
  'M0.05 -0.55A0.05 0.05 0 1 0 0.15 -0.55A0.05 0.05 0 1 0 0.05 -0.55Z' +
  'M0.35 -0.32A0.035 0.035 0 1 0 0.42 -0.32A0.035 0.035 0 1 0 0.35 -0.32Z' +
  'M-0.1 -0.48A0.04 0.04 0 1 0 -0.02 -0.48A0.04 0.04 0 1 0 -0.1 -0.48Z'
const DIGSPOT_XMARK = 'M-0.12 -0.02L0.12 0.18M0.12 -0.02L-0.12 0.18'

// ── shore & beach fills props ─────────────────────────────────────────────────────
// PIER: four wide contiguous deck planks (wider than plankwalk's) running the
// dock's length + two ink seam lines between them + two mooring-post dots at
// the far (water) end.
const PIER_D = rectD(-0.78, -0.62, 1.56, 0.28) + rectD(-0.78, -0.3, 1.56, 0.28) + rectD(-0.78, 0.02, 1.56, 0.28) + rectD(-0.78, 0.34, 1.56, 0.28)
const PIER_SEAMS = 'M-0.78 -0.34L0.78 -0.34M-0.78 -0.02L0.78 -0.02M-0.78 0.3L0.78 0.3'
const PIER_POSTS = ringPath(0.1, -0.35, 0.78) + ringPath(0.1, 0.35, 0.78)

// BUOY: flat mooring float disc + a lit cap dot + one tiny ripple arc beside it.
const BUOY_BODY = ringPath(0.28)
const BUOY_CAP = ringPath(0.11, 0, -0.05)
const BUOY_RIPPLE = 'M0.42 0.08A0.22 0.14 0 0 1 0.1 0.32'

// ALGAEMAT: an irregular floating blob — a hexagon-ish point ring radially
// jittered per-point (seeded), smoothed by blobPath — + four seeded fleck dots.
const ALGAEMAT_SEED = hashString('algaemat')
const ALGAEMAT_PTS: Pt[] = lobeRing(6, 0.55, 0.55, 0, 0).map((p, i) => {
  const j = (hash01(ALGAEMAT_SEED + i * 71) - 0.5) * 0.3
  const ang = Math.atan2(p.y, p.x)
  return { x: p.x + Math.cos(ang) * j, y: p.y + Math.sin(ang) * j }
})
const ALGAEMAT_D = blobPath(ALGAEMAT_PTS)
const ALGAEMAT_FLECKS = (() => {
  let d = ''
  for (let i = 0; i < 4; i++) {
    const a = hash01(ALGAEMAT_SEED + i * 191) * Math.PI * 2
    const r = 0.15 + hash01(ALGAEMAT_SEED + i * 191 + 53) * 0.3
    d += ringPath(0.035, r3(Math.cos(a) * r), r3(Math.sin(a) * r))
  }
  return d
})()

// SEASHELLS: five tiny seeded fan-shell lenses (leafD, alternating cream/bloom,
// one path per tone — multi-subpath) + growth-arc ridge strokes on shell #0.
const SEASHELL_SEED = hashString('seashells')
const SEASHELL_PTS = Array.from({ length: 5 }, (_, i) => {
  const x = (hash01(SEASHELL_SEED + i * 233) - 0.5) * 1.3
  const y = (hash01(SEASHELL_SEED + i * 233 + 71) - 0.5) * 1.0
  const len = 0.1 + hash01(SEASHELL_SEED + i * 233 + 149) * 0.06
  const ang = hash01(SEASHELL_SEED + i * 233 + 307) * Math.PI
  return { x, y, len, ang }
})
const SEASHELLS_CREAM_D = SEASHELL_PTS.filter((_, i) => i % 2 === 0).map((p) => leafD(p.x, p.y, p.len, p.len * 0.55, p.ang)).join('')
const SEASHELLS_BLOOM_D = SEASHELL_PTS.filter((_, i) => i % 2 === 1).map((p) => leafD(p.x, p.y, p.len, p.len * 0.55, p.ang)).join('')
const SEASHELLS_RIDGES = (() => {
  const p = SEASHELL_PTS[0]
  const dx = Math.cos(p.ang), dy = Math.sin(p.ang)
  const px = -dy, py = dx
  let d = ''
  for (const rad of [p.len * 0.5, p.len * 0.85]) {
    const x0 = p.x + px * rad, y0 = p.y + py * rad
    const x1 = p.x - px * rad, y1 = p.y - py * rad
    d += `M${r3(x0)} ${r3(y0)}A${r3(rad)} ${r3(rad * 0.6)} 0 0 1 ${r3(x1)} ${r3(y1)}`
  }
  return d
})()

// TIDEPOOL: a seeded ring of 8 small stones around a jittered round pool blob +
// one glint arc + a tiny 5-point starfish dot.
const TIDEPOOL_SEED = hashString('tidepool')
const TIDEPOOL_STONES = (() => {
  let d = ''
  const n = 8
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (hash01(TIDEPOOL_SEED + i * 53) - 0.5) * 0.5
    const r = 0.5 + (hash01(TIDEPOOL_SEED + i * 53 + 19) - 0.5) * 0.12
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.82
    const rad = 0.08 + hash01(TIDEPOOL_SEED + i * 53 + 37) * 0.05
    d += ringPath(rad, r3(x), r3(y))
  }
  return d
})()
const TIDEPOOL_POOL_D = blobPath(lobeRing(7, 0.4, 0.4, 0, 0).map((p, i) => {
  const j = (hash01(TIDEPOOL_SEED + i * 89 + 500) - 0.5) * 0.12
  const ang = Math.atan2(p.y, p.x)
  return { x: p.x + Math.cos(ang) * j, y: p.y + Math.sin(ang) * j }
}))
const TIDEPOOL_GLINT = 'M-0.12 -0.16Q0.02 -0.06 0.14 -0.2'
const TIDEPOOL_STARFISH = (() => {
  const cx = 0.16, cy = 0.14, ro = 0.09, ri = 0.035, n = 5
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const a = 0.3 + (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? ri : ro
    d += (i ? 'L' : 'M') + r3(cx + Math.cos(a) * r) + ' ' + r3(cy + Math.sin(a) * r)
  }
  return d + 'Z'
})()

// CORAL: a small jittered sand blob under a branching antler coral skeleton
// (one multi-subpath M/L/Q stroke, drawn twice — bloom base, cream lit).
const CORAL_SEED = hashString('coral')
const CORAL_SAND_D = blobPath(lobeRing(6, 0.42, 0.42, 0.02, 0.15).map((p, i) => {
  const j = (hash01(CORAL_SEED + i * 61) - 0.5) * 0.1
  const ang = Math.atan2(p.y - 0.15, p.x - 0.02)
  return { x: p.x + Math.cos(ang) * j, y: p.y + Math.sin(ang) * j }
}))
const CORAL_BRANCHES_D = 'M-0.08 0.32Q-0.22 0.06 -0.18 -0.22M-0.18 -0.22L-0.32 -0.42M-0.18 -0.22L-0.04 -0.46M0.06 0.34Q0.16 0.04 0.1 -0.28M0.1 -0.28L-0.02 -0.5M0.1 -0.28L0.26 -0.44M0.28 0.3Q0.34 0.06 0.26 -0.14M0.26 -0.14L0.4 -0.28'

// SANDCASTLE: rectangular keep + a turret pair (all one two-tone multi-subpath
// cutout) + a hand-drawn stick-and-pennant flag stroke.
const SANDCASTLE_D = rectD(-0.42, -0.12, 0.84, 0.62) + ringPath(0.15, -0.3, -0.22) + ringPath(0.15, 0.3, -0.22)
const SANDCASTLE_FLAG = 'M0 -0.22L0 -0.72L0.2 -0.62L0 -0.52'

// ── city & dungeon furniture props ─────────────────────────────────────────────────────
// ── marketstall (plaza) ──
const MARKETSTALL_SHADOW = rectD(-0.6, 0.05, 1.15, 0.4)
const MARKETSTALL_CANOPY_BASE = rectD(-0.62, -0.62, 1.24, 0.6)
// three cream stripes as ONE multi-subpath, laid over the bannerBlue cloth base
const MARKETSTALL_STRIPES = rectD(-0.49, -0.58, 0.16, 0.54) + rectD(-0.15, -0.58, 0.16, 0.54) + rectD(0.19, -0.58, 0.16, 0.54)
const MARKETSTALL_POSTS = ringPath(0.06, -0.5, 0.15) + ringPath(0.06, 0.5, 0.15)
const MARKETSTALL_CRATE = rectD(0.28, 0.12, 0.3, 0.32)

// ── bench (plaza) ──
// two planks as one multi-subpath so the cutout() pair stays at 2 paths total
const BENCH_PLANKS = rectD(-0.75, -0.2, 1.5, 0.17) + rectD(-0.75, 0.03, 1.5, 0.17)
const BENCH_FRAME = 'M-0.75 -0.22L-0.75 0.22M0.75 -0.22L0.75 0.22'
const BENCH_SHADOW = rectD(-0.65, 0.24, 1.25, 0.1)

// ── awning (plaza) ──
const AWNING_BASE = rectD(-0.65, -0.72, 1.3, 0.6)
const AWNING_STRIPES = rectD(-0.5, -0.7, 0.16, 0.56) + rectD(-0.16, -0.7, 0.16, 0.56) + rectD(0.18, -0.7, 0.16, 0.56)
// scalloped front edge: 5 small filled lens-bumps (M-arc-Z closes each with a
// straight chord, so it reads as a fringe of half-discs) along the outer hem
const AWNING_SCALLOPS = [-0.52, -0.26, 0, 0.26, 0.52]
  .map((cx) => `M${r3(cx - 0.13)} -0.1A0.13 0.13 0 0 1 ${r3(cx + 0.13)} -0.1Z`)
  .join('')
const AWNING_TIES = 'M-0.35 -0.75L-0.35 -0.68M0.35 -0.75L0.35 -0.68'

// ── hanglantern (plaza) ──
// the shadow sits on the GROUND (center-ish); the lamp itself hangs offset
// up-left of it, so the two never share a center — that offset IS the "hang".
const HANGLANTERN_SHADOW = ringPath(0.22, 0.18, 0.2)
const HANGLANTERN_RING = ringPath(0.26, -0.15, -0.18)
const HANGLANTERN_GLOW = ringPath(0.16, -0.15, -0.18)
const HANGLANTERN_CORD = 'M-0.15 -0.85L-0.15 -0.44'

// ── sarcophagus (stone) ──
// tapered coffin-lid outline (wide shoulders, narrow feet)
const SARCOPHAGUS_BODY = 'M-0.42 -0.6L0.42 -0.6L0.5 -0.1L0.32 0.6L-0.32 0.6L-0.5 -0.1Z'
// carved-figure hint: shoulder lens + head ring, same read as the `statue` prop's STATUE_FIGURE/stoneBase pairing
const SARCOPHAGUS_FIGURE = 'M-0.3 -0.28A0.26 0.14 0 1 0 0.22 -0.28A0.26 0.14 0 1 0 -0.3 -0.28Z' + ringPath(0.11, -0.04, -0.5)
const SARCOPHAGUS_CHIP = 'M-0.48 -0.18L-0.28 -0.08L-0.44 0.02Z'

// ── bookshelf (stone) ──
const BOOKSHELF_FRAME = rectD(-0.55, -0.5, 1.1, 1.0)
const BOOKSHELF_ROWS = 'M-0.5 -0.25L0.5 -0.25M-0.5 0L0.5 0M-0.5 0.25L0.5 0.25'
const BOOKSHELF_BLUE = rectD(-0.42, -0.46, 0.08, 0.19) + rectD(-0.18, -0.46, 0.08, 0.19) + rectD(0.05, -0.46, 0.08, 0.19)
const BOOKSHELF_BLOOD = rectD(-0.4, -0.21, 0.08, 0.19) + rectD(-0.05, -0.21, 0.08, 0.19) + rectD(0.28, -0.21, 0.08, 0.19)
const BOOKSHELF_TH2 = rectD(-0.35, 0.04, 0.08, 0.19) + rectD(0.02, 0.04, 0.08, 0.19) + rectD(0.3, 0.04, 0.08, 0.19)

// ── weaponrack (stone) ──
const WEAPONRACK_FRAME = rectD(-0.5, -0.18, 1.0, 0.36)
// three crossed hafts (woodDeep) + their blade tips (steel), sharing endpoints at center
const WEAPONRACK_HAFTS = 'M-0.55 -0.55L0.05 0.02M-0.55 0.55L0.05 -0.02M0 -0.62L0 -0.02'
const WEAPONRACK_BLADES = 'M0.05 0.02L0.6 0.55M0.05 -0.02L0.6 -0.55M0 -0.02L0 0.62'

// ── hoard (stone) ──
const HOARD_BASE = 'M-0.55 0.15C-0.6 -0.15 -0.25 -0.35 0.05 -0.3C0.4 -0.25 0.62 0.05 0.55 0.3C0.48 0.55 0.1 0.6 -0.2 0.55C-0.48 0.5 -0.5 0.35 -0.55 0.15Z'
// seeded coin-dot cluster (same recipe as gravelD: hash01-jittered rings), scoped to the mound
const hoardCoinsD = (seed: number, n: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const x = (hash01(seed + i * 701) - 0.5) * 1.1
    const y = (hash01(seed + i * 701 + 293) - 0.5) * 0.9
    const r = 0.06 + hash01(seed + i * 701 + 577) * 0.05
    d += ringPath(r, x, y)
  }
  return d
}
const HOARD_COINS = hoardCoinsD(hashString('hoard'), 16)
const HOARD_GEM = 'M0.07 -0.23L0.23 -0.23L0.29 -0.07L0.15 0.13L0.01 -0.07Z'
const HOARD_GLINT = ringPath(0.045, -0.2, 0.05)

// ── floorrunes (stone) ──
// deterministic tick arc (pure trig, like starPath) — n ticks from angle a0 to a1 at radius r, length len
const floorruneTicksD = (n: number, r: number, len: number, a0: number, a1: number): string => {
  let d = ''
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    const a = a0 + t * (a1 - a0)
    d += `M${r3(Math.cos(a) * r)} ${r3(Math.sin(a) * r)}L${r3(Math.cos(a) * (r + len))} ${r3(Math.sin(a) * (r + len))}`
  }
  return d
}
const FLOORRUNES_TICKS = floorruneTicksD(9, 0.38, 0.17, Math.PI * 0.12, Math.PI * 0.88)
const FLOORRUNES_GLYPH = 'M0 -0.4L0 0.05M0 -0.4L-0.16 -0.22M0 -0.25L0.16 -0.08'

// ── state pairs II props ─────────────────────────────────────────────────────
// BERRYPICKED reuses BERRYBUSH_D (the same foliage silhouette) with the six
// berries removed; two short pinch-mark notches stand in for the plucked
// gaps in the foliage — the "picked clean" tell.
const BERRYPICKED_NOTCHES = 'M-0.42 -0.22L-0.3 -0.14M-0.38 -0.14L-0.3 -0.22M0.14 -0.42L0.26 -0.34M0.18 -0.34L0.26 -0.42'

// BRAZIERCOLD reuses BRAZIER_LEGS/BRAZIER_RIM/BRAZIER_BOWL verbatim (same
// iron tripod + rim + bowl geometry); only the ember-family fills change —
// the bowl's coal bed goes emberDeep→stoneDark char, and the live flame is
// dropped entirely in favor of one small pale ash fleck (no ember roles).
const BRAZIERCOLD_ASH = ringPath(0.07, 0.05, -0.03)

// CRATEDEBRIS: three angular plank-splinter slivers (multi-subpath, same
// woodDeep/wood tones as `crate`) scattered across CRATE_D's old footprint,
// one intact bottom-left corner L surviving whole, a few thin ink splinter
// flecks among the wreckage.
const CRATEDEBRIS_PLANKS =
  'M-0.48 -0.38L0.02 -0.5L0.08 -0.4L-0.42 -0.28Z' +
  'M0.1 -0.15L0.54 -0.32L0.5 -0.18L0.12 0Z' +
  'M-0.3 0.1L0.2 0.34L0.14 0.46L-0.36 0.24Z'
const CRATEDEBRIS_CORNER = 'M-0.5 0.5L-0.5 0.22L-0.36 0.22L-0.36 0.36L-0.22 0.36L-0.22 0.5Z'
const CRATEDEBRIS_FLECKS = 'M0.2 -0.05L0.3 -0.1M-0.1 0.3L-0.02 0.36M0.35 0.1L0.42 0.16'

// POTDEBRIS: five ceramic shard fragments ringing POT_D's old footprint
// (same woodDeep/woodLight tones as `pot`), a spilled two-leaf foliage
// sprig (reuses `leafD`, tipped out of the pot rather than upright in it),
// and a soft dirtPath soil blob where the potting earth spilled.
const POTDEBRIS_SHARDS =
  'M-0.4 -0.05L-0.22 -0.18L-0.14 -0.06L-0.3 0.06Z' +
  'M0.05 -0.3L0.24 -0.36L0.3 -0.2L0.12 -0.16Z' +
  'M0.28 0.05L0.44 0.02L0.4 0.22L0.24 0.2Z' +
  'M-0.1 0.3L0.08 0.24L0.14 0.42L-0.06 0.46Z' +
  'M-0.42 0.2L-0.26 0.14L-0.22 0.32L-0.38 0.36Z'
const POTDEBRIS_SPRIG = leafD(-0.05, 0.15, 0.22, 0.07, 0.3) + leafD(0.08, 0.05, 0.16, 0.06, -0.6)
const POTDEBRIS_SOIL = 'M-0.2 0.35C-0.28 0.24 -0.16 0.14 -0.02 0.16C0.12 0.18 0.2 0.3 0.12 0.4C0.04 0.5 -0.12 0.46 -0.2 0.35Z'

export const TERRAIN_PROPS: Record<Biome, PropDef[]> = {
  grass: withVariants([
    { id: 'tuft', size: 0.9, paths: [
      { d: 'M-0.45 0.5Q-0.35 -0.2 -0.55 -0.85M0 0.55Q0.08 -0.1 0 -0.95M0.45 0.5Q0.4 -0.25 0.55 -0.8', stroke: 'foliage', sw: 0.16 },
    ] },
    { id: 'bush', size: 1.1, paths: cutout(BUSH_D, 'foliageDeep', 'foliage') },
    { id: 'pebble', size: 0.7, paths: cutout(PEBBLE_D, 'rockDeep', 'rock') },
    { id: 'bloom', size: 0.8, paths: [
      { d: 'M0 0.6Q0.06 0.1 0 -0.3', stroke: 'foliageDeep', sw: 0.12 },
      { d: 'M-0.26 -0.5A0.26 0.26 0 1 0 0.26 -0.5A0.26 0.26 0 1 0 -0.26 -0.5Z', fill: 'bloom' },
    ] },
    { id: 'stump', size: 0.9, paths: [
      { d: 'M-0.4 -0.1L-0.4 0.42C-0.4 0.58 0.4 0.58 0.4 0.42L0.4 -0.1Z', fill: 'woodDeep' },
      { d: 'M-0.42 -0.1A0.42 0.24 0 1 0 0.42 -0.1A0.42 0.24 0 1 0 -0.42 -0.1Z', fill: 'wood' },
      { d: 'M-0.22 -0.1A0.22 0.12 0 1 0 0.22 -0.1A0.22 0.12 0 1 0 -0.22 -0.1Z', stroke: 'woodDeep', sw: 0.06 },
    ] },
    { id: 'mushroom', size: 0.7, paths: [
      { d: 'M-0.14 0.55C-0.17 0.2 -0.13 0.05 -0.09 -0.08L0.12 -0.08C0.15 0.1 0.17 0.3 0.14 0.55Z', fill: 'cream' },
      ...cutout(MUSHCAP_D, 'woodDeep', 'woodLight'),
    ] },
    { id: 'reeds', size: 1, paths: [
      { d: 'M-0.3 0.6Q-0.25 -0.2 -0.36 -0.72M0.05 0.6Q0.1 -0.3 0.02 -0.88M0.38 0.6Q0.35 -0.1 0.44 -0.6', stroke: 'foliageDeep', sw: 0.12 },
      { d: 'M-0.43 -0.78A0.07 0.15 10 1 0 -0.29 -0.78A0.07 0.15 10 1 0 -0.43 -0.78ZM-0.05 -0.94A0.07 0.14 -4 1 0 0.09 -0.94A0.07 0.14 -4 1 0 -0.05 -0.94Z', fill: 'canvas' },
    ] },
    { id: 'log', size: 1.1, paths: [
      ...cutout(LOG_D, 'woodDeep', 'wood'),
      { d: 'M-0.85 0.07A0.12 0.23 0 1 0 -0.61 0.07A0.12 0.23 0 1 0 -0.85 0.07Z', fill: 'woodLight' },
    ] },
    // top-down deciduous CANOPY (the big round leafy trees on the sheet): a
    // two-tone lobed crown over a soft ground shadow, a few dark lobe clefts for
    // the broccoli read, and one lit sun-clump up-left. The forest's marquee prop.
    { id: 'canopy', size: 1.3, wonk: 0.05, paths: [
      { d: 'M0.12 0.66A0.6 0.3 0 1 0 0.14 0.7Z', fill: 'shadow', opacity: 0.22 },
      ...cutout(CANOPY_D, 'foliage', 'mossBase'),
      { d: 'M0 -0.06L-0.34 -0.42M0 -0.06L0.34 -0.34M0 -0.06L0.42 0.12M0 -0.06L-0.06 0.44M0 -0.06L-0.44 0.06', stroke: 'foliageDeep', sw: 0.05, opacity: 0.6 },
      { d: 'M-0.44 -0.3A0.2 0.2 0 1 0 -0.04 -0.3A0.2 0.2 0 1 0 -0.44 -0.3Z', fill: 'tileMoss', opacity: 0.85 },
    ] },
    // FERN: a fan of pinnate fronds (stroke art, like tuft/reeds) with a lit
    // up-left highlight set of the inner fronds.
    { id: 'fern', size: 0.95, paths: [
      { d: 'M0 0.72Q-0.3 0.05 -0.6 -0.62M0 0.72Q-0.12 0 -0.24 -0.82M0 0.72Q0.02 -0.02 0.02 -0.9M0 0.72Q0.16 0 0.3 -0.82M0 0.72Q0.34 0.05 0.62 -0.58', stroke: 'foliageDeep', sw: 0.1 },
      { d: 'M0 0.72Q-0.12 0 -0.24 -0.82M0 0.72Q0.02 -0.02 0.02 -0.9M0 0.72Q0.16 0 0.3 -0.82', stroke: 'foliage', sw: 0.06, lit: true },
    ] },
    // mossy BOULDER: a two-tone rock (bigger + lumpier than pebble) with a moss
    // cap patch + speckle on the lit upper face.
    { id: 'boulder', size: 1.05, wonk: 0.04, paths: [
      ...cutout(BOULDER_D, 'rockDeep', 'rock'),
      { d: 'M-0.5 -0.14C-0.4 -0.4 0 -0.5 0.32 -0.4C0.5 -0.34 0.44 -0.12 0.2 -0.06C-0.08 0 -0.44 0.04 -0.5 -0.14Z', fill: 'mossBase', opacity: 0.85 },
      { d: 'M-0.2 -0.32A0.08 0.08 0 1 0 -0.04 -0.32A0.08 0.08 0 1 0 -0.2 -0.32ZM0.06 -0.24A0.07 0.07 0 1 0 0.2 -0.24A0.07 0.07 0 1 0 0.06 -0.24Z', fill: 'mossInk', opacity: 0.7 },
    ] },
    // wildflower CLUSTER (the white/pink dotted patches): three petal blooms with
    // bloom-pink centers over a pair of leaves.
    { id: 'flowers', size: 0.85, wonk: 0.03, paths: [
      { d: 'M-0.4 0.5C-0.5 0.2 -0.3 0.05 -0.1 0.12C-0.28 0.3 -0.24 0.5 -0.4 0.5ZM0.34 0.52C0.5 0.28 0.34 0.05 0.12 0.14C0.3 0.28 0.22 0.52 0.34 0.52Z', fill: 'foliage' },
      { d: 'M-0.34 -0.28A0.15 0.15 0 1 0 -0.04 -0.28A0.15 0.15 0 1 0 -0.34 -0.28ZM0.12 -0.4A0.14 0.14 0 1 0 0.4 -0.4A0.14 0.14 0 1 0 0.12 -0.4ZM-0.02 0A0.13 0.13 0 1 0 0.24 0A0.13 0.13 0 1 0 -0.02 0Z', fill: 'cream' },
      { d: 'M-0.24 -0.28A0.05 0.05 0 1 0 -0.14 -0.28A0.05 0.05 0 1 0 -0.24 -0.28ZM0.22 -0.4A0.05 0.05 0 1 0 0.32 -0.4A0.05 0.05 0 1 0 0.22 -0.4ZM0.06 0A0.05 0.05 0 1 0 0.16 0A0.05 0.05 0 1 0 0.06 0Z', fill: 'bloom' },
    ] },
    // lush GRASS CLUMP (Grass 2/3 bushy blobs): a two-tone leafy mound, fuller
    // than the thin `tuft`, with a few tall lit blade tips breaking the top.
    { id: 'grassclump', size: 1.05, wonk: 0.03, paths: [
      ...cutout(GRASSCLUMP_D, 'foliageDeep', 'foliage'),
      { d: 'M-0.42 -0.34Q-0.5 -0.68 -0.52 -0.94M-0.08 -0.46Q-0.04 -0.78 0.02 -0.98M0.34 -0.4Q0.42 -0.72 0.5 -0.9', stroke: 'mossBase', sw: 0.08, lit: true },
      { d: 'M-0.6 -0.12Q-0.66 -0.4 -0.72 -0.6M0.18 -0.42Q0.28 -0.64 0.32 -0.84', stroke: 'foliage', sw: 0.06, lit: true },
    ] },
    // fallen LEAF PILE: a seeded scatter of small leaves in three mixed
    // green/warm tones, no two-tone within a leaf — the piece-to-piece color
    // variation carries the read.
    { id: 'leaves', size: 0.9, wonk: 0.03, paths: [
      { d: LEAVES_WARM, fill: 'woodLight' },
      { d: LEAVES_TAN, fill: 'cliffEdge' },
      { d: LEAVES_GREEN, fill: 'mossBase' },
    ] },
    // forest FERN VERGE: a low, wide ground-cover moss patch (two-tone cutout,
    // spreading + flat, hugging a forest edge) with a few short fern fronds
    // rising from it — a couple lit. Reads as a mossy fern skirt distinct from
    // the tall thin `reeds`, the round-fan `fern`, and the flat stone `moss`.
    { id: 'fernverge', size: 1, wonk: 0.04, paths: [
      ...cutout(
        'M-0.85 0.3C-0.88 0.06 -0.56 -0.05 -0.32 -0.02C-0.12 -0.15 0.2 -0.13 0.36 0C0.62 -0.09 0.9 0.06 0.82 0.32C0.78 0.52 0.4 0.6 0 0.58C-0.42 0.6 -0.8 0.5 -0.85 0.3Z',
        'foliageDeep', 'mossBase',
      ),
      { d: 'M-0.34 0.4Q-0.42 -0.02 -0.5 -0.44M-0.02 0.44Q0.02 -0.06 -0.04 -0.58M0.3 0.42Q0.4 0 0.52 -0.4', stroke: 'foliage', sw: 0.09 },
      { d: 'M-0.02 0.44Q0.02 -0.06 -0.04 -0.58M0.3 0.42Q0.4 0 0.52 -0.4', stroke: 'tileMoss', sw: 0.055, lit: true },
    ] },
    // ── forest floor & wilderness ──
    // gnarled BARE dead tree from above: dark radiating limb strokes (lit up-left
    // pair), a small trunk-core cutout, soft ground shadow. Forest/swamp accent.
    { id: 'deadtree', size: 1.2, wonk: 0.04, paths: [
      { d: 'M0.18 0.2A0.4 0.22 0 1 0 0.2 0.24Z', fill: 'shadow', opacity: 0.22 },
      { d: DEADTREE_BRANCHES, stroke: 'woodDeep', sw: 0.1 },
      { d: DEADTREE_LIT, stroke: 'wood', sw: 0.055, lit: true },
      ...cutout(DEADTREE_CORE, 'woodDeep', 'wood'),
    ] },
    // surface ROOTS breaking through soil: thick sinuous radiating strokes with a
    // lit subset + a two-tone root-crown knot. Free-spins as ground texture.
    { id: 'roots', size: 1, paths: [
      { d: ROOTS_DK, stroke: 'woodDeep', sw: 0.16 },
      { d: ROOTS_LIT, stroke: 'wood', sw: 0.08, lit: true },
    ] },
    // fallen HOLLOW log: fat two-tone trunk, ink bore ellipse at one end, moss
    // saddle — fatter + stubbier than `log`, the open bore is the signature.
    { id: 'hollowlog', size: 1.15, wonk: 0.04, paths: [
      ...cutout(HOLLOWLOG_D, 'woodDeep', 'wood'),
      { d: HOLLOWLOG_BORE, fill: 'ink' },
      { d: HOLLOWLOG_MOSS, fill: 'mossBase', opacity: 0.85 },
    ] },
    // BERRY bush: round two-tone foliage blob dotted with six bloom-pink berries
    // (one multi-subpath scatter). Clusters with bush/tuft.
    { id: 'berrybush', size: 1, wonk: 0.04, paths: [
      ...cutout(BERRYBUSH_D, 'foliageDeep', 'foliage'),
      { d: BERRYBUSH_BERRIES, fill: 'bloom' },
    ] },
    // forest WEB snare: pale low-opacity orb web (spokes + sag arcs) strung between
    // two dark anchor stubs — reads as a flat decal near trees.
    { id: 'websnare', size: 1.1, wonk: 0.03, paths: [
      { d: WEBSNARE_STUBS, fill: 'woodDeep' },
      { d: WEBSNARE.spokes, stroke: 'cream', sw: 0.025, opacity: 0.5 },
      { d: WEBSNARE.arcs, stroke: 'cream', sw: 0.02, opacity: 0.42 },
    ] },
    // CAMPFIRE ring: charred disc + crossed charred sticks + ember glow, ringed by
    // eight seeded two-tone stones. Marquee accent — uses the 6-path allowance.
    { id: 'campring', size: 1, wonk: 0.035, paths: [
      { d: ringPath(0.42), fill: 'ink', opacity: 0.85 },
      { d: 'M-0.3 -0.26L0.32 0.3M-0.28 0.3L0.26 -0.3', stroke: 'woodDeep', sw: 0.07 },
      { d: ringPath(0.24), fill: 'emberDeep' },
      { d: ringPath(0.13), fill: 'ember' },
      ...cutout(CAMPRING_STONES, 'rockDeep', 'rock'),
    ] },
    // weathered WAYSIGN: two opposed arrow planks (two-tone wood) across a post,
    // ink grain seams, pale post cap on top. Wilderness cousin of city `signpost`.
    { id: 'waysign', size: 0.95, wonk: 0.03, paths: [
      ...cutout(WAYSIGN_PLANKS, 'woodDeep', 'wood'),
      { d: 'M-0.12 -0.18L0.44 -0.15M-0.38 0.13L0.16 0.16', stroke: 'ink', sw: 0.045, opacity: 0.6 },
      { d: ringPath(0.13, 0.02, -0.01), fill: 'woodLight' },
    ] },
    // ── desert ──
    // tall SAGUARO from above: soft ground shadow, a two-tone crown-with-arm-lobes
    // cutout, and tiny cream spine flecks on the crown and arm tips.
    { id: 'cactus', size: 1.15, paths: [
      { d: ringPath(0.5, 0.09, 0.16), fill: 'shadow', opacity: 0.24 },
      ...cutout(CACTUS_D, 'foliageDeep', 'foliage'),
      // seam ticks where each arm meets the crown, so three arms silhouette
      // instead of merging into one green splat (judge pass)
      { d: 'M-0.33 -0.17L-0.17 -0.33M0.37 -0.02L0.32 0.16M-0.22 0.3L-0.05 0.37', stroke: 'foliageDeep', sw: 0.05, opacity: 0.8 },
      { d: CACTUS_SPINES, fill: 'cream', opacity: 0.65 },
    ] },
    // PRICKLY-PEAR pad cluster: overlapping two-tone oval pads + cream spine dots.
    { id: 'cactuspad', size: 0.95, paths: [
      ...cutout(CACTUSPAD_D, 'foliageDeep', 'foliage'),
      { d: CACTUSPAD_SPINES, fill: 'cream', opacity: 0.7 },
    ] },
    // TUMBLEWEED: an airy tangled ball read from two layered dry-twig scribble
    // stroke sets — no fill, so the ground shows through.
    { id: 'tumbleweed', size: 0.85, paths: [
      { d: TUMBLEWEED_OUT, stroke: 'canvas', sw: 0.07, opacity: 0.9 },
      { d: TUMBLEWEED_IN, stroke: 'woodLight', sw: 0.05, opacity: 0.85, lit: true },
    ] },
    // SUN-BLEACHED BONES: spine + rib hoops + horns in one cream stroke set, a
    // small horned-skull blob, dark eye sockets. Distinct from stone `skull`/`bone`.
    { id: 'sunbones', size: 0.9, wonk: 0.03, paths: [
      { d: SUNBONES_RIBS, stroke: 'cream', sw: 0.07, opacity: 0.65 },
      { d: SUNBONES_SKULL, fill: 'cream', opacity: 0.65 },
      { d: SUNBONES_SOCKETS, fill: 'ink' },
    ] },
    // DUNE RIPPLE decal: a faint sand wash blob under parallel lit wind-ripple
    // strokes — pure top-down, spins freely.
    { id: 'duneripple', size: 1.1, paths: [
      { d: DUNERIPPLE_WASH, fill: 'sand', opacity: 0.15 },
      { d: DUNERIPPLE_LINES, stroke: 'sandLit', sw: 0.07, opacity: 0.55 },
    ] },
    // CRACKED EARTH decal: two-tone dried-mud plates split by a branching dark
    // crack along the seams, over a continuous parched-ground wash (judge pass:
    // without it the seams read as gaps between loose shards, not cracks IN a
    // surface — and the plates collided with `potsherds`).
    { id: 'earthcrack', size: 1.05, paths: [
      { d: blobPath(lobeRing(7, 0.86, 0.74)), fill: 'sand', opacity: 0.3 },
      ...cutout(EARTHCRACK_D, 'sand', 'sandLit'),
      { d: EARTHCRACK_SEAMS, stroke: 'woodDeep', sw: 0.05, opacity: 0.8 },
    ] },
    // OASIS PALM from above: shadow, a deep-notched 7-frond star crown with a lit
    // inner frond star, and a dark trunk dot at the axis.
    { id: 'oasispalm', size: 1.25, wonk: 0.05, paths: [
      { d: 'M0.14 0.6A0.55 0.3 0 1 0 0.16 0.64Z', fill: 'shadow', opacity: 0.26 },
      { d: OASISPALM_OUT, fill: 'foliageDeep' },
      { d: OASISPALM_IN, fill: 'foliage', lit: true },
      { d: ringPath(0.13, 0, 0.02), fill: 'woodDeep' },
    ] },
    // half-buried OBELISK: cast slab shadow, two-tone tapered pillar leaning
    // up-right, a sand drift over the buried base, etched rune ticks on the shaft.
    { id: 'obelisk', size: 1.1, wonk: 0.035, paths: [
      { d: OBELISK_SHADOW, fill: 'shadow', opacity: 0.24 },
      ...cutout(OBELISK_D, 'rockDeep', 'stoneBase'),
      { d: OBELISK_SAND, fill: 'sand', opacity: 0.45 },
      { d: OBELISK_RUNES, stroke: 'mortarInk', sw: 0.045, opacity: 0.85 },
    ] },
    // POTSHERDS: five scattered angular ceramic sherds + one larger broken rim
    // band, all one two-tone cutout.
    { id: 'potsherds', size: 0.85, wonk: 0.04, paths: cutout(POTSHERDS_D, 'wood', 'woodLight') },
    // ── plains / farmland ──
    // round HAY BALE from above: a golden thatch drum over a soft ground shadow,
    // with the wound-straw spiral scored into the lit face.
    // size 1.15 so the spiral resolves (a small gold disc read as a coin) and
    // lit face th3 to sit inside the muted warm range (judge pass)
    { id: 'haybale', size: 1.15, wonk: 0.04, paths: [
      { d: ringPath(0.56, 0.07, 0.09), fill: 'shadow', opacity: 0.22 },
      ...cutout(HAYBALE_D, 'th4', 'th3'),
      { d: HAYBALE_SPIRAL, stroke: 'thatchInk', sw: 0.05, opacity: 0.75 },
    ] },
    // short wooden FENCE segment: two dark rails strung post-to-post, round
    // two-tone post tops anchoring each end — reads as a line feature on a verge.
    { id: 'fencerun', size: 1.15, wonk: 0.04, paths: [
      { d: FENCERUN_RAILS, stroke: 'woodDeep', sw: 0.1 },
      ...cutout(FENCERUN_POSTS, 'woodDeep', 'wood'),
    ] },
    // tall WHEAT stand: warm gold bowed stalks (taller + warmer than the green
    // `tuft`) with ripe seed-head lenses dabbed at the tips, inner stalks lit.
    { id: 'wheat', size: 1, wonk: 0.04, paths: [
      { d: WHEAT_STALKS, stroke: 'th3', sw: 0.09 },
      { d: WHEAT_STALKS_LIT, stroke: 'th1', sw: 0.055, lit: true },
      { d: WHEAT_HEADS, fill: 'th2' },
    ] },
    // SCARECROW from above: a ragged canvas tunic under the cross-arm pole, the
    // straw hat disc (two-tone thatch) crowning the middle. The plains' rare hero.
    { id: 'scarecrow', size: 1.1, wonk: 0.04, paths: [
      { d: SCARECROW_TUNIC, fill: 'canvas' },
      { d: SCARECROW_FRAME, stroke: 'woodDeep', sw: 0.1 },
      ...cutout(SCARECROW_HAT, 'th4', 'th3'),
    ] },
    // animal BURROW: a kicked-out dirt fan with pale sand crumbs to one side of a
    // dark oval hole sunk in an earthen rim. Flat ground feature, free-spinning.
    { id: 'burrow', size: 0.85, wonk: 0.035, paths: [
      { d: BURROW_FAN, fill: 'dirtPath' },
      { d: BURROW_SPECKS, fill: 'sand', opacity: 0.85 },
      { d: BURROW_RIM, fill: 'stoneDark' },
      { d: BURROW_HOLE, fill: 'ink' },
    ] },
    // old WAYSTONE marker: a squat two-tone standing stone with etched grooves and
    // a moss fleck at the foot, over a flat base shadow. Wants to sit by a path.
    { id: 'waystone', size: 0.95, wonk: 0.035, paths: [
      { d: 'M-0.3 0.58A0.4 0.15 0 1 0 0.5 0.58A0.4 0.15 0 1 0 -0.3 0.58Z', fill: 'shadow', opacity: 0.25 },
      ...cutout(WAYSTONE_D, 'rockDeep', 'rock'),
      { d: WAYSTONE_GROOVES, stroke: 'ink', sw: 0.055 },
      { d: WAYSTONE_MOSS, fill: 'mossBase', opacity: 0.85 },
    ] },
    // ── river / pond / shoreline ──
    // LILY PADS: two-tone notched round pads floating flat on the water, one small
    // pink bloom sitting on the big pad.
    { id: 'lilypad', size: 1, wonk: 0.04, paths: [
      ...cutout(LILYPAD_D, 'foliage', 'mossBase'),
      { d: ringPath(0.09, -0.34, -0.26), fill: 'bloom' },
    ] },
    // STEPPING STONES: three flat worn crossing stones in a diagonal line over a
    // soft ground shadow.
    { id: 'steppingstone', size: 1, paths: [
      { d: STEPPINGSTONE_SHADOW, fill: 'shadow', opacity: 0.2 },
      ...cutout(STEPPINGSTONE_D, 'rockDeep', 'rock'),
    ] },
    // DRIFTWOOD: bleached sinuous limb with snapped stub branches + one faint
    // grain crack along the trunk.
    // wood tones, not bone-white (judge pass: canvas/cream read as a skeleton
    // next to sunbones and jumped two value steps past the cutout family)
    { id: 'driftwood', size: 1.1, paths: [
      ...cutout(DRIFTWOOD_D, 'wood', 'canvas'),
      { d: 'M-0.62 0.16C-0.3 0.04 0.1 -0.08 0.55 -0.18', stroke: 'woodDeep', sw: 0.04, opacity: 0.45 },
    ] },
    // ROWBOAT: beached hull from above — two-tone pointed oval, inked gunwale rim,
    // two thwart benches, flat drop shadow. Rare shoreline accent.
    { id: 'rowboat', size: 1.15, wonk: 0.03, paths: [
      { d: ROWBOAT_SHADOW, fill: 'shadow', opacity: 0.25 },
      ...cutout(ROWBOAT_D, 'woodDeep', 'wood'),
      { d: ROWBOAT_RIM, stroke: 'ink', sw: 0.05, opacity: 0.65 },
      { d: 'M-0.28 -0.12L0.28 -0.12M-0.26 0.24L0.26 0.24', stroke: 'woodDeep', sw: 0.09 },
    ] },
    // FISHNET: pale diamond mesh sagging between two post stubs under a rope line —
    // a low-opacity drying-net decal.
    { id: 'fishnet', size: 1.05, wonk: 0.025, paths: [
      { d: FISHNET_MESH, stroke: 'cream', sw: 0.03, opacity: 0.45 },
      { d: 'M-0.78 -0.34Q0 -0.16 0.78 -0.34', stroke: 'canvas', sw: 0.06, opacity: 0.85 },
      { d: FISHNET_POSTS, fill: 'woodDeep' },
    ] },
    // RIPPLE: concentric broken arc rings, brighter core fading outward — sits ON
    // water washes.
    { id: 'ripple', size: 1, wonk: 0.04, paths: [
      { d: RIPPLE_INNER, stroke: 'waterHi', sw: 0.055, opacity: 0.55 },
      { d: RIPPLE_OUTER, stroke: 'waterHi', sw: 0.05, opacity: 0.35 },
    ] },
    // MUDBANK: low two-tone silt blob with drag streaks — a flat wet-bank decal.
    // lit face damped (judge pass: full dirtPath made a mud bank the brightest
    // thing on the panel — mud sits darker than the ground, not lighter)
    { id: 'mudbank', size: 1.15, paths: [
      ...cutout(MUDBANK_D, 'woodDeep', 'dirtPath').map((p) => (p.lit ? { ...p, opacity: 0.55 } : p)),
      { d: 'M-0.55 0.06L0.08 -0.02M-0.18 0.2L0.45 0.14M0.02 -0.14L0.52 -0.2', stroke: 'woodDeep', sw: 0.05, opacity: 0.6 },
    ] },
    // ── swamp + cross-biome structures ──
    // twisted swamp TREE: a lopsided murk-lit crown over a soft shadow, with two
    // crooked bare branches poking through — the swamp's marquee tree.
    { id: 'gnarltree', size: 1.25, wonk: 0.05, paths: [
      { d: 'M0.12 0.58A0.55 0.28 0 1 0 0.14 0.62Z', fill: 'shadow', opacity: 0.24 },
      ...cutout(GNARLTREE_D, 'foliageDeep', 'murk'),
      { d: GNARLTREE_BRANCHES, stroke: 'wood', sw: 0.07 },
    ] },
    // HANGING MOSS curtain draped across the ground: a dark drape bar with airy
    // stringy strands falling from it, a few lit.
    { id: 'hangmoss', size: 0.95, paths: [
      { d: 'M-0.75 -0.44Q0 -0.68 0.72 -0.44', stroke: 'mossInk', sw: 0.11 },
      { d: HANGMOSS_STRANDS, stroke: 'mossBase', sw: 0.09 },
      { d: HANGMOSS_LIT, stroke: 'ms2', sw: 0.05, lit: true },
    ] },
    // stagnant MURK POOL decal: two-tone murk blob with a pale algae scum ring.
    { id: 'murkpool', size: 1.1, paths: [
      { d: MURKPOOL_D, fill: 'murk' },
      { d: MURKPOOL_DEEP, fill: 'murkDeep' },
      { d: MURKPOOL_SCUM, stroke: 'ms2', sw: 0.035, opacity: 0.7 },
    ] },
    // GLOWING MUSHROOM cluster: three biolum caps over dark stems, sitting in a
    // faint flat glow disc (low-opacity fill, no gradient).
    { id: 'glowshroom', size: 0.75, paths: [
      { d: ringPath(0.62, 0.02, -0.02), fill: 'glowFungus', opacity: 0.1 },
      { d: 'M-0.3 0.42L-0.32 0.1M0.06 0.5L0.06 0.02M0.36 0.4L0.33 0.14', stroke: 'murkDeep', sw: 0.11 },
      { d: GLOWSHROOM_CAPS, fill: 'glowFungus', opacity: 0.8 },
      { d: GLOWSHROOM_SPOTS, fill: 'murkDeep', opacity: 0.7 },
    ] },
    // half-SUNKEN LOG: a rotted trunk with a pale end-grain disc, its far end
    // swallowed by a murk waterline blob with one thin ripple.
    { id: 'sunkenlog', size: 1.1, paths: [
      ...cutout(SUNKENLOG_D, 'woodDeep', 'wood'),
      { d: 'M-0.79 0.06A0.11 0.21 0 1 0 -0.57 0.06A0.11 0.21 0 1 0 -0.79 0.06Z', fill: 'woodLight' },
      { d: SUNKENLOG_MURK, fill: 'murk' },
      { d: 'M0.28 -0.28Q0.12 -0.02 0.3 0.34', stroke: 'waterHi', sw: 0.035, opacity: 0.4 },
    ] },
    // WILL-O'-WISP: a tiny glow core inside two concentric flat halo rings, with a
    // drifting tail curl trailing off.
    { id: 'wisp', size: 0.6, wonk: 0.03, paths: [
      { d: WISP_HALOS, stroke: 'glowFungus', sw: 0.045, opacity: 0.3 },
      { d: ringPath(0.1, 0.04, -0.06), fill: 'glowFungus' },
      { d: 'M0.02 0.06Q-0.26 0.22 -0.38 0.46Q-0.42 0.62 -0.28 0.64', stroke: 'glowFungus', sw: 0.05, opacity: 0.5 },
    ] },
    // rotting PLANK WALKWAY segment: parallel boardwalk planks with one broken to
    // a half — nail ticks mark the rot.
    { id: 'plankwalk', size: 1.1, wonk: 0.04, paths: [
      ...cutout(PLANKWALK_D, 'woodDeep', 'wood'),
      { d: 'M-0.48 -0.6L-0.48 -0.43M0.42 -0.28L0.42 -0.1M-0.3 0.4L-0.3 0.57M0.5 0.4L0.5 0.57', stroke: 'ink', sw: 0.04, opacity: 0.5 },
    ] },
    // bubbling BOG GAS pocket: a two-tone cluster of murk bubbles + two pale pop
    // rings where bubbles just burst.
    { id: 'gaspocket', size: 0.85, paths: [
      ...cutout(GASPOCKET_D, 'murkDeep', 'murk'),
      { d: GASPOCKET_POPS, stroke: 'waterHi', sw: 0.035, opacity: 0.35 },
    ] },
    // round stone WELL from above: a two-tone rim ring around an ink water hole,
    // crossed by a wooden beam with a tiny bucket.
    { id: 'well', size: 0.95, wonk: 0.03, paths: [
      ...cutout(WELL_RIM, 'rockDeep', 'rock'),
      { d: ringPath(0.36), fill: 'ink' },
      { d: 'M-0.66 -0.04L0.66 -0.04', stroke: 'wood', sw: 0.1 },
      { d: ringPath(0.1, 0.12, -0.04), fill: 'woodLight' },
    ] },
    // weathered GRAVESTONE: a rounded two-tone headstone slab over a low earth
    // mound, a moss fleck creeping up the stone.
    { id: 'gravestone', size: 0.85, wonk: 0.03, paths: [
      { d: GRAVESTONE_MOUND, fill: 'dirtPath', opacity: 0.9 },
      ...cutout(GRAVESTONE_SLAB, 'rockDeep', 'stoneBase'),
      { d: ringPath(0.07, -0.13, -0.5) + ringPath(0.045, 0.09, -0.62), fill: 'mossBase', opacity: 0.85 },
    ] },
    // canvas camp TENT from above: an elongated hex canvas with a ridge seam and
    // guy-line ticks off the corners and ends.
    { id: 'tent', size: 1.15, wonk: 0.04, paths: [
      { d: 'M-0.62 0.12L-0.34 -0.28L0.56 -0.28L0.86 0.12L0.56 0.52L-0.34 0.52Z', fill: 'shadow', opacity: 0.22 },
      ...cutout(TENT_D, 'dirtPath', 'canvas'),
      { d: 'M-0.78 0L0.78 0', stroke: 'woodDeep', sw: 0.055 },
      { d: 'M-0.46 -0.4L-0.6 -0.62M0.46 -0.4L0.6 -0.62M-0.46 0.4L-0.6 0.62M0.46 0.4L0.6 0.62M0.78 0L0.95 0M-0.78 0L-0.95 0', stroke: 'cream', sw: 0.03, opacity: 0.5 },
    ] },
    // wooden WAGON from above: a two-tone plank bed with seam strokes, two wheel
    // discs poking out the sides and a draw shaft off the front.
    { id: 'wagon', size: 1.1, wonk: 0.04, paths: [
      { d: WAGON_WHEELS, fill: 'woodLight' },
      ...cutout(WAGON_D, 'woodDeep', 'wood'),
      { d: 'M-0.62 -0.13L0.62 -0.13M-0.62 0.12L0.62 0.12', stroke: 'ink', sw: 0.04, opacity: 0.45 },
      { d: 'M0.62 -0.16L0.92 -0.1M0.62 0.16L0.92 0.1', stroke: 'wood', sw: 0.06 },
    ] },
    // ── interactable states (grass) ──
    // COLD camp: `campring`'s exact stone ring (CAMPRING_STONES), charred disc
    // and crossed sticks, but the embers are out — a darker char core instead
    // of the glow. State pair with `campring` (no ember roles).
    { id: 'campcold', size: 1, wonk: 0.035, paths: [
      { d: ringPath(0.42), fill: 'ink', opacity: 0.85 },
      { d: ringPath(0.24), fill: 'stoneDark' },
      { d: CAMPCOLD_STICKS, stroke: 'woodDeep', sw: 0.07 },
      ...cutout(CAMPRING_STONES, 'rockDeep', 'rock'),
    ] },
    // ── connective structures (grass) ──
    // PLANK FOOTBRIDGE: cross-plank deck between two side rails — the river/gap
    // crossing connector.
    { id: 'bridgeplank', size: 1.2, wonk: 0.03, paths: [
      { d: BRIDGEPLANK_RAILS, stroke: 'woodDeep', sw: 0.09 },
      ...cutout(BRIDGEPLANK_D, 'woodDeep', 'wood'),
    ] },
    // STONE ARCH BRIDGE: dressed masonry deck with parapets + keystone seams.
    { id: 'bridgestone', size: 1.2, wonk: 0.025, paths: [
      ...cutout(BRIDGESTONE_D, 'rockDeep', 'stoneBase'),
      { d: BRIDGESTONE_SEAMS, stroke: 'mortarInk', sw: 0.04 },
      { d: BRIDGESTONE_PARAPET, stroke: 'rockDeep', sw: 0.09 },
    ] },
    // ROPE BRIDGE: sagging side ropes + slat run with missing slats.
    { id: 'bridgerope', size: 1.2, wonk: 0.03, paths: [
      { d: BRIDGEROPE_ROPES, stroke: 'canvas', sw: 0.06 },
      ...cutout(BRIDGEROPE_SLATS, 'woodDeep', 'wood'),
    ] },
    // WOOD GATE (closed): plank panel slung between fence-post tops, Z-brace.
    { id: 'woodgate', size: 1, wonk: 0.03, paths: [
      ...cutout(WOODGATE_D, 'woodDeep', 'wood'),
      { d: WOODGATE_BRACE, stroke: 'ink', sw: 0.05, opacity: 0.6 },
    ] },
    // WOOD GATE (open): the SAME posts + panel swung ~75° from the left hinge.
    { id: 'woodgateopen', size: 1, wonk: 0.03, paths: [
      ...cutout(WOODGATEOPEN_D, 'woodDeep', 'wood'),
      { d: WOODGATEOPEN_BRACE, stroke: 'ink', sw: 0.05, opacity: 0.6 },
    ] },
    // ROADSIDE SHRINE: stone base + roofed niche, votive ember in the recess.
    { id: 'shrine', size: 0.95, wonk: 0.03, paths: [
      ...cutout(SHRINE_BASE, 'rockDeep', 'rock'),
      ...cutout(SHRINE_NICHE, 'woodDeep', 'wood'),
      { d: SHRINE_RECESS, fill: 'ink' },
      { d: SHRINE_VOTIVE, fill: 'ember' },
    ] },
    // WAYPOINT BONFIRE: big stone ring, log tripod, two-stage flame — the rest
    // stop. Bigger + tripod-fed vs the small crossed-stick `campring`.
    { id: 'bonfire', size: 1.15, wonk: 0.035, paths: [
      { d: ringPath(0.5), fill: 'ink', opacity: 0.85 },
      { d: BONFIRE_LOGS, stroke: 'woodDeep', sw: 0.11 },
      { d: BONFIRE_FLAME, fill: 'emberDeep' },
      { d: ringPath(0.14, -0.02, 0), fill: 'ember' },
      ...cutout(BONFIRE_STONES, 'rockDeep', 'rock'),
    ] },
    // ── jungle (grass) ──
    { id: 'hangvines', size: 1.05, wonk: 0.035, paths: [
      { d: HANGVINES_BAR, stroke: 'foliageDeep', sw: 0.1 },
      { d: HANGVINES_VINES, stroke: 'foliageDeep', sw: 0.07 },
      { d: HANGVINES_VINES_LIT, stroke: 'foliage', sw: 0.05, lit: true },
      { d: HANGVINES_LEAVES_DEEP, fill: 'foliageDeep' },
      { d: HANGVINES_LEAVES_LIT, fill: 'foliage', lit: true },
    ] },
    { id: 'giantleaf', size: 1.15, wonk: 0.035, paths: [
      { d: GIANTLEAF_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(GIANTLEAF_D, 'foliage', 'mossBase'),
      { d: GIANTLEAF_RIB, stroke: 'foliageDeep', sw: 0.05 },
    ] },
    { id: 'bamboo', size: 1.1, wonk: 0.03, paths: [
      { d: BAMBOO_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(BAMBOO_CULMS, 'foliage', 'pineLit'),
      { d: BAMBOO_NODES, fill: 'cream' },
      { d: BAMBOO_LEAVES, stroke: 'foliageDeep', sw: 0.07 },
    ] },
    { id: 'exoticbloom', size: 1.05, wonk: 0.03, paths: [
      { d: EXOTICBLOOM_SHADOW, fill: 'shadow', opacity: 0.22 },
      { d: EXOTICBLOOM_LEAVES, fill: 'foliageDeep' },
      { d: EXOTICBLOOM_OUTER, fill: 'bloom' },
      { d: EXOTICBLOOM_INNER, fill: 'cream' },
      { d: EXOTICBLOOM_STAMEN, fill: 'bannerGold' },
    ] },
    // ── forest & desert fills (grass) ──
    { id: 'bramble', size: 0.9, wonk: 0.04, paths: [
      { d: BRAMBLE_TANGLE_OUT, stroke: 'foliageDeep', sw: 0.09, opacity: 0.95 },
      { d: BRAMBLE_TANGLE_IN, stroke: 'woodDeep', sw: 0.06, opacity: 0.85, lit: true },
      { d: BRAMBLE_THORNS, stroke: 'woodDeep', sw: 0.045, opacity: 0.85 },
      { d: BRAMBLE_BERRIES, fill: 'bloodDry' },
    ] },
    { id: 'beehive', size: 0.8, wonk: 0.035, paths: [
      { d: ringPath(0.18, 0.3, 0.36), fill: 'shadow', opacity: 0.25 },
      { d: BEEHIVE_LIGHT, fill: 'th4' },
      { d: BEEHIVE_DARK, fill: 'th2' },
      { d: ringPath(0.05, -0.1, 0.16), fill: 'ink' },
    ] },
    { id: 'toadstoolring', size: 1.05, wonk: 0.03, paths: [
      { d: TOADSTOOLRING.stems, fill: 'cream' },
      ...cutout(TOADSTOOLRING.caps, 'woodDeep', 'woodLight'),
    ] },
    { id: 'quicksand', size: 1.1, paths: [
      { d: ringPath(0.62), fill: 'sand', opacity: 0.3 },
      { d: ringPath(0.42), fill: 'sandLit', opacity: 0.28 },
      { d: ringPath(0.24), fill: 'sand', opacity: 0.35 },
      { d: QUICKSAND_SPIRAL, stroke: 'sandLit', sw: 0.035, opacity: 0.5 },
      { d: 'M-0.15 -0.05L0.08 0.18', stroke: 'woodDeep', sw: 0.09, opacity: 0.85 },
    ] },
    { id: 'digspot', size: 0.85, wonk: 0.035, paths: [
      { d: DIGSPOT_MOUNDS, fill: 'dirtPath' },
      { d: DIGSPOT_CRUMBS, fill: 'sand', opacity: 0.85 },
      { d: DIGSPOT_XMARK, stroke: 'woodDeep', sw: 0.05, opacity: 0.5 },
    ] },
    // ── shore & beach fills (grass) ──

    // PIER: wide contiguous deck run + seam ink lines + two post dots at the far
    // end. Rare accent — clusters with rowboat/fishnet at a fishing spot.
    { id: 'pier', size: 1.1, wonk: 0.035, paths: [
      ...cutout(PIER_D, 'woodDeep', 'wood'),
      { d: PIER_SEAMS, stroke: 'ink', sw: 0.03, opacity: 0.4 },
      { d: PIER_POSTS, fill: 'woodDeep' },
    ] },

    // BUOY: small mooring float on open water, one glinting ripple beside it.
    { id: 'buoy', size: 0.5, paths: [
      { d: BUOY_BODY, fill: 'bloodDry' },
      { d: BUOY_CAP, fill: 'cream' },
      { d: BUOY_RIPPLE, stroke: 'waterHi', sw: 0.04, opacity: 0.5 },
    ] },

    // ALGAEMAT: low-opacity two-tone floating algae patch with darker flecks.
    { id: 'algaemat', size: 0.9, paths: [
      ...cutout(ALGAEMAT_D, 'mossBase', 'ms2').map((p) => ({ ...p, opacity: 0.7 })),
      { d: ALGAEMAT_FLECKS, fill: 'mossInk', opacity: 0.6 },
    ] },

    // SEASHELLS: a small scatter of tiny cream/bloom fan shells, one ridged.
    { id: 'seashells', size: 0.7, wonk: 0.03, paths: [
      { d: SEASHELLS_CREAM_D, fill: 'cream', opacity: 0.7 },
      { d: SEASHELLS_BLOOM_D, fill: 'bloom', opacity: 0.7 },
      { d: SEASHELLS_RIDGES, stroke: 'ink', sw: 0.025, opacity: 0.4 },
    ] },

    // TIDEPOOL: a stone-ringed shallow pool with a glint and a resting starfish.
    { id: 'tidepool', size: 0.85, paths: [
      { d: TIDEPOOL_STONES, fill: 'rock' },
      { d: TIDEPOOL_POOL_D, fill: 'waterShallow' },
      { d: TIDEPOOL_GLINT, stroke: 'waterHi', sw: 0.04, opacity: 0.6 },
      { d: TIDEPOOL_STARFISH, fill: 'bloom' },
    ] },

    // CORAL: washed-up antler coral chunk, muted two-tone branches on sand.
    { id: 'coral', size: 0.75, wonk: 0.03, paths: [
      { d: CORAL_SAND_D, fill: 'sand', opacity: 0.8 },
      { d: CORAL_BRANCHES_D, stroke: 'bloom', sw: 0.11, opacity: 0.65 },
      { d: CORAL_BRANCHES_D, stroke: 'cream', sw: 0.06, opacity: 0.5, lit: true },
    ] },

    // SANDCASTLE: two-tone keep + turret pair, one stick-flag stroke. Destructible.
    { id: 'sandcastle', size: 0.85, wonk: 0.03, paths: [
      ...cutout(SANDCASTLE_D, 'sand', 'sandLit'),
      { d: SANDCASTLE_FLAG, stroke: 'woodDeep', sw: 0.05 },
    ] },
    // ── state pairs II (grass) ──
    // HARVESTED berry bush: `berrybush`'s exact BERRYBUSH_D silhouette, no
    // berries — the picked-clean tell — plus two small pinch-notch strokes
    // where clusters were plucked. State pair with `berrybush`.
    { id: 'berrypicked', size: 1, wonk: 0.04, paths: [
      ...cutout(BERRYBUSH_D, 'foliageDeep', 'foliage'),
      { d: BERRYPICKED_NOTCHES, stroke: 'foliageDeep', sw: 0.05, opacity: 0.7 },
    ] },
    // ── flora catalog (nature/farm/orchard groups) ──
    ...CROPS_A, ...CROPS_B, ...FRUIT_TREES, ...BERRIES, ...VINES,
    ...DESERT_FLORA, ...WETLAND_FLORA, ...JUNGLE_FLORA, ...FOREST_FLORA,
  ]),
  stone: withVariants([
    { id: 'rubble', size: 1, paths: [
      ...cutout(RUBBLE_D, 'rockDeep', 'rock'),
      { d: 'M0.4 0.5L0.72 0.02L0.9 0.45Z', fill: 'rockDeep' },
    ] },
    // lit companion stroke so the crack survives on the dark stone ground
    // (judge pass: the lone stoneDark stroke was a ghost squiggle in situ)
    { id: 'crack', size: 1.2, paths: [
      { d: 'M-0.85 -0.3L-0.25 -0.12L0.05 0.26L0.7 0.45', stroke: 'stoneDark', sw: 0.1 },
      { d: 'M-0.85 -0.3L-0.25 -0.12L0.05 0.26L0.7 0.45', stroke: 'rock', sw: 0.045, lit: true },
    ] },
    { id: 'shard', size: 0.8, paths: cutout(SHARD_D, 'rockDeep', 'rock') },
    { id: 'bone', size: 0.8, paths: [
      { d: 'M-0.5 0.15L0.35 -0.3M0.28 -0.42L0.45 -0.18', stroke: 'cream', sw: 0.12, opacity: 0.6 },
    ] },
    { id: 'pillar', size: 1, paths: [
      { d: 'M-0.5 0.6L0.5 0.6L0.43 0.36L-0.44 0.38Z', fill: 'rockDeep' },
      ...cutout(PILLAR_D, 'rockDeep', 'rock'),
    ] },
    { id: 'skull', size: 0.7, wonk: 0.025, paths: [
      ...cutout(SKULL_D, 'rockDeep', 'cream'),
      { d: 'M-0.24 -0.06A0.09 0.11 0 1 0 -0.06 -0.06A0.09 0.11 0 1 0 -0.24 -0.06ZM0.08 -0.04A0.09 0.11 0 1 0 0.26 -0.04A0.09 0.11 0 1 0 0.08 -0.04Z', fill: 'ink' },
    ] },
    { id: 'spikes', size: 1, paths: cutout(SPIKES_D, 'rockDeep', 'rock') },
    { id: 'moss', size: 1.1, paths: [
      { d: 'M-0.6 0.1C-0.5 -0.3 0 -0.45 0.4 -0.25C0.7 -0.1 0.6 0.3 0.2 0.38C-0.15 0.46 -0.55 0.4 -0.6 0.1Z', fill: 'foliageDeep', opacity: 0.55 },
    ] },
    // top-down ROUND pillar (intact drum, vs the angular broken `pillar`):
    // concentric two-tone rings + a lit dressed-stone cap disc.
    { id: 'column', size: 1.1, wonk: 0.03, paths: [
      { d: ringPath(0.62, 0.08, 0.12), fill: 'shadow', opacity: 0.22 },
      ...cutout(ringPath(0.6), 'rockDeep', 'rock'),
      { d: ringPath(0.44), fill: 'rockDeep' },
      { d: ringPath(0.34), fill: 'stoneBase', lit: true },
    ] },
    // stacked course of cut BRICKS with mortar seams (the "Exterior Bricks" tile):
    // pale dressed faces over a dark base, crisp mortar strokes.
    { id: 'bricks', size: 1, wonk: 0.03, paths: [
      ...cutout(BRICKS_D, 'rockDeep', 'stoneBase'),
      { d: BRICK_SEAMS, stroke: 'mortarInk', sw: 0.035 },
    ] },
    // fine GRAVEL scatter (Rubble E/F/G) — many small loose stones, distinct from
    // the chunky `rubble`.
    { id: 'gravel', size: 1, wonk: 0.03, paths: cutout(GRAVEL_D, 'rock', 'stoneBase') },
    // corner COBWEB decal: pale radial spokes + connecting arcs at low opacity.
    { id: 'cobweb', size: 1.1, wonk: 0.03, paths: [
      { d: COBWEB.spokes, stroke: 'cream', sw: 0.025, opacity: 0.5 },
      { d: COBWEB.arcs, stroke: 'cream', sw: 0.02, opacity: 0.42 },
    ] },
    // ── dungeon dressing ──
    { id: 'brazier', size: 0.85, wonk: 0.03, paths: [
      { d: BRAZIER_LEGS, stroke: 'lampPost', sw: 0.11 },
      { d: BRAZIER_RIM, fill: 'lampPost' },
      { d: BRAZIER_BOWL, fill: 'emberDeep' },
      { d: BRAZIER_FLAME, fill: 'ember' },
    ] },
    { id: 'chains', size: 1.1, wonk: 0.04, paths: [
      { d: CHAINS_D, stroke: 'lampPost', sw: 0.08 },
      { d: CHAINS_HI, stroke: 'steel', sw: 0.06, lit: true },
    ] },
    { id: 'cage', size: 1.05, wonk: 0.03, paths: [
      { d: CAGE_RECESS, fill: 'stoneDark', opacity: 0.55 },
      { d: CAGE_FRAME, stroke: 'lampPost', sw: 0.1 },
      { d: CAGE_BARS, stroke: 'lampPost', sw: 0.05 },
      { d: CAGE_BONE, stroke: 'cream', sw: 0.09, opacity: 0.7 },
    ] },
    { id: 'urn', size: 0.9, wonk: 0.04, paths: [
      ...cutout(URN_BIG, 'woodDeep', 'woodLight'),
      { d: URN_RIM, stroke: 'ink', sw: 0.05, opacity: 0.55 },
      { d: URN_TIPPED, fill: 'canvas' },
      { d: URN_MOUTH, fill: 'stoneDark' },
    ] },
    // bars/rim lifted off near-black + a lit rim arc up-left, so the circle
    // silhouette survives on the dark stone ground (judge pass)
    { id: 'grate', size: 0.85, wonk: 0.03, paths: [
      { d: GRATE_RECESS, fill: 'stoneDark' },
      { d: GRATE_BARS, stroke: 'rockDeep', sw: 0.07 },
      { d: GRATE_RECESS, stroke: 'rockDeep', sw: 0.08 },
      { d: 'M-0.54 -0.1A0.55 0.55 0 0 1 -0.1 -0.54', stroke: 'stoneBase', sw: 0.05, opacity: 0.8 },
    ] },
    { id: 'puddle', size: 1.1, paths: [
      { d: PUDDLE_D, fill: 'waterShallow', opacity: 0.75 },
      { d: PUDDLE_GLINT, stroke: 'waterHi', sw: 0.06, opacity: 0.6 },
    ] },
    { id: 'bloodstain', size: 1, paths: [
      { d: BLOODSTAIN_D, fill: 'bloodDry', opacity: 0.6 },
      { d: BLOODSTAIN_DOTS, fill: 'bloodDry', opacity: 0.55 },
    ] },
    { id: 'statue', size: 1.1, wonk: 0.035, paths: [
      { d: STATUE_SHADOW, fill: 'shadow', opacity: 0.25 },
      ...cutout(STATUE_PLINTH, 'rockDeep', 'rock'),
      { d: STATUE_FIGURE, fill: 'stoneBase' },
      { d: STATUE_HOODSHADOW, fill: 'shadow', opacity: 0.3 },
      { d: STATUE_HOOD, fill: 'rock' },
    ] },
    { id: 'altar', size: 1.15, wonk: 0.03, paths: [
      { d: ALTAR_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(ALTAR_SLAB, 'rockDeep', 'stoneBase'),
      { d: ALTAR_RUNNER, fill: 'bloodDry', opacity: 0.85 },
      { d: ALTAR_CANDLES, fill: 'cream' },
    ] },
    { id: 'chest', size: 0.85, wonk: 0.03, paths: [
      ...cutout(CHEST_D, 'woodDeep', 'wood'),
      { d: CHEST_STRAPS, stroke: 'ink', sw: 0.07, opacity: 0.7 },
      { d: CHEST_CLASP, fill: 'bannerGold' },
    ] },
    { id: 'spiketrap', size: 0.95, wonk: 0.025, paths: [
      { d: SPIKETRAP_PLATE, fill: 'stoneDark' },
      { d: SPIKETRAP_BORDER, stroke: 'mortarInk', sw: 0.045 },
      { d: SPIKETRAP_SPIKES, fill: 'steel' },
      { d: SPIKETRAP_TIPS, fill: 'stoneBase' },
    ] },
    { id: 'cask', size: 0.95, wonk: 0.04, paths: [
      { d: CASK_CRATE, fill: 'woodLight' },
      { d: CASK_STRAP, stroke: 'ink', sw: 0.06, opacity: 0.6 },
      ...cutout(CASK_BARREL, 'woodDeep', 'wood'),
      { d: CASK_HOOP, stroke: 'ink', sw: 0.05, opacity: 0.6 },
    ] },
    // ── mountain / high country ──
    // mountain PINE from above: a lean sharp 7-arm star crown (deeper valleys
    // than the plaza conifer) with snow dusting the lit up-left shoulders.
    { id: 'pine', size: 1.2, wonk: 0.05, paths: [
      { d: 'M0.14 0.6A0.46 0.26 0 1 0 0.16 0.64Z', fill: 'shadow', opacity: 0.26 },
      { d: PINE_OUT, fill: 'foliageDeep' },
      { d: PINE_IN, fill: 'foliage', lit: true },
      { d: PINE_SNOW, fill: 'snow', opacity: 0.9 },
    ] },
    // dead SNAG from above: sparse crooked bare limbs radiating from the broken
    // trunk disc — the skeletal counterpoint to the pine crown.
    { id: 'snag', size: 0.95, paths: [
      { d: SNAG_BRANCHES, stroke: 'woodDeep', sw: 0.07 },
      ...cutout(SNAG_TRUNK, 'woodDeep', 'wood'),
    ] },
    // SNOWPATCH decal: soft irregular drift, shade rim with a lighter core
    // offset up-left — pure flat ground read.
    { id: 'snowpatch', size: 1.1, paths: [
      { d: SNOWPATCH_D, fill: 'snowShade', opacity: 0.6 },
      { d: SNOWPATCH_CORE, fill: 'snow', opacity: 0.7 },
    ] },
    // OREVEIN: a two-tone boulder crossed by a jagged glinting gold seam with a
    // few steel nuggets — the "mine country" signature rock.
    { id: 'orevein', size: 0.95, wonk: 0.035, paths: [
      ...cutout(OREVEIN_D, 'rockDeep', 'rock'),
      { d: OREVEIN_SEAM, stroke: 'bannerGold', sw: 0.06, opacity: 0.9 },
      { d: OREVEIN_NUGGETS, fill: 'steel', opacity: 0.85 },
    ] },
    // abandoned MINECART from above: plank box astride a rail pair, dark ore
    // bed inside, inked rim.
    { id: 'minecart', size: 0.95, wonk: 0.03, paths: [
      { d: MINECART_RAILS, stroke: 'steel', sw: 0.06, opacity: 0.8 },
      ...cutout(MINECART_BOX, 'woodDeep', 'wood'),
      { d: MINECART_BED, fill: 'ink', opacity: 0.75 },
      { d: MINECART_BOX, stroke: 'ink', sw: 0.05, opacity: 0.6 },
    ] },
    // BEAMFRAME: collapsed crossed mine timbers (thick strokes, lit top edge)
    // plus a broken splinter — tunnel-mouth wreckage.
    { id: 'beamframe', size: 1.05, paths: [
      { d: BEAMFRAME_D, stroke: 'woodDeep', sw: 0.15 },
      { d: BEAMFRAME_D, stroke: 'wood', sw: 0.07, lit: true },
      { d: BEAMFRAME_SPLINTER, stroke: 'woodDeep', sw: 0.09 },
    ] },
    // CAIRN: three stacked stone discs, each smaller and offset up-left toward
    // the light, with a snow-dab cap stone — a waymarker beside the path.
    { id: 'cairn', size: 0.85, wonk: 0.04, paths: [
      { d: CAIRN_BASE, fill: 'rockDeep' },
      { d: CAIRN_MID, fill: 'rock' },
      { d: CAIRN_TOP, fill: 'stoneBase' },
      { d: CAIRN_CAP, fill: 'snow', opacity: 0.95 },
    ] },
    // ALPINEBLOOM: hardy flowers in a rock crevice — a two-tone pebble pair
    // with foliage flecks and tiny bloom/cream dots peeking between.
    { id: 'alpinebloom', size: 0.75, wonk: 0.035, paths: [
      ...cutout(ALPINEBLOOM_ROCKS, 'rockDeep', 'rock'),
      { d: ALPINEBLOOM_LEAVES, fill: 'foliage' },
      { d: ALPINEBLOOM_DOTS, fill: 'bloom' },
      { d: ALPINEBLOOM_CREAM, fill: 'cream' },
    ] },
    // ── interactable states (stone) ──
    // SHUT door: two stone jamb stubs bracketing a plank panel that spans the
    // gap; ink hinge ticks at the left jamb + plank seams. State pair with
    // `dooropen` — identical jambs, identical panel rect.
    { id: 'doorshut', size: 1.05, wonk: 0.025, paths: [
      ...cutout(DOOR_JAMBS, 'rockDeep', 'rock'),
      ...cutout(DOOR_PANEL, 'woodDeep', 'wood'),
      { d: DOORSHUT_TICKS, stroke: 'ink', sw: 0.04, opacity: 0.7 },
    ] },
    // OPEN door: the SAME jambs, the SAME panel swung ~70° from the left-jamb
    // hinge, revealing the dark doorway (+ hinge pin) beneath.
    { id: 'dooropen', size: 1.05, wonk: 0.025, paths: [
      { d: DOOROPEN_GAP, fill: 'ink', opacity: 0.9 },
      ...cutout(DOOR_JAMBS, 'rockDeep', 'rock'),
      ...cutout(DOOROPEN_PANEL, 'woodDeep', 'wood'),
    ] },
    // floor LEVER: small stone base plate with a dark throw slot, an angled
    // iron handle ending in a gold knob — the knob is the "pull me" cue.
    { id: 'lever', size: 0.7, wonk: 0.03, paths: [
      ...cutout(LEVER_PLATE, 'rockDeep', 'rock'),
      { d: LEVER_SLOT, stroke: 'ink', sw: 0.07, opacity: 0.8 },
      { d: LEVER_HANDLE, stroke: 'steel', sw: 0.09 },
      { d: LEVER_KNOB, fill: 'bannerGold' },
    ] },
    // pressure FLOORPLATE: square dark recess with the plate inset a step
    // below floor level, a worn dimple at its center.
    { id: 'floorplate', size: 0.85, wonk: 0.025, paths: [
      { d: FLOORPLATE_RECESS, fill: 'stoneDark' },
      ...cutout(FLOORPLATE_D, 'rockDeep', 'rock'),
      { d: FLOORPLATE_DIMPLE, fill: 'stoneDark', opacity: 0.8 },
    ] },
    // OPEN chest: `chest`'s exact body rect (CHEST_D), lid flipped up behind
    // it showing the lit inner face, ink interior with gold loot glints; the
    // gold hasp dot now rides the lid. State pair with `chest`.
    { id: 'chestopen', size: 0.85, wonk: 0.03, paths: [
      { d: CHESTOPEN_LID, fill: 'woodLight' },
      ...cutout(CHEST_D, 'woodDeep', 'wood'),
      { d: CHESTOPEN_HOLLOW, fill: 'ink' },
      // the closed chest's signature center strap continues across the flipped
      // lid, so open reads as the SAME chest opened (judge pass)
      { d: 'M0 -0.74L0 -0.38', stroke: 'ink', sw: 0.07, opacity: 0.7 },
      { d: CHESTOPEN_GLINTS, fill: 'bannerGold' },
    ] },
    // SHATTERED urn: `urn`'s ceramic tones as an angular shard ring around a
    // dark spill where URN_BIG stood, one surviving rim-arc shard. State pair
    // with `urn`.
    // spill damped + rim restroked in the urn's own lit ceramic (judge pass:
    // both ink anchors died on the dark floor, leaving unanchored chips)
    { id: 'urnshards', size: 0.9, wonk: 0.04, paths: [
      { d: URNSHARDS_SPILL, fill: 'ink', opacity: 0.4 },
      ...cutout(URNSHARDS_D, 'woodDeep', 'woodLight'),
      { d: URNSHARDS_RIM, stroke: 'woodLight', sw: 0.06, opacity: 0.85 },
    ] },

    // ── pickups ──
    { id: 'coin', size: 0.6, wonk: 0.03, paths: [
      { d: COIN_UNDER, fill: 'woodDeep' },
      ...cutout(COIN_D, 'woodDeep', 'bannerGold'),
      { d: COIN_RIM, stroke: 'woodDeep', sw: 0.055, opacity: 0.7 },
      { d: COIN_GLINT, stroke: 'lampGlow', sw: 0.07, opacity: 0.9 },
    ] },
    { id: 'gem', size: 0.55, wonk: 0.025, paths: [
      ...cutout(GEM_D, 'bannerBlueDk', 'bannerBlue'),
      { d: GEM_SEAMS, stroke: 'bannerBlueDk', sw: 0.045, opacity: 0.8 },
      { d: GEM_SPARK, fill: 'cream' },
    ] },
    { id: 'potion', size: 0.62, wonk: 0.03, paths: [
      ...cutout(POTION_GLASS, 'stoneDark', 'murkDeep'),
      { d: POTION_LIQUID, fill: 'glowFungus', opacity: 0.92 },
      { d: POTION_CORK, fill: 'cream' },
      { d: POTION_GLINT, stroke: 'cream', sw: 0.05, opacity: 0.55 },
    ] },
    // steel body, not lampPost (judge pass: near-black iron vanished on the
    // dark tile — the one prop a player must SPOT); a dark under-copy keeps depth.
    { id: 'key', size: 0.62, wonk: 0.025, paths: [
      { d: KEY_FRAME, stroke: 'lampPost', sw: 0.16 },
      { d: KEY_FRAME, stroke: 'steel', sw: 0.1, lit: true },
      { d: KEY_TEETH, fill: 'steel' },
    ] },
    // ── snow / tundra ──
    // FROZEN POND decal: snowShade ice blob, steel sheen up-left, two hairline
    // cracks, snow rim crescent on the windward shore — all muted, no white glare.
    { id: 'frozenpond', size: 1.15, paths: [
      { d: FROZENPOND_D, fill: 'snowShade', opacity: 0.55 },
      { d: FROZENPOND_SHEEN, fill: 'steel', opacity: 0.45 },
      { d: FROZENPOND_CRACKS, stroke: 'waterHi', sw: 0.05, opacity: 0.6 },
      { d: FROZENPOND_RIM, fill: 'snow', opacity: 0.7 },
    ] },
    // SNOWDRIFT: two-tone wind-tailed drift, shade base + muted lit core; the
    // tapering tail is the signature (snowpatch is round — this one streams).
    { id: 'snowdrift', size: 1.05, paths: [
      { d: SNOWDRIFT_D, fill: 'snowShade', opacity: 0.6 },
      { d: SNOWDRIFT_CORE, fill: 'snow', opacity: 0.75 },
    ] },
    // ICICLE CLUSTER: two-tone rock lip + a fan of translucent snow spikes with a
    // faint snowShade outline so the pale ice reads on dark ground.
    { id: 'iciclecluster', size: 0.85, wonk: 0.035, paths: [
      ...cutout(ICICLECLUSTER_ROCK, 'rockDeep', 'rock'),
      { d: ICICLECLUSTER_SPIKES, fill: 'snow', opacity: 0.7 },
      { d: ICICLECLUSTER_SPIKES, stroke: 'snowShade', sw: 0.04, opacity: 0.5 },
    ] },
    // ICE TREE: bare woodDeep limbs + two-tone trunk disc, snow dabs iced onto the
    // up-left limbs — the frozen counterpoint to the mountain snag.
    { id: 'icetree', size: 1.1, wonk: 0.04, paths: [
      { d: ICETREE_BRANCHES, stroke: 'woodDeep', sw: 0.07 },
      ...cutout(ICETREE_TRUNK, 'woodDeep', 'wood'),
      { d: ICETREE_ICE, fill: 'snow', opacity: 0.75 },
    ] },
    // ICE HUT: domed snow shelter — shade dome, muted lit cap, block-course seam
    // strokes, dark entrance stub down-right. Marquee snow accent (5 paths).
    { id: 'icehut', size: 1.15, wonk: 0.03, paths: [
      { d: ICEHUT_SHADOW, fill: 'shadow', opacity: 0.22 },
      { d: ICEHUT_DOME, fill: 'snowShade', opacity: 0.9 },
      { d: ICEHUT_CAP, fill: 'snow', opacity: 0.75 },
      { d: ICEHUT_SEAMS, stroke: 'snowShade', sw: 0.05, opacity: 0.8 },
      { d: ICEHUT_DOOR, fill: 'stoneDark' },
    ] },
    // ICE FLOE: waterDeep gap under three angular translucent plates; waterHi
    // glints on the freshly-broken edges.
    { id: 'icefloe', size: 1.05, wonk: 0.05, paths: [
      { d: ICEFLOE_GAP, fill: 'waterDeep', opacity: 0.85 },
      { d: ICEFLOE_PLATES, fill: 'snow', opacity: 0.7 },
      { d: ICEFLOE_EDGE, stroke: 'waterHi', sw: 0.05, opacity: 0.5 },
    ] },
    // ── volcanic ──
    // ── volcanic ──
    // glowing lava FISSURE decal: dark gape > emberDeep cooling seam > live
    // ember core down the main run (registered strokes — keep wonk gentle).
    { id: 'lavacrack', size: 1.2, wonk: 0.035, paths: [
      { d: LAVACRACK_MAIN, stroke: 'stoneDark', sw: 0.16 },
      { d: LAVACRACK_MAIN, stroke: 'emberDeep', sw: 0.085, opacity: 0.9 },
      { d: LAVACRACK_CORE, stroke: 'ember', sw: 0.045, opacity: 0.95 },
    ] },
    { id: 'obsidianflow', size: 1, paths: [
      ...cutout(OBSIDIANFLOW_D, 'stoneDark', 'ink'),
      { d: OBSIDIANFLOW_GLINT, stroke: 'cream', sw: 0.04, opacity: 0.5 },
    ] },
    { id: 'sulfurvent', size: 0.9, wonk: 0.03, paths: [
      { d: SULFURVENT_FAN, fill: 'bannerGold', opacity: 0.3 },
      ...cutout(SULFURVENT_CONE, 'rockDeep', 'rock'),
      { d: SULFURVENT_CRUST, stroke: 'th2', sw: 0.1 },
      { d: SULFURVENT_THROAT, fill: 'stoneDark' },
    ] },
    { id: 'ashpile', size: 1, paths: [
      { d: ASHPILE_D, fill: 'stoneDark', opacity: 0.9 },
      { d: ASHPILE_CORE, fill: 'stoneBase', opacity: 0.3 },
      { d: ASHPILE_FLECKS, fill: 'stoneBase', opacity: 0.5 },
    ] },
    { id: 'charsnag', size: 1, wonk: 0.035, paths: [
      { d: CHARSNAG_LIMBS, stroke: 'ink', sw: 0.11 },
      { d: CHARSNAG_TRUNK, fill: 'ink' },
      { d: CHARSNAG_COALS, fill: 'emberDeep' },
      { d: CHARSNAG_TIPS, fill: 'ember' },
    ] },
    { id: 'geyserpool', size: 1.1, wonk: 0.03, paths: [
      ...cutout(GEYSERPOOL_TERRACE, 'rockDeep', 'stoneBase'),
      { d: GEYSERPOOL_CRUST, fill: 'th2', opacity: 0.9 },
      { d: GEYSERPOOL_RIM, fill: 'rockDeep' },
      { d: GEYSERPOOL_POOL, fill: 'waterHi' },
    ] },
    // ── arcane ──
    // ── arcane dressing ──
    // carved STANDING RUNE STONE: tapered two-tone slab, three bannerBlue rune
    // ticks reading as a live glow on the dark face.
    { id: 'runestone', size: 1.05, wonk: 0.03, paths: [
      { d: 'M-0.26 0.6A0.38 0.15 0 1 0 0.5 0.6A0.38 0.15 0 1 0 -0.26 0.6Z', fill: 'shadow', opacity: 0.25 },
      ...cutout(RUNESTONE_D, 'rockDeep', 'rock'),
      { d: RUNESTONE_RUNES, stroke: 'bannerBlue', sw: 0.06 },
    ] },
    // LEVITATING SHARD: small angular shard hanging up-left of its detached
    // shadow; a bannerBlue edge glint marks the lifting magic.
    { id: 'floatshard', size: 0.6, wonk: 0.04, paths: [
      { d: FLOATSHARD_SHADOW, fill: 'shadow', opacity: 0.25 },
      ...cutout(FLOATSHARD_D, 'rockDeep', 'rock'),
      { d: FLOATSHARD_GLINT, stroke: 'bannerBlue', sw: 0.05, opacity: 0.8 },
    ] },
    // glowing MANA POOL decal: dark arcane pool, bright welling core, thin
    // cream lip glint up-left. Flat — no cutout, like murkpool.
    { id: 'manapool', size: 1.05, paths: [
      { d: MANAPOOL_D, fill: 'bannerBlueDk' },
      { d: MANAPOOL_CORE, fill: 'bannerBlue', opacity: 0.85 },
      { d: MANAPOOL_GLINT, stroke: 'cream', sw: 0.035, opacity: 0.75 },
    ] },
    // inscribed RITUAL CIRCLE decal: double inked ring, a triangle between
    // them, three glowing node dots at the vertices.
    { id: 'magiccircle', size: 1.15, wonk: 0.025, paths: [
      { d: MAGICCIRCLE_RINGS, stroke: 'mortarInk', sw: 0.045 },
      { d: MAGICCIRCLE_TRI, stroke: 'mortarInk', sw: 0.04, opacity: 0.85 },
      { d: MAGICCIRCLE_NODES, fill: 'bannerBlue' },
    ] },
    // broken PORTAL FRAME: two ragged two-tone pillar stubs, a faint bannerBlue
    // shimmer arcing across the dead gate's gap (a second, fainter haze arc).
    { id: 'portalframe', size: 1.2, wonk: 0.04, paths: [
      ...cutout(PORTALFRAME_D, 'rockDeep', 'rock'),
      { d: PORTALFRAME_SHIMMER, stroke: 'bannerBlue', sw: 0.07, opacity: 0.55 },
      { d: PORTALFRAME_HAZE, stroke: 'bannerBlue', sw: 0.05, opacity: 0.25 },
    ] },
    // tall ARCANE CRYSTAL spire: big faceted spike + two satellite shards in
    // one two-tone cutout, cream facet glints selling the gleam.
    { id: 'crystalspire', size: 1.15, wonk: 0.04, paths: [
      { d: CRYSTALSPIRE_SHADOW, fill: 'shadow', opacity: 0.24 },
      ...cutout(CRYSTALSPIRE_D, 'bannerBlueDk', 'bannerBlue'),
      { d: CRYSTALSPIRE_GLINT, stroke: 'cream', sw: 0.05, opacity: 0.85 },
    ] },
    // ── connective structures (stone) ──
    // PORTCULLIS: iron lattice between stone jambs — the closed choke point.
    { id: 'portcullis', size: 1.05, wonk: 0.025, paths: [
      ...cutout(PORTCULLIS_JAMBS, 'rockDeep', 'rock'),
      { d: PORTCULLIS_GRID, stroke: 'lampPost', sw: 0.07 },
      { d: PORTCULLIS_GRID_HI, stroke: 'steel', sw: 0.045, lit: true },
    ] },
    // BROKEN GATE: one jamb standing, one toppled, splintered scraps — the choke
    // point that no longer chokes.
    { id: 'brokengate', size: 1.05, wonk: 0.035, paths: [
      ...cutout(BROKENGATE_D, 'rockDeep', 'rock'),
      { d: BROKENGATE_SPLINTERS, fill: 'woodDeep' },
      { d: 'M-0.5 -0.1L-0.2 -0.02M0.1 0.1L0.35 0.32', stroke: 'ink', sw: 0.04, opacity: 0.5 },
    ] },
    // CAVE MOUTH: rocky arch blob around a dark maw + scree lip — the
    // overworld→underground portal.
    { id: 'cavemouth', size: 1.3, wonk: 0.04, paths: [
      ...cutout(CAVEMOUTH_D, 'rockDeep', 'rock'),
      { d: CAVEMOUTH_MAW, fill: 'ink' },
      { d: CAVEMOUTH_SCREE, fill: 'rock' },
    ] },
    // MINE ADIT: timber-framed dark opening with rail stubs running out.
    { id: 'mineentrance', size: 1.1, wonk: 0.03, paths: [
      { d: MINEENTRANCE_MAW, fill: 'ink' },
      { d: MINEENTRANCE_RAILS, stroke: 'steel', sw: 0.05, opacity: 0.8 },
      { d: MINEENTRANCE_BEAMS, stroke: 'woodDeep', sw: 0.13 },
      { d: MINEENTRANCE_LINTEL, stroke: 'wood', sw: 0.13, lit: true },
    ] },
    // STAIRWELL DOWN: banded steps descending into ink — the dungeon-level portal.
    { id: 'stairdown', size: 1, wonk: 0.02, paths: [
      { d: STAIRDOWN_WELL, fill: 'stoneDark' },
      { d: STAIRDOWN_S1, fill: 'stoneBase' },
      { d: STAIRDOWN_S2, fill: 'rock' },
      { d: STAIRDOWN_S3, fill: 'rockDeep' },
      { d: STAIRDOWN_PIT, fill: 'ink' },
    ] },
    // LADDER over a hatch: rails + rungs across a dark hole.
    { id: 'ladder', size: 0.85, wonk: 0.03, paths: [
      { d: LADDER_HATCH, fill: 'ink' },
      { d: LADDER_RAILS, stroke: 'wood', sw: 0.09 },
      { d: LADDER_RUNGS, stroke: 'woodDeep', sw: 0.06 },
    ] },
    // ── cave / underground (stone) ──
    { id: 'stalagmite', size: 1, wonk: 0.035, paths: [
      ...cutout(STALAGMITE_OUTER, 'rockDeep', 'rock'),
      { d: STALAGMITE_MID, fill: 'stoneBase', opacity: 0.55 },
      { d: STALAGMITE_TIP, fill: 'cream', opacity: 0.85 },
    ] },
    { id: 'stalactite', size: 0.8, paths: [
      { d: STALACTITE_SHADOW, fill: 'shadow', opacity: 0.3 },
      ...cutout(STALACTITE_TIP, 'rockDeep', 'cream'),
    ] },
    { id: 'crystalcluster', size: 0.85, wonk: 0.03, paths: [
      { d: CRYSTALCLUSTER_SHADOW, fill: 'shadow', opacity: 0.24 },
      ...cutout(CRYSTALCLUSTER_D, 'bannerBlueDk', 'bannerBlue'),
      { d: CRYSTALCLUSTER_GLINT, stroke: 'cream', sw: 0.05, opacity: 0.85 },
    ] },
    { id: 'cavepool', size: 1.05, paths: [
      { d: CAVEPOOL_D, fill: 'waterDeep' },
      { d: CAVEPOOL_RIM, stroke: 'waterHi', sw: 0.045, opacity: 0.6 },
      { d: CAVEPOOL_DOTS, fill: 'cream', opacity: 0.5 },
    ] },
    { id: 'glowworms', size: 0.9, wonk: 0.03, paths: [
      { d: ringPath(0.55, 0.02, -0.02), fill: 'glowFungus', opacity: 0.12 },
      { d: GLOWWORMS_DOTS_D, fill: 'glowFungus', opacity: 0.85 },
    ] },
    { id: 'flowstone', size: 1, wonk: 0.04, paths: [
      ...cutout(FLOWSTONE_D, 'rock', 'stoneBase'),
      { d: FLOWSTONE_RIBS, stroke: 'mortarInk', sw: 0.035, opacity: 0.4 },
    ] },
    // ── city & dungeon furniture (stone) ──
    { id: 'sarcophagus', size: 1.05, wonk: 0.03, paths: [
      ...cutout(SARCOPHAGUS_BODY, 'rockDeep', 'rock'),
      { d: SARCOPHAGUS_FIGURE, fill: 'stoneBase' },
      { d: SARCOPHAGUS_CHIP, fill: 'stoneDark' },
    ] },
    { id: 'bookshelf', size: 1, wonk: 0.03, paths: [
      { d: BOOKSHELF_FRAME, fill: 'woodDeep' },
      { d: BOOKSHELF_ROWS, stroke: 'ink', sw: 0.04, opacity: 0.7 },
      { d: BOOKSHELF_BLUE, fill: 'bannerBlue' },
      { d: BOOKSHELF_BLOOD, fill: 'bloodDry' },
      { d: BOOKSHELF_TH2, fill: 'th2' },
    ] },
    { id: 'weaponrack', size: 0.9, wonk: 0.03, paths: [
      ...cutout(WEAPONRACK_FRAME, 'woodDeep', 'wood'),
      { d: WEAPONRACK_HAFTS, stroke: 'woodDeep', sw: 0.09 },
      { d: WEAPONRACK_BLADES, stroke: 'steel', sw: 0.06 },
    ] },
    { id: 'hoard', size: 0.85, wonk: 0.03, paths: [
      { d: HOARD_BASE, fill: 'woodDeep' },
      { d: HOARD_COINS, fill: 'bannerGold' },
      { d: HOARD_GEM, fill: 'bannerBlue' },
      { d: HOARD_GLINT, fill: 'cream' },
    ] },
    { id: 'floorrunes', size: 1, wonk: 0.03, paths: [
      { d: FLOORRUNES_TICKS, stroke: 'mortarInk', sw: 0.05, opacity: 0.55 },
      { d: FLOORRUNES_GLYPH, stroke: 'bannerBlue', sw: 0.06, opacity: 0.5 },
    ] },
    // ── state pairs II (stone) ──
    // UNLIT brazier: `brazier`'s exact iron legs/rim/bowl geometry, but the
    // coal bed reads cold (stoneDark, no ember roles) and the flame is gone,
    // left with a single pale ash fleck. State pair with `brazier`.
    // lit rim arc up-left (judge pass: all-dark iron + char vanished on the
    // dark floor — same fix as `grate`); the missing glow stays the state tell.
    { id: 'braziercold', size: 0.85, wonk: 0.03, paths: [
      { d: BRAZIER_LEGS, stroke: 'lampPost', sw: 0.11 },
      { d: BRAZIER_RIM, fill: 'lampPost' },
      { d: 'M-0.49 -0.1A0.5 0.5 0 0 1 -0.1 -0.49', stroke: 'rockDeep', sw: 0.06, opacity: 0.9 },
      { d: BRAZIER_BOWL, fill: 'stoneDark' },
      { d: BRAZIERCOLD_ASH, fill: 'cream', opacity: 0.6 },
    ] },
    // ── flora catalog (alpine/arcane/volcanic groups) ──
    ...ALPINE_FLORA, ...ARCANE_FLORA, ...VOLCANIC_FLORA,
  ]),
  plaza: withVariants([
    { id: 'crate', size: 1, paths: [
      ...cutout(CRATE_D, 'woodDeep', 'wood'),
      { d: 'M-0.44 0.02L0.48 -0.04', stroke: 'ink', sw: 0.07, opacity: 0.6 },
    ] },
    { id: 'barrel', size: 0.9, paths: [
      ...cutout(BARREL_D, 'woodDeep', 'wood'),
      { d: 'M-0.2 0A0.2 0.2 0 1 0 0.2 0A0.2 0.2 0 1 0 -0.2 0Z', stroke: 'ink', sw: 0.06, opacity: 0.5 },
    ] },
    { id: 'sack', size: 0.9, paths: cutout(SACK_D, 'woodDeep', 'canvas') },
    { id: 'wheel', size: 0.9, wonk: 0.04, paths: [
      { d: 'M-0.55 0A0.55 0.55 0 1 0 0.55 0A0.55 0.55 0 1 0 -0.55 0Z', stroke: 'wood', sw: 0.14 },
      { d: 'M-0.45 0L0.45 0M0 -0.45L0 0.45M-0.32 -0.32L0.32 0.32M-0.32 0.32L0.32 -0.32', stroke: 'woodDeep', sw: 0.08 },
      { d: 'M-0.12 0A0.12 0.12 0 1 0 0.12 0A0.12 0.12 0 1 0 -0.12 0Z', fill: 'woodDeep' },
    ] },
    { id: 'pot', size: 0.9, paths: [
      ...cutout(POT_D, 'woodDeep', 'woodLight'),
      { d: 'M-0.3 -0.26C-0.38 -0.55 -0.1 -0.72 0.1 -0.66C0.36 -0.6 0.4 -0.36 0.3 -0.26Z', fill: 'foliage' },
    ] },
    { id: 'signpost', size: 1, paths: [
      { d: 'M-0.06 0.6L-0.04 -0.7L0.08 -0.7L0.07 0.6Z', fill: 'woodDeep' },
      ...cutout(BOARD_D, 'woodDeep', 'wood'),
    ] },
    { id: 'coil', size: 0.8, paths: [
      { d: 'M-0.5 0A0.5 0.5 0 1 0 0.5 0A0.5 0.5 0 1 0 -0.5 0ZM-0.27 0A0.27 0.27 0 1 0 0.27 0A0.27 0.27 0 1 0 -0.27 0Z', stroke: 'canvas', sw: 0.13 },
      { d: 'M-0.1 0A0.1 0.1 0 1 0 0.1 0A0.1 0.1 0 1 0 -0.1 0Z', fill: 'shadow', opacity: 0.3 },
    ] },
    // top-down conifer (the pines lining Prontera's avenues): a two-tone spiky
    // crown with a lit inner star + a small trunk core
    { id: 'conifer', size: 1.15, wonk: 0.05, paths: [
      { d: 'M0.14 0.62A0.5 0.28 0 1 0 0.16 0.66Z', fill: 'shadow', opacity: 0.28 },
      { d: CONIFER_OUT, fill: 'foliageDeep' },
      { d: CONIFER_IN, fill: 'foliage', lit: true },
      { d: 'M-0.14 -0.05A0.14 0.14 0 1 0 0.14 -0.05A0.14 0.14 0 1 0 -0.14 -0.05Z', fill: 'pineLit' },
    ] },
    // top-down street lamp: an iron collar with a lit head (the ornate lamps
    // that ring the plaza)
    { id: 'lamppost', size: 0.6, wonk: 0.03, paths: [
      { d: 'M-0.3 0A0.3 0.3 0 1 0 0.3 0A0.3 0.3 0 1 0 -0.3 0Z', fill: 'lampPost' },
      { d: 'M-0.18 0A0.18 0.18 0 1 0 0.18 0A0.18 0.18 0 1 0 -0.18 0Z', fill: 'lampGlow' },
      { d: 'M-0.34 0L-0.14 0M0.14 0L0.34 0M0 -0.34L0 -0.14M0 0.14L0 0.34', stroke: 'lampGlow', sw: 0.07, opacity: 0.7 },
    ] },
    // top-down heraldic banner: a short pole with a hanging blue flag + gold
    // trim and a pale crest
    { id: 'banner', size: 0.85, wonk: 0.03, paths: [
      { d: 'M0.06 -0.5L0.5 -0.44L0.56 0.5L0.14 0.56Z', fill: 'shadow', opacity: 0.24 },
      ...cutout(BANNER_D, 'bannerBlueDk', 'bannerBlue'),
      { d: 'M0.04 -0.34L0.47 -0.29M0.08 0.34L0.5 0.4', stroke: 'bannerGold', sw: 0.06, opacity: 0.85 },
      { d: 'M0.2 0A0.11 0.13 0 1 0 0.42 0A0.11 0.13 0 1 0 0.2 0Z', fill: 'bannerGold', opacity: 0.9 },
      { d: 'M-0.16 -0.52A0.12 0.12 0 1 0 0.08 -0.52A0.12 0.12 0 1 0 -0.16 -0.52Z', fill: 'lampPost' },
    ] },
    // loose COBBLES (Cobble Scattered): a small cluster of pale two-tone round
    // paving stones on the street, over a soft ground shadow.
    { id: 'cobbles', size: 1, wonk: 0.03, paths: [
      { d: COBBLES_SHADOW, fill: 'shadow', opacity: 0.2 },
      ...cutout(COBBLES_D, 'roadSeam', 'stoneBase'),
    ] },
    // single dressed FLAGSTONE (Cobble Square): one pale two-tone slab with a
    // scored mortar edge, casting a flat drop shadow.
    { id: 'flagstone', size: 0.95, wonk: 0.03, paths: [
      { d: FLAGSTONE_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(FLAGSTONE_D, 'roadSeam', 'flagstoneLit'),
      { d: FLAGSTONE_SEAM, stroke: 'flagSeam', sw: 0.045 },
    ] },
    // ── connective structures (plaza) ──
    // CELLAR HATCH: two plank leaves in a stone frame, ring handle — the
    // town→cellar portal.
    { id: 'cellarhatch', size: 0.95, wonk: 0.025, paths: [
      ...cutout(CELLARHATCH_FRAME, 'rockDeep', 'rock'),
      ...cutout(CELLARHATCH_LEAVES, 'woodDeep', 'wood'),
      { d: CELLARHATCH_HANDLE, stroke: 'ink', sw: 0.05 },
    ] },
    // ── city & dungeon furniture (plaza) ──
    { id: 'marketstall', size: 1.05, wonk: 0.03, paths: [
      { d: MARKETSTALL_SHADOW, fill: 'shadow', opacity: 0.22 },
      ...cutout(MARKETSTALL_CANOPY_BASE, 'bannerBlueDk', 'bannerBlue'),
      { d: MARKETSTALL_STRIPES, fill: 'cream' },
      { d: MARKETSTALL_POSTS, fill: 'woodDeep' },
      { d: MARKETSTALL_CRATE, fill: 'wood' },
    ] },
    { id: 'bench', size: 1, wonk: 0.03, paths: [
      { d: BENCH_SHADOW, fill: 'shadow', opacity: 0.25 },
      ...cutout(BENCH_PLANKS, 'woodDeep', 'wood'),
      { d: BENCH_FRAME, stroke: 'ink', sw: 0.09, opacity: 0.7 },
    ] },
    { id: 'awning', size: 0.95, wonk: 0.03, paths: [
      { d: AWNING_BASE, fill: 'bannerGold' },
      { d: AWNING_STRIPES, fill: 'cream' },
      { d: AWNING_SCALLOPS, fill: 'bannerGold' },
      { d: AWNING_TIES, stroke: 'woodDeep', sw: 0.05 },
    ] },
    { id: 'hanglantern', size: 0.65, wonk: 0.03, paths: [
      { d: HANGLANTERN_SHADOW, fill: 'shadow', opacity: 0.28 },
      { d: HANGLANTERN_CORD, stroke: 'lampPost', sw: 0.05 },
      { d: HANGLANTERN_RING, fill: 'lampPost' },
      { d: HANGLANTERN_GLOW, fill: 'lampGlow' },
    ] },
    // ── state pairs II (plaza) ──
    // SMASHED crate: `crate`'s exact woodDeep/wood tones as splintered plank
    // slivers scattered across its old footprint, one intact corner surviving
    // whole, a scatter of thin ink splinter flecks. State pair with `crate`.
    { id: 'cratedebris', size: 1, paths: [
      ...cutout(CRATEDEBRIS_PLANKS, 'woodDeep', 'wood'),
      { d: CRATEDEBRIS_CORNER, fill: 'wood' },
      { d: CRATEDEBRIS_FLECKS, stroke: 'ink', sw: 0.04, opacity: 0.6 },
    ] },
    // SHATTERED planter pot: `pot`'s exact woodDeep/woodLight ceramic tones as
    // an angular shard ring around its old footprint, a spilled foliage sprig
    // tipped out, and a soft dirtPath soil blob. State pair with `pot`.
    { id: 'potdebris', size: 0.9, paths: [
      { d: POTDEBRIS_SOIL, fill: 'dirtPath' },
      ...cutout(POTDEBRIS_SHARDS, 'woodDeep', 'woodLight'),
      { d: POTDEBRIS_SPRIG, fill: 'foliage' },
    ] },
  ]),
}
