// Dev-only mapgen lab (`?mapgen=1`): the human-validation surface for the
// procedural map generator (src/mapgen). Optimized for THROUGHPUT of eyeballs:
// staged layer tabs in BAKE ORDER (Surface → … → Final Map LAST), each tab
// carrying the knobs for the decision it owns (themes on Surface, river/outcrop
// dials on Geography, gates + party kit on Gates + Secrets, scatter dials + the
// themed prop pool on Dressing), a 3×3 seed contact sheet on the Final tab
// (nine maps per glance, like ?gallery=1 reviews the whole visual language in
// one screenshot), per-pass skips (the layer inspector — stream-isolated RNG
// means toggling a pass changes ONLY that layer), and the validation report +
// pass notes beside the picture so a human never has to guess why a map is
// wrong. Tuning sliders enter `params.tuning` only once MOVED (per-dial reset
// forgets them) — an untouched lab bakes byte-identical to no tuning at all.
// The Final tab's "▶ Play this map" seeds the current bake into a real battle
// (seedMapgenLabBattle) under a full-screen BattleView overlay.
//
// The focused view surfaces not just the four BAKED MapSpec planes but the
// DERIVED L4/L6 structure the generator computes and normally discards: the
// nav graph (spec.semantic.nav — nodes heat-colored by intensity, edges through
// their doorAt pinch, locked edges dashed), and the cell-resolution scratch
// planes (region claims, the flow distance-to-spawn heatmap, the desire-path
// mask, the walk mask). Those planes ride GenResult.scratch, which the pipeline
// only attaches under the dev `debug` flag this lab passes (never baked — see
// GenResult.scratch). Overlays COMPOSE, so you can read regions + graph + flow
// together. A showcase preset row jumps to curated seeds that each fire a
// distinct capability.
//
// Renders the MapSpec directly to <canvas> as a DEBUG view — this is not the
// paper skin and never will be; terrain.tsx consuming MapSpec is its own phase.

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  generateMap, RECIPE_REGISTRY, SURFACE_MATERIALS, THEME_TAGS, PROFICIENCY_TAGS,
  type GenParams, type GenResult, type MapgenTuning, type ProficiencyTag, type ThemeTag,
} from '@/mapgen'
import { themesMissingEdge, themesWithoutThemedProps } from '@/render/coverage'
import { TERRAIN_PROPS, matchesThemes, type PropDef } from '@/render/props'
import { propMarkup } from '@/render/terrain'
import { biomeForLocation } from '@/render/appearance'
import { useGameStore } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'
import { TICKS_PER_SECOND } from '@/lib/time'
import { MAPGEN_LAB_SIM_LOC, seedMapgenLabBattle, type MapgenLabBattleOpts } from './mapgenLabBattle'

const SURFACE_COLOR: Record<string, string> = {
  'grass': '#7aa85c', 'meadow': '#8fbf6a', 'dirt': '#a58a5e', 'sand': '#d9c489',
  'shallow-water': '#7ec8d8', 'deep-water': '#3a7fa8', 'stone-floor': '#9a9a94', 'road': '#c9b68e',
  'ash': '#8f8a80', 'lava': '#e0562e', 'snow': '#eef2f5', 'bog': '#66795a', 'gravel': '#b0a793',
}
const BARRIER_COLOR: Record<string, string> = {
  'rock': '#5d5344', 'cut-stone': '#6e675c', 'wood': '#7d5f3c', 'rubble': '#6f6555',
  'hedge': '#3f6b35', 'deep-water': '#2f6b91', 'ravine': '#4a453f', 'bars': '#9aa3ad',
}
const SCATTER_COLOR: Record<string, string> = {
  tree: '#2f5c2a', bush: '#4a7a3a', rock: '#57504a', stump: '#6e5233', flower: '#c86a8a', reed: '#5d8a4a',
}
const POI_COLOR: Record<string, string> = {
  spawn: '#22c55e', portal: '#a855f7', landmark: '#eab308', lair: '#ef4444', vault: '#f97316', gate: '#64748b', key: '#06b6d4',
}
// Nav-edge stroke by kind; the natural-pinch 'crossing' reads distinct (cyan).
const EDGE_COLOR: Record<string, string> = {
  crossing: '#22d3ee', corridor: '#94a3b8', road: '#d6b15e', 'desire-path': '#b98a4a',
}

// intensity/flow heatmap ramp: 0 = cool blue → 1 = hot red (through cyan/green/
// yellow). Cheap HSL sweep; the canvas-debug aesthetic, not the paper skin.
const heat = (t: number) => `hsl(${(1 - Math.max(0, Math.min(1, t))) * 240}, 85%, 50%)`
// stable per-region hue for the claims tint.
const regionColor = (id: number) => `hsl(${(id * 67) % 360}, 55%, ${46 + (id % 3) * 7}%)`
// scratch values are `unknown` (the L6 tier is untyped by contract). Guard the
// read so a future pass storing a different shape under a key the lab knows
// mis-draws NOTHING instead of throwing on a bad cast. Every producer today
// writes exactly these arrays; this only future-proofs the debug view.
const asU8 = (v: unknown): Uint8Array | undefined => (v instanceof Uint8Array ? v : undefined)
const asI32 = (v: unknown): Int32Array | undefined => (v instanceof Int32Array ? v : undefined)

interface Toggles {
  // baked MapSpec planes
  surface: boolean; collision: boolean; scatter: boolean; semantic: boolean
  // derived structure (nav graph is on the baked spec; the rest ride scratch)
  graph: boolean; regions: boolean; flow: boolean; paths: boolean; walk: boolean
}
type OverlayKey = keyof Toggles

const THUMB_TOGGLES: Toggles = {
  surface: true, collision: true, scatter: true, semantic: false,
  graph: false, regions: false, flow: false, paths: false, walk: false,
}

// Cumulative+highlight dim factor: overlays named in `dim` render this faint so
// THIS stage's owned structure (full alpha) reads on top of the earlier layers.
const DIM = 0.35

