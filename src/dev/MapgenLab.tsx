// Dev-only mapgen lab (`?mapgen=1`): the human-validation surface for the
// procedural map generator (src/mapgen). Optimized for THROUGHPUT of eyeballs:
// a 3×3 seed contact sheet (nine maps per glance, like ?gallery=1 reviews the
// whole visual language in one screenshot), a focused view with per-plane
// toggles and per-pass skips (the layer inspector — stream-isolated RNG means
// toggling a pass changes ONLY that layer), and the validation report + pass
// notes beside the picture so a human never has to guess why a map is wrong.
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

import { useMemo, useState } from 'react'
import {
  generateMap, RECIPE_REGISTRY, SURFACE_MATERIALS, THEME_TAGS, PROFICIENCY_TAGS,
  type GenParams, type GenResult, type ProficiencyTag, type ThemeTag,
} from '@/mapgen'
import { themesMissingEdge, themesWithoutThemedProps } from '@/render/coverage'

const SURFACE_COLOR: Record<string, string> = {
  'grass': '#7aa85c', 'meadow': '#8fbf6a', 'dirt': '#a58a5e', 'sand': '#d9c489',
  'shallow-water': '#7ec8d8', 'deep-water': '#3a7fa8', 'stone-floor': '#9a9a94', 'road': '#c9b68e',
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

function drawSpec(canvas: HTMLCanvasElement | null, result: GenResult, px: number, t: Toggles) {
  if (!canvas) return
  const spec = result.spec
  const scratch = result.scratch
  const { cols, rows } = spec
  canvas.width = cols * px
  canvas.height = rows * px
  const g = canvas.getContext('2d')!
  const Y = (y: number) => (rows - y) * px   // world y-up → canvas y-down
  const fillCell = (x: number, y: number, style: string) => {
    g.fillStyle = style
    g.fillRect(x * px, Y(y + 1), px + 0.5, px + 0.5)
  }

  g.fillStyle = '#1c1917'
  g.fillRect(0, 0, canvas.width, canvas.height)

  // ── fills (bottom of the stack) ──────────────────────────────────────────
  if (t.surface) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        fillCell(x, y, SURFACE_COLOR[SURFACE_MATERIALS[spec.surface.grid[y * cols + x]]] ?? '#f0f')
      }
    }
  }
  // walk mask: translucent wash over reachable ground (the validator's occupancy
  // model). Reading an absent key (regions skipped / recipe didn't produce it)
  // just draws nothing.
  const walk = asU8(scratch?.get('walk'))
  if (t.walk && walk) {
    g.globalAlpha = 0.22
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walk[y * cols + x]) fillCell(x, y, '#4ade80')
    g.globalAlpha = 1
  }
  // region claims: stable per-region tint; -1 = unclaimed/blocked = transparent.
  const claims = asI32(scratch?.get('regions'))
  if (t.regions && claims) {
    g.globalAlpha = 0.5
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
    g.globalAlpha = 0.55
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = flow[y * cols + x]
        if (d >= 0) fillCell(x, y, heat(fmax > 0 ? d / fmax : 0))
      }
    }
    g.globalAlpha = 1
  }

  if (t.scatter) {
    for (const s of spec.scatter) {
      g.fillStyle = SCATTER_COLOR[s.kind] ?? '#f0f'
      g.beginPath()
      g.arc(s.x * px, Y(s.y), Math.max(1.2, s.size * px * 0.35), 0, Math.PI * 2)
      g.fill()
    }
  }
  if (t.collision) {
    for (const r of spec.collision) {
      g.fillStyle = BARRIER_COLOR[r.material] ?? '#f0f'
      g.globalAlpha = r.kind === 'cliff' ? 0.6 : 1
      g.fillRect(r.x * px, Y(r.y + r.h), r.w * px, r.h * px)
      g.globalAlpha = 1
      g.strokeStyle = r.kind === 'cliff' ? '#e7e5e4' : '#292524'
      g.setLineDash(r.kind === 'cliff' ? [3, 3] : [])
      g.strokeRect(r.x * px, Y(r.y + r.h), r.w * px, r.h * px)
      g.setLineDash([])
    }
  }
  // desire-path mask: the trodden trail cells, over fills but under the graph.
  const paths = asU8(scratch?.get('desire-paths'))
  if (t.paths && paths) {
    g.globalAlpha = 0.85
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (paths[y * cols + x]) fillCell(x, y, '#e08a2c')
    g.globalAlpha = 1
  }

  // ── nav graph (on the baked spec — no scratch needed) ────────────────────
  if (t.graph) {
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
  }

  // ── semantic POIs (top) ──────────────────────────────────────────────────
  if (t.semantic) {
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
  const [skips, setSkips] = useState<string[]>([])
  // §F composition gates: the simulated deploying party's kit. Toggle a tag and
  // watch the SAME seed re-bake with its gate open — the review loop for lock
  // tuning (contact sheet + focused map both re-resolve).
  const [profs, setProfs] = useState<ProficiencyTag[]>([])
  // gates master switch + externally-owned portals (driven by showcase presets).
  const [gates, setGates] = useState(true)
  const [pois, setPois] = useState<GenParams['pois']>([])
  const [toggles, setToggles] = useState<Toggles>({
    surface: true, collision: true, scatter: true, semantic: true,
    graph: true, regions: false, flow: false, paths: false, walk: false,
  })

  const recipe = RECIPE_REGISTRY[recipeId]
  const params = { recipe: recipeId, size, themes, proficiencies: profs, gates, pois, onFail: 'accept' as const }

  const sheet = useMemo(
    () => Array.from({ length: 9 }, (_, i) => generateMap(recipe, { ...params, seed: baseSeed + i })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeId, size, themes, baseSeed, profs, gates, pois],
  )
  const focused = useMemo(() => {
    const t0 = performance.now()
    // debug: true attaches the accepted attempt's scratch (walk/regions/flow/
    // desire-paths masks) so the derived overlays can read them. Determinism-
    // neutral: the flag touches no pass — same seed bakes an identical spec.
    const r = generateMap(recipe, { ...params, seed: focus, skipPasses: skips, debug: true })
    return { r, ms: performance.now() - t0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, size, themes, focus, skips, profs, gates, pois])

  const applyPreset = (p: Preset) => {
    setRecipeId(p.recipe)
    setSize(p.size)
    setThemes(p.themes)
    setBaseSeed(p.seed)
    setFocus(p.seed)
    setProfs(p.profs ?? [])
    setGates(p.gates ?? true)
    setPois(p.pois ?? [])
    setSkips([])
    setToggles(presetToggles(p.overlays))
  }

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

  return (
    <div className="min-h-full bg-stone-900 text-stone-200 p-4 font-mono text-sm overflow-auto">
      <h1 className="text-lg mb-1">mapgen lab</h1>
      <p className="text-stone-400 text-xs mb-2">contact sheet → click a seed to focus · toggle planes / skip passes on the focused map · derived overlays (graph/regions/flow/paths/walk) ride the dev debug scratch · report + pass notes below</p>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <span className="text-stone-500">showcase:</span>
        {SHOWCASE.map((p) => (
          <button key={p.label} onClick={() => applyPreset(p)} title={p.blurb}
            className="px-2 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/30">
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-3">
        <label>recipe <select className="bg-stone-800 px-1" value={recipeId} onChange={(e) => { const id = e.target.value; setRecipeId(id); const ds = RECIPE_REGISTRY[id].defaults?.size; if (ds) setSize(ds); setPois([]) }}>
          {Object.keys(RECIPE_REGISTRY).map((id) => <option key={id}>{id}</option>)}
        </select></label>
        <label>size <input className="bg-stone-800 w-16 px-1" type="number" value={size} onChange={(e) => setSize(Math.max(12, +e.target.value || 12))} /></label>
        <label>seeds <input className="bg-stone-800 w-16 px-1" type="number" value={baseSeed} onChange={(e) => { setBaseSeed(+e.target.value || 0); setFocus(+e.target.value || 0) }} /></label>
        <label className={gates ? 'text-cyan-400' : 'text-stone-500'}>
          <input type="checkbox" checked={gates} onChange={(e) => setGates(e.target.checked)} /> gates
        </label>
        {pois && pois.length > 0 && <span className="text-purple-400">| {pois.length} portal(s)</span>}
        <span>themes:</span>
        {THEME_TAGS.map((tag) => (
          <label key={tag} className={themes.includes(tag) ? 'text-amber-400' : 'text-stone-500'}>
            <input type="checkbox" checked={themes.includes(tag)} onChange={(e) =>
              setThemes(e.target.checked ? [...themes, tag] : themes.filter((t) => t !== tag))} /> {tag}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 items-center mb-3 text-xs">
        <span className="text-stone-400">party kit (composition gates — toggle to re-resolve locks):</span>
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

      <div className="flex flex-wrap gap-6 items-start">
        <div className="grid grid-cols-3 gap-1">
          {sheet.map((r) => (
            <Thumb key={r.spec.seed} result={r} px={thumbPx} active={r.spec.seed === focus} onClick={() => setFocus(r.spec.seed)} />
          ))}
        </div>

        <div>
          <div className="flex flex-wrap gap-3 mb-1 text-xs">
            {(Object.keys(toggles) as (keyof Toggles)[]).map((k) => (
              <label key={k} className={toggles[k] ? 'text-amber-400' : 'text-stone-500'}>
                <input type="checkbox" checked={toggles[k]} onChange={(e) => setToggles({ ...toggles, [k]: e.target.checked })} /> {k}
              </label>
            ))}
            <span className="text-stone-500">| skip:</span>
            {recipe.passes.map((p) => (
              <label key={p.id} className={skips.includes(p.id) ? 'text-red-400' : 'text-stone-500'}>
                <input type="checkbox" checked={skips.includes(p.id)} onChange={(e) =>
                  setSkips(e.target.checked ? [...skips, p.id] : skips.filter((s) => s !== p.id))} /> {p.id}
              </label>
            ))}
          </div>
          <canvas ref={(c) => drawSpec(c, focused.r, bigPx, toggles)} style={{ display: 'block', width: focused.r.spec.cols * bigPx, height: focused.r.spec.rows * bigPx }} />
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
          <h2 className="text-amber-400 mb-1">pass notes</h2>
          <ul className="text-xs text-stone-400">
            {focused.r.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
