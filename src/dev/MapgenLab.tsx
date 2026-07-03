// Dev-only mapgen lab (`?mapgen=1`): the human-validation surface for the
// procedural map generator (src/mapgen). Optimized for THROUGHPUT of eyeballs:
// a 3×3 seed contact sheet (nine maps per glance, like ?gallery=1 reviews the
// whole visual language in one screenshot), a focused view with per-plane
// toggles and per-pass skips (the layer inspector — stream-isolated RNG means
// toggling a pass changes ONLY that layer), and the validation report + pass
// notes beside the picture so a human never has to guess why a map is wrong.
//
// Renders the MapSpec directly to <canvas> as a DEBUG view — this is not the
// paper skin and never will be; terrain.tsx consuming MapSpec is its own phase.

import { useMemo, useState } from 'react'
import {
  generateMap, RECIPE_REGISTRY, SURFACE_MATERIALS, THEME_TAGS, PROFICIENCY_TAGS,
  type GenResult, type MapSpec, type ProficiencyTag, type ThemeTag,
} from '@/mapgen'

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

interface Toggles { surface: boolean; collision: boolean; scatter: boolean; semantic: boolean }

function drawSpec(canvas: HTMLCanvasElement | null, spec: MapSpec, px: number, t: Toggles) {
  if (!canvas) return
  const { cols, rows } = spec
  canvas.width = cols * px
  canvas.height = rows * px
  const g = canvas.getContext('2d')!
  const Y = (y: number) => (rows - y) * px   // world y-up → canvas y-down

  g.fillStyle = '#1c1917'
  g.fillRect(0, 0, canvas.width, canvas.height)
  if (t.surface) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        g.fillStyle = SURFACE_COLOR[SURFACE_MATERIALS[spec.surface.grid[y * cols + x]]] ?? '#f0f'
        g.fillRect(x * px, Y(y + 1), px + 0.5, px + 0.5)
      }
    }
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

function Thumb({ result, px, onClick, active }: { result: GenResult; px: number; onClick(): void; active: boolean }) {
  const t = { surface: true, collision: true, scatter: true, semantic: false }
  return (
    <button onClick={onClick} className="relative block" style={{ outline: active ? '3px solid #f59e0b' : '1px solid #44403c' }}>
      <canvas ref={(c) => drawSpec(c, result.spec, px, t)} style={{ display: 'block', width: result.spec.cols * px, height: result.spec.rows * px }} />
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
  const [toggles, setToggles] = useState<Toggles>({ surface: true, collision: true, scatter: true, semantic: true })

  const recipe = RECIPE_REGISTRY[recipeId]
  const params = { recipe: recipeId, size, themes, proficiencies: profs, onFail: 'accept' as const }

  const sheet = useMemo(
    () => Array.from({ length: 9 }, (_, i) => generateMap(recipe, { ...params, seed: baseSeed + i })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeId, size, themes, baseSeed, profs],
  )
  const focused = useMemo(() => {
    const t0 = performance.now()
    const r = generateMap(recipe, { ...params, seed: focus, skipPasses: skips })
    return { r, ms: performance.now() - t0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, size, themes, focus, skips, profs])

  const thumbPx = Math.max(1, Math.floor(150 / size))
  const bigPx = Math.max(2, Math.floor(560 / size))
  const tac = focused.r.spec.semantic.tactical

  return (
    <div className="min-h-full bg-stone-900 text-stone-200 p-4 font-mono text-sm overflow-auto">
      <h1 className="text-lg mb-1">mapgen lab</h1>
      <p className="text-stone-400 text-xs mb-3">contact sheet → click a seed to focus · toggle planes / skip passes on the focused map · report + pass notes below</p>

      <div className="flex flex-wrap gap-3 items-center mb-3">
        <label>recipe <select className="bg-stone-800 px-1" value={recipeId} onChange={(e) => { const id = e.target.value; setRecipeId(id); const ds = RECIPE_REGISTRY[id].defaults?.size; if (ds) setSize(ds) }}>
          {Object.keys(RECIPE_REGISTRY).map((id) => <option key={id}>{id}</option>)}
        </select></label>
        <label>size <input className="bg-stone-800 w-16 px-1" type="number" value={size} onChange={(e) => setSize(Math.max(12, +e.target.value || 12))} /></label>
        <label>seeds <input className="bg-stone-800 w-16 px-1" type="number" value={baseSeed} onChange={(e) => { setBaseSeed(+e.target.value || 0); setFocus(+e.target.value || 0) }} /></label>
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
          <div className="flex gap-3 mb-1 text-xs">
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
          <canvas ref={(c) => drawSpec(c, focused.r.spec, bigPx, toggles)} style={{ display: 'block', width: focused.r.spec.cols * bigPx, height: focused.r.spec.rows * bigPx }} />
          <div className="text-xs text-stone-400 mt-1">
            seed {focused.r.spec.seed} · attempt {focused.r.attempts} · {focused.ms.toFixed(0)}ms ·
            openness {tac.openness} · barriers {tac.barrierCount} · chokepoints {tac.chokepoints} · lanes {tac.longLanes} · cover {tac.coverClusters}
          </div>
        </div>

        <div className="max-w-md">
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
