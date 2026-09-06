// ── Asset coverage (pure) ─────────────────────────────────────────────────────
//
// Which scatter CAPABILITIES exist per THEME, and which are GAPS. Pure data over
// the tagged prop catalog (`listAssets()` / props.ts `PROP_META`) — no React, no
// generation. It answers the question the placement tags raise but nothing
// surfaces: for a map of theme X, what can the generator actually draw on, and
// where does it fall back to filler?
//
// The generator (terrain.tsx `themeFilteredCands`/`roleFilteredCands`) keeps a
// prop for a themed map iff the prop is UNIVERSAL (no `themes`) OR its themes
// intersect the map's `regionTags`; an empty survivor set falls back to the full
// candidate list — so a gap NEVER breaks generation, it just renders cross-theme
// filler instead of a themed/edge/clump asset. This module reports those gaps as
// WARNINGS for a human to fill; it changes no behavior.
//
// Universal props (no `themes`) count toward EVERY theme's availability — a theme
// with only universal fillers still reads "no themed edge" if no universal edge
// prop exists. Only SCATTERABLE props (≥1 `kinds`) count: decor-ring assets
// (lamppost/banner, empty kinds) are never placed by scatter, so they don't
// contribute to coverage.

import { THEME_TAGS, SCATTER_KINDS, type ThemeTag, type ScatterKind } from '@/mapgen'
import type { PropRole } from '@/render/props'
import { listAssets, type AssetDescriptor } from '@/render/assets'

export const PROP_ROLES: PropRole[] = ['field', 'cluster', 'edge', 'understory', 'accent']

export interface ThemeCoverage {
  theme: ThemeTag
  themedCount: number                    // props STRICTLY tagged with this theme (scatterable)
  hasThemed: boolean                     // any themed prop? (else generation falls back to universal/cross-theme)
  availableCount: number                 // props the generator can draw on a map of this theme (themed + universal)
  byRole: Record<PropRole, number>       // available props, by placement role
  byKind: Record<ScatterKind, number>    // available props, by mapgen scatter kind (a prop counts toward each of its kinds)
  hasEdge: boolean                       // ≥1 edge-role prop → boundaries/verges get a ribbon (else fall back to filler)
  hasCluster: boolean                    // ≥1 cluster-role prop → scatter can clump (groves/beds)
  hasUnderstory: boolean                 // ≥1 understory-role prop → low sprigs near parents
  hasAccent: boolean                     // ≥1 accent-role prop → a rare hero prop
  gaps: string[]                         // human-readable, only REAL gaps
}

const isScatterable = (a: AssetDescriptor): boolean => a.category === 'prop' && (a.kinds?.length ?? 0) > 0
const isUniversal = (a: AssetDescriptor): boolean => !a.themes || a.themes.length === 0
const roleOf = (a: AssetDescriptor): PropRole => a.role ?? 'field'

function emptyRoleCounts(): Record<PropRole, number> {
  return { field: 0, cluster: 0, edge: 0, understory: 0, accent: 0 }
}
function emptyKindCounts(): Record<ScatterKind, number> {
  const o = {} as Record<ScatterKind, number>
  for (const k of SCATTER_KINDS) o[k] = 0
  return o
}

// Coverage for one theme, computed from the scatterable prop catalog. Deterministic.
export function coverageForTheme(theme: ThemeTag, props?: AssetDescriptor[]): ThemeCoverage {
  const all = (props ?? listAssets()).filter(isScatterable)
  const themed = all.filter((a) => (a.themes ?? []).includes(theme))
  // What the generator can draw on a map of this theme: its themed props + the
  // universal props (kept for every theme by the theme filter).
  const available = all.filter((a) => isUniversal(a) || (a.themes ?? []).includes(theme))

  const byRole = emptyRoleCounts()
  const byKind = emptyKindCounts()
  for (const a of available) {
    byRole[roleOf(a)]++
    for (const k of a.kinds ?? []) if (k in byKind) byKind[k as ScatterKind]++
  }

  const hasThemed = themed.length > 0
  const hasEdge = byRole.edge > 0
  const hasCluster = byRole.cluster > 0
  const hasUnderstory = byRole.understory > 0
  const hasAccent = byRole.accent > 0

  const gaps: string[] = []
  if (!hasThemed) {
    // Total gap: no themed prop at all → every cell falls back to the
    // universal / cross-theme candidate set. Subsumes the per-capability gaps.
    gaps.push('no themed props at all — every prop falls back to the universal / cross-theme set')
  } else {
    // Headline capabilities only — edge/ribbon (the field recipe places edge
    // items) and clumping carry the most placement signal. understory/accent are
    // sparse everywhere; they stay as grid flags (`hasUnderstory`/`hasAccent`),
    // not gap strings, so the gap list keeps its signal-to-noise.
    if (!hasEdge) gaps.push('no edge/ribbon assets — shoreline/verge/wall-skirt edges fall back to filler')
    if (!hasCluster) gaps.push('no cluster/grove assets — scatter never clumps')
    const weakKinds = SCATTER_KINDS.filter((k) => byKind[k] === 0)
    if (weakKinds.length) gaps.push(`no themed prop for kind(s): ${weakKinds.join(', ')} (those cells fall back to cross-theme props)`)
  }

  return {
    theme,
    themedCount: themed.length,
    hasThemed,
    availableCount: available.length,
    byRole,
    byKind,
    hasEdge,
    hasCluster,
    hasUnderstory,
    hasAccent,
    gaps,
  }
}

// Coverage for every theme, in THEME_TAGS order. Cheap + deterministic.
export function assetCoverage(): ThemeCoverage[] {
  const props = listAssets().filter(isScatterable)
  return THEME_TAGS.map((t) => coverageForTheme(t, props))
}

// Flat (theme, gap) list for the backlog / lab warning. Deterministic.
export function coverageGaps(): { theme: ThemeTag; gap: string }[] {
  return assetCoverage().flatMap((c) => c.gaps.map((gap) => ({ theme: c.theme, gap })))
}

// The subset of a theme set that lacks any edge/ribbon prop — the lab's headline
// warning (the field recipe places edge items). Empty = every theme has a ribbon.
export function themesMissingEdge(themes: readonly ThemeTag[]): ThemeTag[] {
  return themes.filter((t) => !coverageForTheme(t).hasEdge)
}

// The subset of a theme set that contributes NO themed prop (total fallback).
export function themesWithoutThemedProps(themes: readonly ThemeTag[]): ThemeTag[] {
  return themes.filter((t) => !coverageForTheme(t).hasThemed)
}