// drawSpec renders the MapSpec + derived overlays. `dim` (optional) is the
// cumulative+highlight lever the staged-tab lab uses: any OverlayKey in it draws
// at DIM×its normal alpha (the accreted base), everything else at full (this
// stage's owned structure). Passing no `dim` = every overlay full brightness
// (the Final tab, the contact-sheet thumbs) — byte-identical to the old lab.
function drawSpec(canvas: HTMLCanvasElement | null, result: GenResult, px: number, t: Toggles, dim?: Set<OverlayKey>) {
  if (!canvas) return
  const spec = result.spec
  const scratch = result.scratch
  const { cols, rows } = spec
  canvas.width = cols * px
  canvas.height = rows * px
  const g = canvas.getContext('2d')!
  const Y = (y: number) => (rows - y) * px   // world y-up → canvas y-down
  const af = (k: OverlayKey) => (dim?.has(k) ? DIM : 1)   // per-overlay alpha factor
  const fillCell = (x: number, y: number, style: string) => {
    g.fillStyle = style
    g.fillRect(x * px, Y(y + 1), px + 0.5, px + 0.5)
  }

  g.fillStyle = '#1c1917'
  g.fillRect(0, 0, canvas.width, canvas.height)

  // ── fills (bottom of the stack) ──────────────────────────────────────────
  if (t.surface) {
    g.globalAlpha = af('surface')
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        fillCell(x, y, SURFACE_COLOR[SURFACE_MATERIALS[spec.surface.grid[y * cols + x]]] ?? '#f0f')
      }
    }
    g.globalAlpha = 1
  }
  // walk mask: translucent wash over reachable ground (the validator's occupancy
  // model). Reading an absent key (regions skipped / recipe didn't produce it)
  // just draws nothing.
  const walk = asU8(scratch?.get('walk'))
  if (t.walk && walk) {
    g.globalAlpha = 0.22 * af('walk')
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walk[y * cols + x]) fillCell(x, y, '#4ade80')
    g.globalAlpha = 1
  }
  // region claims: stable per-region tint; -1 = unclaimed/blocked = transparent.
  const claims = asI32(scratch?.get('regions'))
  if (t.regions && claims) {
    g.globalAlpha = 0.5 * af('regions')
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = claims[y * cols + x]
        if (r >= 0) fillCell(x, y, regionColor(r))
      }
    }
    g.globalAlpha = 1
  }
  // flow: the 'flow' Int32Array (BFS cell distance from spawn) as a heatmap,
  // normalized to the plane's max; -1/blocked = transparent. Full-resolution
  // NavNode.intensity.
  const flow = asI32(scratch?.get('flow'))
  if (t.flow && flow) {
    let fmax = 0
    for (let i = 0; i < flow.length; i++) if (flow[i] > fmax) fmax = flow[i]
    g.globalAlpha = 0.55 * af('flow')
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = flow[y * cols + x]
        if (d >= 0) fillCell(x, y, heat(fmax > 0 ? d / fmax : 0))
      }
    }
    g.globalAlpha = 1
  }

  if (t.scatter) {
    g.globalAlpha = af('scatter')
    for (const s of spec.scatter) {
      g.fillStyle = SCATTER_COLOR[s.kind] ?? '#f0f'
      g.beginPath()
      g.arc(s.x * px, Y(s.y), Math.max(1.2, s.size * px * 0.35), 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }
  if (t.collision) {
    const ca = af('collision')
    for (const r of spec.collision) {
      g.fillStyle = BARRIER_COLOR[r.material] ?? '#f0f'
      g.globalAlpha = (r.kind === 'cliff' ? 0.6 : 1) * ca
      g.fillRect(r.x * px, Y(r.y + r.h), r.w * px, r.h * px)
      g.globalAlpha = ca
      g.strokeStyle = r.kind === 'cliff' ? '#e7e5e4' : '#292524'
      g.setLineDash(r.kind === 'cliff' ? [3, 3] : [])
      g.strokeRect(r.x * px, Y(r.y + r.h), r.w * px, r.h * px)
      g.setLineDash([])
    }
    g.globalAlpha = 1
  }
  // desire-path mask: the trodden trail cells, over fills but under the graph.
  const paths = asU8(scratch?.get('desire-paths'))
  if (t.paths && paths) {
    g.globalAlpha = 0.85 * af('paths')
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (paths[y * cols + x]) fillCell(x, y, '#e08a2c')
    g.globalAlpha = 1
  }

  // ── nav graph (on the baked spec — no scratch needed) ────────────────────
  if (t.graph) {
    g.globalAlpha = af('graph')
    const nav = spec.semantic.nav
    const nodeAt = new Map(nav.nodes.map((n) => [n.id, n.at]))
    const deg = new Map<string, number>()
    for (const e of nav.edges) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1) }
    const lockById = new Map(spec.semantic.locks.map((l) => [l.id, l]))
    const P = (p: { x: number; y: number }): [number, number] => [p.x * px, Y(p.y)]

    // edges: a → doorAt → b (two legs through the pinch so the choke is visible)
    for (const e of nav.edges) {
      const a = nodeAt.get(e.a), b = nodeAt.get(e.b)
      if (!a || !b) continue
      const via = e.doorAt ? [a, e.doorAt, b] : [a, b]
      const lock = e.lockId ? lockById.get(e.lockId) : undefined
      g.lineWidth = e.lockId ? 2.5 : e.kind === 'crossing' ? 2 : 1.4
      g.strokeStyle = e.lockId ? (lock?.open ? '#4ade80' : '#f87171') : (EDGE_COLOR[e.kind] ?? '#94a3b8')
      g.setLineDash(e.lockId ? [5, 4] : [])
      g.beginPath()
      g.moveTo(...P(via[0]))
      for (let i = 1; i < via.length; i++) g.lineTo(...P(via[i]))
      g.stroke()
      g.setLineDash([])
      // pinch marker + lock tag at the doorAt
      if (e.doorAt) {
        const [dx, dy] = P(e.doorAt)
        g.fillStyle = e.lockId ? (lock?.open ? '#4ade80' : '#f87171') : '#0ea5e9'
        g.beginPath(); g.arc(dx, dy, Math.max(1.6, px * 0.4), 0, Math.PI * 2); g.fill()
        if (lock && px >= 3) {
          g.font = `${Math.max(9, px * 1.7)}px monospace`
          g.fillStyle = lock.open ? '#86efac' : '#fca5a5'
          g.fillText(`${lock.tag ?? '?'} ${lock.open ? '🔓' : '🔒'}`, dx + 4, dy - 3)
        }
      }
    }
    // nodes: dot heat-colored by intensity (gray when unset), labeled d?/i?
    for (const n of nav.nodes) {
      const [nx, ny] = P(n.at)
      const rad = Math.max(2.5, 2 + (deg.get(n.id) ?? 0) * 0.7)
      g.fillStyle = n.intensity != null ? heat(n.intensity) : '#a8a29e'
      g.beginPath(); g.arc(nx, ny, rad, 0, Math.PI * 2); g.fill()
      g.lineWidth = 1
      g.strokeStyle = '#0c0a09'
      g.stroke()
      if (px >= 3) {
        g.font = `${Math.max(9, px * 1.6)}px monospace`
        g.fillStyle = '#fafaf9'
        const lbl = `d${n.depth ?? '?'}${n.intensity != null ? ` i${n.intensity.toFixed(2)}` : ''}`
        g.fillText(lbl, nx + rad + 2, ny + 3)
      }
    }
    g.globalAlpha = 1
  }

  // ── semantic POIs (top) ──────────────────────────────────────────────────
  if (t.semantic) {
    g.globalAlpha = af('semantic')
    for (const p of spec.semantic.pois) {
      g.strokeStyle = g.fillStyle = POI_COLOR[p.kind] ?? '#fff'
      g.lineWidth = 2
      g.beginPath()
      g.arc(p.at.x * px, Y(p.at.y), px * 1.2, 0, Math.PI * 2)
      g.stroke()
      g.font = `${Math.max(9, px * 2)}px monospace`
      g.fillText(p.kind, p.at.x * px + px * 1.6, Y(p.at.y) + 3)
      g.lineWidth = 1
    }
    g.globalAlpha = 1
  }
}

// ── showcase presets ─────────────────────────────────────────────────────────
// Curated {recipe, seed, size, themes, kit, gates, pois} configs, each firing a
// distinct now-shippable capability. Seeds VERIFIED by baking them (a seed scan
// over `?mapgen=1`'s own generateMap, `report.ok` + feature present) — the
// per-preset comment records what the bake showed. `overlays` are enabled on
// click so the map opens on its most illustrative layers.
interface Preset {
  label: string
  blurb: string
  recipe: string
  seed: number
  size: number
  themes: ThemeTag[]
  profs?: ProficiencyTag[]
  gates?: boolean
  pois?: GenParams['pois']
  overlays: OverlayKey[]
}
const SHOWCASE: Preset[] = [
  // 2 derived 'crossing' edges (fords) on a water field — "Mereford".
  { label: 'River + fords', blurb: 'a river bisects the map; its punched fords derive as nav crossings',
    recipe: 'field', seed: 3, size: 120, themes: ['plains', 'water'], gates: false, overlays: ['graph', 'regions'] },
  // no kit → the secondary ford seals as a mobility 'deep-water' plug — "Brayreach".
  { label: 'Gated crossing', blurb: 'a redundant ford route-locked (no kit → sealed); the other ford stays open',
    recipe: 'field', seed: 6, size: 140, themes: ['plains', 'water'], gates: true, profs: [], overlays: ['graph'] },
  // maxIntensity 0.93 across a 200² field — the flow heatmap's showcase — "Woldlea".
  { label: 'Intensity gradient', blurb: 'a big field: flow = BFS distance-to-spawn, digested to NavNode.intensity',
    recipe: 'field', seed: 8, size: 200, themes: ['plains', 'water'], gates: false, overlays: ['flow', 'graph'] },
  // 2 portals W/E → ~300 trail cells funnel through the fords — "Otterdown".
  { label: 'Desire paths', blurb: 'trails from spawn to two portals funnel through the ford pinches',
    recipe: 'field', seed: 2, size: 160, themes: ['plains', 'water'], gates: false,
    pois: [{ kind: 'portal', at: { x: 8, y: 80 }, id: 'portal-w' }, { kind: 'portal', at: { x: 152, y: 80 }, id: 'portal-e' }],
    overlays: ['paths', 'graph'] },
  // a degree-1 dead-end room, perception-sealed over its prize — "The Deepdeep"
  // (valid on the FIRST attempt, which is what the lab's onFail:accept shows).
  { label: 'Secret vault', blurb: 'a dead-end room sealed by a perception lock (no kit → prize walled off)',
    recipe: 'dungeon', seed: 18, size: 48, themes: ['dungeon'], gates: true, profs: [], overlays: ['graph', 'flow'] },
  // 11-node cycle + a mid-arc shortcut lock + a vault — "The Underbarrow".
  { label: 'Cyclic dungeon', blurb: 'a cycle-first floor with a mid-arc shortcut lock (long way when sealed)',
    recipe: 'dungeon', seed: 8, size: 56, themes: ['dungeon'], gates: true, profs: [], overlays: ['graph'] },
  // road-first town skeleton → street-fronting buildings — "prontera"-flavored.
  { label: 'Living city', blurb: 'road-first: plaza + gate roads + cross-streets, buildings fronting the pavement',
    recipe: 'city', seed: 3, size: 50, themes: ['city'], gates: false, overlays: ['graph'] },
]

function presetToggles(overlays: OverlayKey[]): Toggles {
  const base: Toggles = {
    surface: true, collision: true, scatter: false, semantic: true,
    graph: false, regions: false, flow: false, paths: false, walk: false,
  }
  for (const o of overlays) base[o] = true
  return base
}

// ── staged layer tabs ────────────────────────────────────────────────────────
// The lab is one tab per meaningful STAGE (not per pass), ordered like the bake:
// each layer tab bakes the recipe THROUGH `throughPass` (auto-skipping every
// pass strictly after it, so the spec+scratch is exactly the cumulative content
// up to that stage — stream isolation makes the omission byte-clean), then
// renders the earlier layers DIMMED (`dim`) with this stage's `owned` structure
// at full alpha on top. You watch the map accrete stage by stage; the LAST tab
// is the Final Map (every pass, all planes full brightness — the deliverable).
// `controls` are the pass-skip checkboxes surfaced on that tab — toggling one
// composes (union) with the auto-skip, so a player can drop `river` on Geography
// and every downstream tab rebakes without it. `throughPass: null` marks the
// Final tab. Each tab also carries the KNOBS for the decision it owns (themes,
// tuning dials, gates/kit — see the per-tab controls in the component).
interface Stage {
  label: string
  throughPass: string | null
  owned: OverlayKey[]     // this stage's structure — full brightness on top
  dim: OverlayKey[]       // the accreted earlier layers — drawn faint
  controls: string[]      // pass ids whose skip checkbox shows on this tab
  kit?: boolean           // surface the party-kit reminder (gate-bearing stages)
  blurb: string
}

// Stage tables are DERIVED from each recipe's real pass ids (see the recipe
// files). `assertStages` warns loudly in dev if a throughPass/control id drifts
// out of a recipe's passes, rather than silently mis-staging.
const STAGES: Record<string, Stage[]> = {
  // passes: surface → hydrology → river → outcrops → regions → flow → gates →
  //         semantic → desire-paths → scatter-fill/clumps/edges → premise
  field: [
    { label: 'Surface', throughPass: 'surface', owned: ['surface'], dim: [], controls: ['surface'], blurb: 'material bands from themes + the moisture field' },
    { label: 'Geography', throughPass: 'outcrops', owned: ['collision'], dim: ['surface'], controls: ['hydrology', 'river', 'outcrops'], blurb: 'lake/ford + river/crossings + outcrops (the barrier rects) over the dim surface' },
    { label: 'Nav Graph + Flow', throughPass: 'flow', owned: ['graph', 'regions', 'flow'], dim: ['surface', 'collision'], controls: ['regions', 'flow'], blurb: 'derived regions + nav graph + flow/intensity heat over the dim geography' },
    { label: 'Gates + Secrets', throughPass: 'gates', owned: ['graph', 'semantic'], dim: ['surface', 'collision', 'regions'], controls: ['gates'], kit: true, blurb: 'route/vault locks on derived edges (dashed) — toggle the party kit to open/close them' },
    { label: 'Dressing', throughPass: 'premise', owned: ['paths', 'scatter', 'semantic'], dim: ['surface', 'collision'], controls: ['semantic', 'desire-paths', 'scatter-fill', 'scatter-clumps', 'scatter-edges'], blurb: 'desire-path trails + scatter + POIs + the name/premise line' },
    { label: 'Final Map', throughPass: null, owned: [], dim: [], controls: [], blurb: 'every pass — the deliverable' },
  ],
  // passes: layout → flow → carve → floor → gates → shortcut → stamps →
  //         scatter → semantic → premise
  dungeon: [
    { label: 'Layout', throughPass: 'flow', owned: ['graph', 'flow'], dim: [], controls: ['layout', 'flow'], blurb: 'scattered polymorph rooms + the cycle-first skeleton (nav graph) + intensity' },
    { label: 'Carve', throughPass: 'floor', owned: ['collision', 'surface'], dim: ['graph'], controls: ['carve', 'floor'], blurb: 'maximal-rect wall cover + stone floor, over the dim room skeleton' },
    { label: 'Gates + Secrets', throughPass: 'shortcut', owned: ['graph', 'semantic'], dim: ['surface', 'collision'], controls: ['gates', 'shortcut'], kit: true, blurb: 'dead-end vault lock + mid-arc shortcut lock — toggle the party kit to open/close them' },
    { label: 'Dressing', throughPass: 'premise', owned: ['scatter', 'semantic'], dim: ['surface', 'collision'], controls: ['stamps', 'scatter', 'semantic'], blurb: 'authored stamps + depth-graded debris + lair + the name/premise line' },
    { label: 'Final Map', throughPass: null, owned: [], dim: [], controls: [], blurb: 'every pass — the deliverable' },
  ],
  // passes: roads → pave → blocks → scatter → semantic → premise
  city: [
    { label: 'Roads', throughPass: 'roads', owned: ['graph'], dim: [], controls: ['roads'], blurb: 'plaza + gate roads + cross-street loops — the nav skeleton, laid FIRST' },
    { label: 'Buildings', throughPass: 'blocks', owned: ['collision', 'surface'], dim: ['graph'], controls: ['pave', 'blocks'], blurb: 'paving + street-fronting building rects over the dim road skeleton' },
    { label: 'Dressing', throughPass: 'premise', owned: ['scatter', 'semantic'], dim: ['surface', 'collision'], controls: ['scatter', 'semantic'], blurb: 'yard/market scatter + plaza landmark + the name/premise line' },
    { label: 'Final Map', throughPass: null, owned: [], dim: [], controls: [], blurb: 'every pass — the deliverable' },
  ],
}

// Fall back to a lone Final stage for any recipe without a table.
const stagesFor = (recipeId: string): Stage[] =>
  STAGES[recipeId] ?? [{ label: 'Final Map', throughPass: null, owned: [], dim: [], controls: [], blurb: 'every pass' }]

// Dev guard: every throughPass/control must name a real pass in the recipe.
function assertStages(recipe: { id: string; passes: { id: string }[] }): void {
  const ids = new Set(recipe.passes.map((p) => p.id))
  for (const s of stagesFor(recipe.id)) {
    if (s.throughPass && !ids.has(s.throughPass)) {
      // eslint-disable-next-line no-console
      console.warn(`MapgenLab: stage "${s.label}" throughPass "${s.throughPass}" is not a pass of recipe "${recipe.id}" — tab will mis-stage`)
    }
    for (const c of s.controls) {
      if (!ids.has(c)) {
        // eslint-disable-next-line no-console
        console.warn(`MapgenLab: stage "${s.label}" control "${c}" is not a pass of recipe "${recipe.id}"`)
      }
    }
  }
}

// All-off toggles with the given keys switched on — a layer tab enables exactly
// its owned+dim overlays (owned full, dim faint), nothing else.
function togglesFor(keys: OverlayKey[]): Toggles {
  const t: Toggles = {
    surface: false, collision: false, scatter: false, semantic: false,
    graph: false, regions: false, flow: false, paths: false, walk: false,
  }
  for (const k of keys) t[k] = true
  return t
}

// ── tuning dials (sliders complementing the seed) ────────────────────────────
// One spec per MapgenTuning key: range, step, and the recipe-default shown in
// the label. A dial enters `tuning` (and therefore params.tuning) only once
// MOVED — untouched dials stay ABSENT, which matters: themed palettes carry
// their own dial-tagged band values (e.g. desert barren 0.42), so sending the
// interface default explicitly is NOT identity. ↺ resets (deletes the key).
interface DialSpec {
  key: keyof MapgenTuning
  min: number
  max: number
  step: number
  def: number      // the *_DIALS default, shown in the label
  int?: boolean
}
const DIAL_SPECS: Record<keyof MapgenTuning, DialSpec> = {
  meadowThreshold: { key: 'meadowThreshold', min: 0.4, max: 0.95, step: 0.01, def: 0.68 },
  barrenThreshold: { key: 'barrenThreshold', min: 0, max: 0.6, step: 0.01, def: 0.3 },
  outcropDensity: { key: 'outcropDensity', min: 0, max: 3, step: 0.05, def: 1 },
  riverWidthScale: { key: 'riverWidthScale', min: 0.5, max: 2, step: 0.05, def: 1 },
  riverFordCount: { key: 'riverFordCount', min: 0, max: 5, step: 1, def: 2, int: true },
  riverBridgeChance: { key: 'riverBridgeChance', min: 0, max: 1, step: 0.05, def: 0.35 },
  routeChance: { key: 'routeChance', min: 0, max: 1, step: 0.05, def: 0.6 },
  scatterDensity: { key: 'scatterDensity', min: 0, max: 2.5, step: 0.05, def: 1 },
  clumpCount: { key: 'clumpCount', min: 0, max: 12, step: 1, def: 5, int: true },
  maxScatterItems: { key: 'maxScatterItems', min: 0, max: 256, step: 4, def: 96, int: true },
}

// Which tuning dials each tab surfaces, per recipe — ONLY dials that recipe's
// passes actually read (dungeon/city scatter honors scatterDensity +
// maxScatterItems; routeChance/clumpCount are field-only), so no dead sliders.
const TAB_DIALS: Record<string, Record<string, (keyof MapgenTuning)[]>> = {
  field: {
    Surface: ['meadowThreshold', 'barrenThreshold'],
    Geography: ['outcropDensity', 'riverWidthScale', 'riverFordCount', 'riverBridgeChance'],
    'Gates + Secrets': ['routeChance'],
    Dressing: ['scatterDensity', 'clumpCount', 'maxScatterItems'],
  },
  dungeon: { Dressing: ['scatterDensity', 'maxScatterItems'] },
  city: { Dressing: ['scatterDensity', 'maxScatterItems'] },
}

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2))

// Shared slider row: range input + numeric readout + default-in-label + ↺ reset
// (shown only once touched). Used by the tuning dials AND the GenParams-level
// sliders (maxBarriers / spawnApron), which own their untouched=null state.
function SliderRow({ label, min, max, step, def, value, touched, onSet, onReset }: {
  label: string; min: number; max: number; step: number; def: number
  value: number; touched: boolean
  onSet(v: number): void; onReset(): void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className={touched ? 'text-amber-400' : 'text-stone-500'}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onSet(+e.target.value)}
        className="w-28 accent-amber-500"
        style={{ touchAction: 'none' }}
      />
      <span className={`tabular-nums ${touched ? 'text-amber-300' : 'text-stone-400'}`}>{fmtNum(value)}</span>
      <span className="text-stone-600">(d={fmtNum(def)})</span>
      {touched && (
        <button onClick={onReset} title="reset to default (dial leaves params.tuning)"
          className="px-1 rounded border border-stone-600 text-stone-400 hover:text-stone-200">↺</button>
      )}
    </label>
  )
}

// ── themed prop pool (Dressing tab) ──────────────────────────────────────────
// The actual prop ARCHETYPES generation could pick for the current themes:
// biome bucket derived the way the battle seeder does (theme words are the
// trait words — volcanic sits on stone via 'mountain', city reads plaza), then
// TERRAIN_PROPS[biome] filtered by matchesThemes — the same helper the render's
// scatter pick uses. Archetypes only (seeded ~variants hidden); grouped by
// mapgen ScatterKind; capped with a "+N more" count. SkinGallery's SVG-cell
// pattern; propMarkup is the one PropDef→svg translation.
const POOL_KIND_ORDER = ['tree', 'bush', 'rock', 'stump', 'flower', 'reed'] as const
const POOL_CAP = 24

function PropPool({ themes }: { themes: ThemeTag[] }) {
  const { biome, groups, total } = useMemo(() => {
    const traits: string[] = themes.includes('volcanic') ? [...themes, 'mountain'] : [...themes]
    const b = biomeForLocation({ traits })
    const pool = TERRAIN_PROPS[b].filter((d) => !d.id.includes('~') && d.kinds?.length && matchesThemes(d, themes))
    const byKind = new Map<string, PropDef[]>()
    for (const d of pool) {
      const k = d.kinds![0]
      if (!byKind.has(k)) byKind.set(k, [])
      byKind.get(k)!.push(d)
    }
    const g = POOL_KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({ kind: k, defs: byKind.get(k)! }))
    return { biome: b, groups: g, total: pool.length }
  }, [themes])

  let budget = POOL_CAP
  return (
    <div className="mb-1">
      <div className="text-[11px] text-stone-500 mb-1">
        themed prop pool — archetypes scatter can pick for these themes (biome bucket: <b className="text-stone-400">{biome}</b>; each multiplies into seeded ~variants)
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        {groups.map(({ kind, defs }) => {
          if (budget <= 0) return null
          const shown = defs.slice(0, budget)
          budget -= shown.length
          return (
            <div key={kind}>
              <div className="text-[9px] text-stone-500 mb-0.5">{kind} · {defs.length}</div>
              <div className="flex flex-wrap gap-1">
                {shown.map((def) => (
                  <div key={def.id} title={def.id}
                    className="w-9 h-9 rounded border border-stone-700 bg-stone-800 flex items-center justify-center">
                    <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-8 h-8" aria-hidden
                      dangerouslySetInnerHTML={{ __html: propMarkup(def) }} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {total > POOL_CAP && <span className="text-[10px] text-stone-500 pb-1">+{total - POOL_CAP} more</span>}
        {total === 0 && <span className="text-[10px] text-stone-500">no themed archetypes — scatter falls back cross-theme (see coverage box)</span>}
      </div>
    </div>
  )
}

// ── ▶ Play this map (Final tab) ──────────────────────────────────────────────
// Full-screen battle overlay on the CURRENT lab bake: seedMapgenLabBattle
// stands the store scene up (save-safe — App runs ?mapgen under noPersist),
// this overlay owns the paused tick loop (App's is disabled), and close tears
// the synthetic battle down so re-opening re-seeds fresh. Exact precedent:
// MonsterLab's BattleSim (~:730) — same interval cadence and structure.
function PlayBattleOverlay({ opts, skipsActive, apronOverridden, onClose }: {
  opts: MapgenLabBattleOpts
  skipsActive: boolean
  apronOverridden: boolean
  onClose(): void
}) {
  const paused = useGameStore((s) => s.paused)
  const live = useGameStore((s) => {
    const b = s.battles[MAPGEN_LAB_SIM_LOC]
    if (!b) return { heroes: 0, foes: 0, round: 0 }
    return {
      heroes: b.combatants.filter((c) => c.team === 'player' && c.alive).length,
      foes: b.combatants.filter((c) => c.team === 'enemy' && c.alive).length,
      round: b.round,
    }
  })

  // Seed once on mount, then own the tick loop (gated on !paused). Starts
  // RUNNING — the button said "play".
  useEffect(() => {
    seedMapgenLabBattle(opts)
    useGameStore.setState({ paused: false })
    const id = setInterval(() => {
      const s = useGameStore.getState()
      if (!s.paused) s.tick()
    }, 1000 / TICKS_PER_SECOND)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    useGameStore.getState().exitBattleView()
    // Drop the synthetic battle + location so the next ▶ re-seeds fresh.
    useGameStore.setState((s) => {
      const battles = { ...s.battles }
      delete battles[MAPGEN_LAB_SIM_LOC]
      return { battles, paused: true, locations: s.locations.filter((l) => l.id !== MAPGEN_LAB_SIM_LOC) }
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-stone-950 text-stone-200">
      <div className="flex-1 min-h-0 flex flex-col">
        <BattleView locationId={MAPGEN_LAB_SIM_LOC} />
      </div>
      <div className="absolute top-2 right-2 z-[160] w-64 max-w-[85vw] rounded-xl border border-stone-600 bg-stone-900/95 backdrop-blur shadow-2xl p-3 space-y-2 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold">▶ mapgen battle</span>
          <button onClick={close} title="Back to the lab"
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-stone-600 text-stone-400 hover:text-stone-100">✕</button>
        </div>
        <button
          onClick={() => useGameStore.getState().togglePause()}
          className={['w-full h-8 rounded-lg border text-sm font-medium', paused ? 'border-green-600/60 bg-green-600/15 text-green-400' : 'border-amber-500/60 bg-amber-500/15 text-amber-400'].join(' ')}
        >{paused ? '▶ Resume' : '⏸ Pause'}</button>
        <div className="text-[11px] text-stone-400 tabular-nums">
          <span className="text-blue-300">{live.heroes} heroes</span> · <span className="text-red-300">{live.foes} foes</span> · round {live.round}
        </div>
        <div className="text-[10px] text-stone-500">
          gate locks resolve against the DEPLOYED party's real proficiencies at stand-up — not the lab's kit toggles.
        </div>
        {skipsActive && (
          <div className="text-[10px] text-amber-400/80">
            manual pass-skips don't carry — the battle plays the FULL bake.
          </div>
        )}
        {apronOverridden && (
          <div className="text-[10px] text-amber-400/80">
            spawn-apron override doesn't carry into the battle seam (default apron).
          </div>
        )}
      </div>
    </div>
  )
}

function Thumb({ result, px, onClick, active }: { result: GenResult; px: number; onClick(): void; active: boolean }) {
  return (
    <button onClick={onClick} className="relative block" style={{ outline: active ? '3px solid #f59e0b' : '1px solid #44403c' }}>
      <canvas ref={(c) => drawSpec(c, result, px, THUMB_TOGGLES)} style={{ display: 'block', width: result.spec.cols * px, height: result.spec.rows * px }} />
      <span className="absolute top-0 left-0 px-1 text-[10px] font-mono" style={{ background: '#000a', color: result.report.ok ? '#4ade80' : '#f87171' }}>
        {result.spec.seed}{result.attempts > 1 ? ` (r${result.attempts})` : ''} {result.report.ok ? '✓' : '✗'}
      </span>
    </button>
  )
}

export default function MapgenLab() {
  const [recipeId, setRecipeId] = useState('field')
  const [size, setSize] = useState(120)
  const [themes, setThemes] = useState<ThemeTag[]>(['plains', 'water'])
  const [baseSeed, setBaseSeed] = useState(1)
  const [focus, setFocus] = useState(1)
  // MANUAL pass skips — the modular-influence lever. These compose (union) with
  // each layer tab's AUTO-skip (every pass after that stage), so unchecking
  // `river` on Geography drops it from that tab AND every downstream tab.
  const [manualSkips, setManualSkips] = useState<string[]>([])
  // §F composition gates: the simulated deploying party's kit. Toggle a tag and
  // watch the SAME seed re-bake with its gate open — the review loop for lock
  // tuning (contact sheet + focused map both re-resolve).
  const [profs, setProfs] = useState<ProficiencyTag[]>([])
  // gates master switch + externally-owned portals (driven by showcase presets).
  const [gates, setGates] = useState(true)
  const [pois, setPois] = useState<GenParams['pois']>([])
  // Tuning dials: ONLY moved dials live here (touched = key present), so
  // params.tuning stays identity until a slider actually moves. ↺ deletes.
  const [tuning, setTuning] = useState<Partial<MapgenTuning>>({})
  // GenParams-level sliders: null = untouched → the recipe/lib default applies
  // (field 24 / dungeon 72 / city 40 barriers; apron max(6, size*0.14)).
  const [maxBarriers, setMaxBarriers] = useState<number | null>(null)
  const [spawnApron, setSpawnApron] = useState<number | null>(null)
  // ▶ Play this map: the seeder config snapshotted at click; non-null = overlay up.
  const [playCfg, setPlayCfg] = useState<MapgenLabBattleOpts | null>(null)
  // The active layer tab (index into this recipe's stage table); 0 = the FIRST
  // layer stage (Surface/Layout/Roads); the LAST index is the Final Map.
  const [tab, setTab] = useState(0)
  // Final-tab plane toggles (editable there only — layer tabs derive their
  // overlays from the stage). Presets seed this to open on illustrative layers.
  const [finalToggles, setFinalToggles] = useState<Toggles>({
    surface: true, collision: true, scatter: true, semantic: true,
    graph: true, regions: false, flow: false, paths: false, walk: false,
  })

  const recipe = RECIPE_REGISTRY[recipeId]
  const stages = stagesFor(recipeId)
  const stage = stages[Math.min(tab, stages.length - 1)]
  const isFinal = stage.throughPass === null

  // Slider drags re-bake live but DEFERRED: readouts track the pointer, the
  // bakes (9-thumb sheet + focused map) lag a frame behind under load.
  const dTuning = useDeferredValue(tuning)
  const dMaxBarriers = useDeferredValue(maxBarriers)
  const dSpawnApron = useDeferredValue(spawnApron)
  const tuningKey = JSON.stringify(dTuning)
  const params = {
    recipe: recipeId, size, themes, proficiencies: profs, gates, pois,
    tuning: dTuning,
    ...(dMaxBarriers != null ? { maxBarriers: dMaxBarriers } : {}),
    ...(dSpawnApron != null ? { spawnApron: dSpawnApron } : {}),
    onFail: 'accept' as const,
  }

  // Effective values behind the null=untouched sliders (also what ▶ Play pins,
  // so preview == battle — the adapter would otherwise pin live maps to 72).
  const defMaxBarriers = recipe.defaults?.maxBarriers ?? 24
  const defSpawnApron = recipe.defaults?.spawnApron ?? Math.max(6, size * 0.14)
  const effMaxBarriers = maxBarriers ?? defMaxBarriers

  const setDial = (k: keyof MapgenTuning, v: number) => setTuning((t) => ({ ...t, [k]: v }))
  const resetDial = (k: keyof MapgenTuning) => setTuning((t) => {
    const rest = { ...t }
    delete rest[k]
    return rest
  })

  // Dev guard: warn once per recipe if a stage names a pass the recipe lacks.
  // useEffect (not useMemo) so the console.warn side effect fires exactly once
  // per recipe change, never during a discarded render.
  useEffect(() => { assertStages(recipe) }, [recipe])

  // Bake THROUGH this stage: auto-skip every pass strictly after `throughPass`,
  // unioned with the user's manual skips. The passes at/before the stage are the
  // ids whose notes are worth showing (later ones only produced `skip:` lines).
  const passIds = recipe.passes.map((p) => p.id)
  const throughIdx = isFinal ? passIds.length - 1 : passIds.indexOf(stage.throughPass!)
  const autoSkip = throughIdx < 0 || isFinal ? [] : passIds.slice(throughIdx + 1)
  const allowedIds = new Set(throughIdx < 0 ? passIds : passIds.slice(0, throughIdx + 1))
  const effectiveSkips = Array.from(new Set([...autoSkip, ...manualSkips]))
  const skipsKey = effectiveSkips.slice().sort().join(',')

  const sheet = useMemo(
    () => Array.from({ length: 9 }, (_, i) => generateMap(recipe, { ...params, seed: baseSeed + i })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeId, size, themes, baseSeed, profs, gates, pois, tuningKey, dMaxBarriers, dSpawnApron],
  )
  const focused = useMemo(() => {
    const t0 = performance.now()
    // debug: true attaches the accepted attempt's scratch (walk/regions/flow/
    // desire-paths masks) so the derived overlays can read them. Determinism-
    // neutral: the flag touches no pass — same seed bakes an identical spec.
    const r = generateMap(recipe, { ...params, seed: focus, skipPasses: effectiveSkips, debug: true })
    return { r, ms: performance.now() - t0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, size, themes, focus, skipsKey, profs, gates, pois, tuningKey, dMaxBarriers, dSpawnApron])

  const applyPreset = (p: Preset) => {
    setRecipeId(p.recipe)
    setSize(p.size)
    setThemes(p.themes)
    setBaseSeed(p.seed)
    setFocus(p.seed)
    setProfs(p.profs ?? [])
    setGates(p.gates ?? true)
    setPois(p.pois ?? [])
    setManualSkips([])
    setTuning({})          // presets are curated on recipe defaults — dials reset
    setMaxBarriers(null)
    setSpawnApron(null)
    setFinalToggles(presetToggles(p.overlays))
    // Presets jump to the Final Map (the LAST tab), opened on their overlays.
    setTab(stagesFor(p.recipe).length - 1)
  }

  const switchRecipe = (id: string) => {
    setRecipeId(id)
    const d = RECIPE_REGISTRY[id].defaults
    if (d?.size) setSize(d.size)
    // Themes are per-recipe decisions (dungeon wants ['dungeon'], city ['city']).
    setThemes(d?.themes ?? ['plains', 'water'])
    setPois([])
    setManualSkips([])
    setTuning({})
    setMaxBarriers(null)
    setSpawnApron(null)
    setTab(0)   // land on the recipe's FIRST layer stage
  }

  // Render toggles + dim set for the focused canvas: Final = user's plane
  // toggles, no dimming; a layer tab = owned+dim overlays on, dim faint.
  const drawToggles = isFinal ? finalToggles : togglesFor([...stage.owned, ...stage.dim])
  const dimSet = isFinal ? undefined : new Set(stage.dim)

  const thumbPx = Math.max(1, Math.floor(150 / size))
  const bigPx = Math.max(2, Math.floor(560 / size))
  const tac = focused.r.spec.semantic.tactical

  // Asset-COVERAGE warning (non-blocking, informational): does the focused map's
  // theme set have the scatter capabilities the recipe leans on? The field
  // recipe places `edge` scatter items, so a theme with no edge-role prop renders
  // its shoreline/skirt as fallback filler; a theme with no themed prop at all
  // draws entirely cross-theme props. Reads render/coverage.ts — generation is
  // unchanged (it always falls back gracefully); this only tells a human.
  const mapThemes = ((focused.r.spec.semantic.regionTags?.length
    ? focused.r.spec.semantic.regionTags
    : themes) as ThemeTag[])
  const noEdge = themesMissingEdge(mapThemes)
  const noThemed = themesWithoutThemedProps(mapThemes)

  // On a layer tab, drop the pass notes for later, auto-skipped passes (their
  // only line is `skip:<id>`); keep notes at/before the stage + any manual skip.
  // Non-pass-prefixed lines (reroll notes like "attempt 2 failed: … — rerolling")
  // aren't owned by a pass — keep them so the notes panel never hides a reroll.
  const allPassIds = new Set(passIds)
  const visibleNotes = isFinal ? focused.r.notes : focused.r.notes.filter((n) => {
    const skipId = n.startsWith('skip:') ? n.slice(5) : null
    const passId = skipId ?? n.split(':')[0]
    // A note is pass-owned only if its prefix is a real pass id (or a skip:
    // line). Global lines — reroll notes like "attempt 2 failed: …" — aren't,
    // so keep them on every tab; a hidden reroll would mislead the reviewer.
    const isPassNote = skipId !== null || allPassIds.has(passId)
    return !isPassNote || allowedIds.has(passId) || manualSkips.includes(passId)
  })

  return (
    <div className="min-h-full bg-stone-900 text-stone-200 p-4 font-mono text-sm overflow-auto">
      <h1 className="text-lg mb-1">mapgen lab</h1>
      <p className="text-stone-400 text-xs mb-2">staged layer tabs in bake order — each tab bakes THROUGH its stage (earlier layers dim, this stage bright) and carries the knobs for the decision it owns; the LAST tab is the final map + seed contact sheet + ▶ play · per-tab pass-skip checkboxes influence every downstream tab · report + pass notes at right</p>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <span className="text-stone-500">showcase:</span>
        {SHOWCASE.map((p) => (
          <button key={p.label} onClick={() => applyPreset(p)} title={p.blurb}
            className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/30">
            {p.label}
          </button>
        ))}
      </div>

      {/* ── slim persistent TOP BAR: the cross-cutting basics only ── */}
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <label>recipe <select className="bg-stone-800 px-1" value={recipeId} onChange={(e) => switchRecipe(e.target.value)}>
          {Object.keys(RECIPE_REGISTRY).map((id) => <option key={id}>{id}</option>)}
        </select></label>
        <label>size <input className="bg-stone-800 w-16 px-1" type="number" value={size} onChange={(e) => setSize(Math.max(12, +e.target.value || 12))} /></label>
        <label>seeds <input className="bg-stone-800 w-16 px-1" type="number" value={baseSeed} onChange={(e) => { setBaseSeed(+e.target.value || 0); setFocus(+e.target.value || 0) }} /></label>
        {pois && pois.length > 0 && <span className="text-purple-400">| {pois.length} portal(s)</span>}
      </div>

      {/* ── layer tab bar ── */}
      <div className="flex flex-wrap gap-1 mb-2 border-b border-stone-700">
        {stages.map((s, i) => (
          <button key={s.label} onClick={() => setTab(i)}
            className="px-3 py-1 text-xs rounded-t"
            style={{
              background: i === tab ? '#292524' : 'transparent',
              color: i === tab ? '#f59e0b' : '#a8a29e',
              borderBottom: i === tab ? '2px solid #f59e0b' : '2px solid transparent',
            }}>
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        {/* Contact sheet lives on the Final tab (seed-hunting); layer tabs hide it. */}
        {isFinal && (
          <div className="grid grid-cols-3 gap-1">
            {sheet.map((r) => (
              <Thumb key={r.spec.seed} result={r} px={thumbPx} active={r.spec.seed === focus} onClick={() => setFocus(r.spec.seed)} />
            ))}
          </div>
        )}

        <div>
          {/* per-tab CONTROLS */}
          <div className="text-xs text-stone-400 mb-1">{stage.blurb}</div>

          {/* ── per-tab KNOBS: the decisions this stage owns ── */}
          {tab === 0 && (
            // The biome decision lives on the FIRST stage (Surface/Layout/Roads).
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5 text-xs items-center">
              <span className="text-stone-500">themes:</span>
              {THEME_TAGS.map((tag) => (
                <label key={tag} className={themes.includes(tag) ? 'text-amber-400' : 'text-stone-500'}>
                  <input type="checkbox" checked={themes.includes(tag)} onChange={(e) =>
                    setThemes(e.target.checked ? [...themes, tag] : themes.filter((t) => t !== tag))} /> {tag}
                </label>
              ))}
            </div>
          )}
          {stage.kit && (
            // Gates + Secrets owns the composition-gate levers: master switch +
            // the simulated party kit + the lock readout (same-seed re-resolve).
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5 text-xs items-center">
              <label className={gates ? 'text-cyan-400' : 'text-stone-500'}>
                <input type="checkbox" checked={gates} onChange={(e) => setGates(e.target.checked)} /> gates
              </label>
              <span className="text-stone-500">| party kit:</span>
              {PROFICIENCY_TAGS.map((tag) => (
                <label key={tag} className={profs.includes(tag) ? 'text-cyan-400' : 'text-stone-500'}>
                  <input type="checkbox" checked={profs.includes(tag)} onChange={(e) =>
                    setProfs(e.target.checked ? [...profs, tag] : profs.filter((t) => t !== tag))} /> {tag}
                </label>
              ))}
              {focused.r.spec.semantic.locks.length > 0 && (
                <span className="text-stone-400">| locks: {focused.r.spec.semantic.locks.map((l) => `${l.tag} ${l.open ? '🔓' : '🔒'}`).join(' · ')}</span>
              )}
            </div>
          )}
          {(TAB_DIALS[recipeId]?.[stage.label] ?? []).length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-1.5 items-center">
              {(TAB_DIALS[recipeId]?.[stage.label] ?? []).map((k) => {
                const s = DIAL_SPECS[k]
                return (
                  <SliderRow key={k} label={k} min={s.min} max={s.max} step={s.step} def={s.def}
                    value={tuning[k] ?? s.def} touched={tuning[k] !== undefined}
                    onSet={(v) => setDial(k, s.int ? Math.round(v) : v)} onReset={() => resetDial(k)} />
                )
              })}
            </div>
          )}
          {recipeId === 'field' && stage.label === 'Surface' && (
            <div className="text-[10px] text-stone-500 mb-1.5">
              untouched dials use each palette band's own baked threshold (themed bands pin their own values — e.g. desert barren 0.42), so d= is the plains default, not always the live value.
            </div>
          )}
          {((recipeId === 'field' && stage.label === 'Geography') ||
            (recipeId === 'dungeon' && stage.label === 'Carve') ||
            (recipeId === 'city' && stage.label === 'Buildings')) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-1.5 items-center">
              <SliderRow label="maxBarriers" min={8} max={96} step={1} def={defMaxBarriers}
                value={effMaxBarriers} touched={maxBarriers !== null}
                onSet={(v) => setMaxBarriers(Math.round(v))} onReset={() => setMaxBarriers(null)} />
              {recipeId === 'field' && stage.label === 'Geography' && (
                <SliderRow label="spawnApron" min={2} max={40} step={0.5} def={Math.round(defSpawnApron * 2) / 2}
                  value={spawnApron ?? Math.round(defSpawnApron * 2) / 2} touched={spawnApron !== null}
                  onSet={(v) => setSpawnApron(v)} onReset={() => setSpawnApron(null)} />
              )}
            </div>
          )}
          {stage.label === 'Nav Graph + Flow' && (
            <div className="text-[10px] text-stone-500 mb-1.5">derived layer — no knobs: regions/nav/flow are computed from the geography above (shape it there).</div>
          )}
          {stage.label === 'Dressing' && <PropPool themes={mapThemes} />}
          {isFinal && (
            <div className="flex flex-wrap gap-3 mb-1.5 items-center">
              <button
                onClick={() => setPlayCfg({
                  recipe: recipeId, seed: focus, size, themes, gates,
                  // Always pin the lab's effective budget so preview == battle
                  // (the adapter would pin live maps to 72 otherwise).
                  maxBarriers: effMaxBarriers,
                  tuning,   // touched dials only, by construction
                })}
                className="px-4 py-1.5 rounded-lg border border-green-600/70 bg-green-600/15 text-green-400 text-sm font-medium hover:bg-green-600/25">
                ▶ Play this map
              </button>
              {manualSkips.length > 0 && (
                <span className="text-[10px] text-amber-400/80">manual skips ({manualSkips.join(', ')}) don't carry — the battle plays the full bake</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mb-1 text-xs items-center">
            {isFinal ? (
              // Final tab keeps the editable plane toggles.
              <>
                <span className="text-stone-500">planes:</span>
                {(Object.keys(finalToggles) as (keyof Toggles)[]).map((k) => (
                  <label key={k} className={finalToggles[k] ? 'text-amber-400' : 'text-stone-500'}>
                    <input type="checkbox" checked={finalToggles[k]} onChange={(e) => setFinalToggles({ ...finalToggles, [k]: e.target.checked })} /> {k}
                  </label>
                ))}
              </>
            ) : (
              // Layer tab: skip checkboxes for THIS stage's passes (compose with auto-skip).
              <>
                <span className="text-stone-500">skip:</span>
                {stage.controls.map((id) => (
                  <label key={id} className={manualSkips.includes(id) ? 'text-red-400' : 'text-stone-500'}>
                    <input type="checkbox" checked={manualSkips.includes(id)} onChange={(e) =>
                      setManualSkips(e.target.checked ? [...manualSkips, id] : manualSkips.filter((s) => s !== id))} /> {id}
                  </label>
                ))}
                {autoSkip.length > 0 && <span className="text-stone-600">| later (auto-skipped): {autoSkip.join(' ')}</span>}
              </>
            )}
          </div>
          {!isFinal && (
            <div className="text-[11px] text-stone-500 mb-1">
              <span className="text-amber-400/90">bright</span> = this stage ({stage.owned.join(', ') || '—'}) ·
              {' '}<span className="text-stone-400">dim</span> = accreted ({stage.dim.join(', ') || '—'})
              {stage.kit && ' · toggle the party kit above to open/close the locks'}
              {recipeId === 'field' && stage.owned.includes('semantic') && ' · field places the spawn/landmark POIs in the semantic pass, so they first appear here'}
            </div>
          )}
          <canvas ref={(c) => drawSpec(c, focused.r, bigPx, drawToggles, dimSet)} style={{ display: 'block', width: focused.r.spec.cols * bigPx, height: focused.r.spec.rows * bigPx }} />
          <div className="text-xs text-stone-400 mt-1">
            seed {focused.r.spec.seed} · attempt {focused.r.attempts} · {focused.ms.toFixed(0)}ms ·
            openness {tac.openness} · barriers {tac.barrierCount} · chokepoints {tac.chokepoints} · lanes {tac.longLanes} · cover {tac.coverClusters}
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            nav: {focused.r.spec.semantic.nav.nodes.length} node(s), {focused.r.spec.semantic.nav.edges.length} edge(s)
            {focused.r.spec.semantic.nav.edges.some((e) => e.kind === 'crossing') && ` (${focused.r.spec.semantic.nav.edges.filter((e) => e.kind === 'crossing').length} crossing)`}
            {' '}· graph dots = intensity heat (blue→red); dashed = locked edge
          </div>
          {focused.r.spec.semantic.name && (
            <div className="text-xs text-amber-200/80 italic mt-0.5">
              {focused.r.spec.semantic.name} — {focused.r.spec.semantic.premise}
            </div>
          )}
        </div>

        <div className="max-w-md">
          {(noEdge.length > 0 || noThemed.length > 0) && (
            <div className="mb-3 text-xs border border-amber-500/40 bg-amber-500/5 rounded p-2 space-y-1">
              <div className="text-amber-400">⚠️ asset coverage (informational — generation stays graceful)</div>
              {noThemed.length > 0 && (
                <div className="text-amber-300/90">
                  theme(s) <b>{noThemed.join(', ')}</b> have no themed props — all scatter renders cross-theme fallback props.
                </div>
              )}
              {noEdge.length > 0 && (
                <div className="text-amber-300/90">
                  theme(s) <b>{noEdge.join(', ')}</b> have no edge/ribbon assets — shoreline/skirt edges render as fallback filler.
                </div>
              )}
              <div className="text-stone-500">source: render/coverage.ts · full table in ?workshop=1</div>
            </div>
          )}
          <h2 className="text-amber-400 mb-1">validation</h2>
          <ul className="text-xs mb-3">
            {focused.r.report.rules.map((r) => (
              <li key={r.rule} className={r.ok ? 'text-green-400' : 'text-red-400'}>
                {r.ok ? '✓' : '✗'} {r.rule} — <span className="text-stone-400">{r.detail}</span>
              </li>
            ))}
          </ul>
          <h2 className="text-amber-400 mb-1">pass notes{isFinal ? '' : ' (through this stage)'}</h2>
          <ul className="text-xs text-stone-400">
            {visibleNotes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </div>

      {playCfg && (
        <PlayBattleOverlay
          opts={playCfg}
          skipsActive={manualSkips.length > 0}
          apronOverridden={spawnApron !== null}
          onClose={() => setPlayCfg(null)}
        />
      )}
    </div>
  )
}
