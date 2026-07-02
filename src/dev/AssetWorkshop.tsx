import { useMemo, useState } from 'react'
import type { Biome } from '@/render/appearance'
import { PAPER_PALETTE } from '@/render/palette'
import { ARENA_SKINS } from '@/render/skins'
import { propMarkup } from '@/render/terrain'
import { TERRAIN_PROPS, type PropDef } from '@/render/props'
import { hash01, scatter } from '@/render/authoring'

// Dev-only asset workshop (`?workshop=1`): the live authoring loop for paper
// props — the tool that makes producing an asset a type→see cycle instead of
// edit-file→reload→hunt-a-battle. Paste or edit a PropDef as JSON (or click an
// existing prop to start from it), and see it instantly on every biome ground
// at the LOD size ladder, plus a seeded mini-scatter showing how the game will
// place it (rotation/flip/scale jitter, the auto two-tone `lit` nudge — all
// applied exactly as terrain.tsx does, because it IS terrain's emitter).
// Validation runs on every keystroke: a rogue color names the offending path
// and points at the palette board (the same rule Palette.test.tsx enforces in
// CI). When it looks right, copy the TS snippet and paste it into
// TERRAIN_PROPS (src/render/props.ts).
//
// Pure render: imports only the render modules — no store, no engine. The
// draft persists in localStorage (ephemeral-UI tier) so a reload keeps your
// work. Full authoring guide: src/render/CLAUDE.md.

const BIOMES: Biome[] = ['grass', 'stone', 'plaza']
const SIZES = [16, 24, 40, 64, 96]
const DRAFT_KEY = 'workshop-def'

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
const propUrl = (def: PropDef) =>
  svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='-1.15 -1.15 2.3 2.3'>${propMarkup(def)}</svg>`)

// A 12-cell mini-field scattered with ONLY this prop, using the exact jitter
// recipe buildTerrainModel applies — the "how will the game place it" preview.
function sceneUrl(def: PropDef, seed: number): string {
  const cells = 12
  const parts = scatter(cells, cells, seed, 9, [], 0.4, 1.2).map((pt, i) => {
    const s = (0.55 + hash01(seed + i * 379 + 7) * 0.5) * def.size
    const rot = Math.round((hash01(seed + i * 379 + 19) - 0.5) * 24)
    const flip = hash01(seed + i * 379 + 31) < 0.5
    return `<g transform='translate(${Math.round(pt.x * 100) / 100} ${Math.round(pt.y * 100) / 100}) rotate(${rot}) scale(${flip ? -s : s} ${s})'>${propMarkup(def)}</g>`
  })
  return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${cells} ${cells}'>${parts.join('')}</svg>`)
}

// Same shape the import-svg script emits — paste-ready for TERRAIN_PROPS.
function toSnippet(def: PropDef): string {
  const lines = def.paths.map((p) => {
    const parts = [`d: '${p.d}'`]
    if (p.fill) parts.push(`fill: '${p.fill}'`)
    if (p.stroke) parts.push(`stroke: '${p.stroke}'`, `sw: ${p.sw ?? 0.1}`)
    if (p.opacity !== undefined) parts.push(`opacity: ${p.opacity}`)
    if (p.lit) parts.push('lit: true')
    return `      { ${parts.join(', ')} },`
  })
  return `    { id: '${def.id}', size: ${def.size}, paths: [\n${lines.join('\n')}\n    ] },`
}

function validate(v: unknown): { def: PropDef | null; errors: string[] } {
  const errors: string[] = []
  const d = v as Partial<PropDef>
  if (typeof d !== 'object' || d === null) return { def: null, errors: ['not an object'] }
  if (typeof d.id !== 'string' || !d.id) errors.push("missing 'id' (a string)")
  if (typeof d.size !== 'number') errors.push("missing 'size' (a number, ≈0.7–1.2)")
  if (!Array.isArray(d.paths) || d.paths.length === 0) {
    errors.push("missing 'paths' (an array of { d, fill?/stroke?, … })")
    return { def: null, errors }
  }
  d.paths.forEach((p, i) => {
    if (typeof p.d !== 'string' || !p.d.trim()) errors.push(`path ${i}: missing 'd'`)
    if (p.fill && !(p.fill in PAPER_PALETTE)) errors.push(`path ${i}: fill '${p.fill}' is not a palette role — pick one from the board below`)
    if (p.stroke && !(p.stroke in PAPER_PALETTE)) errors.push(`path ${i}: stroke '${p.stroke}' is not a palette role — pick one from the board below`)
    if (!p.fill && !p.stroke) errors.push(`path ${i}: paints nothing (needs a fill or a stroke)`)
    if (p.stroke && typeof p.sw !== 'number') errors.push(`path ${i}: a stroke needs 'sw' (≈0.06–0.16)`)
  })
  return { def: errors.length ? null : (d as PropDef), errors }
}

const STARTER = TERRAIN_PROPS.grass.find((p) => p.id === 'bush') ?? TERRAIN_PROPS.grass[0]

function GroundBox({ biome, size, children }: { biome: Biome; size: number; children?: React.ReactNode }) {
  const g = ARENA_SKINS.paper.grounds?.[biome]
  return (
    <div
      className="relative rounded border border-neutral-800 shrink-0"
      style={{
        width: size, height: size,
        ...ARENA_SKINS.paper.surface,
        ...(g ? { backgroundImage: g.image, backgroundSize: `${Math.max(16, size / 4)}px` } : null),
      }}
    >
      {children}
    </div>
  )
}

export default function AssetWorkshop() {
  const [text, setText] = useState<string>(() => {
    try { return localStorage.getItem(DRAFT_KEY) ?? JSON.stringify(STARTER, null, 2) }
    catch { return JSON.stringify(STARTER, null, 2) }
  })
  const [seed, setSeed] = useState(7)
  const [copied, setCopied] = useState(false)

  const { def, errors } = useMemo(() => {
    try { return validate(JSON.parse(text)) }
    catch (e) { return { def: null, errors: [`JSON: ${(e as Error).message}`] } }
  }, [text])

  const edit = (t: string) => {
    setText(t)
    setCopied(false)
    try { localStorage.setItem(DRAFT_KEY, t) } catch { /* private mode */ }
  }
  const load = (d: PropDef) => edit(JSON.stringify(d, null, 2))
  const copy = () => {
    if (!def) return
    navigator.clipboard?.writeText(toSnippet(def)).then(() => setCopied(true))
  }

  const url = def ? propUrl(def) : null

  return (
    <div data-workshop className="min-h-full bg-[#0b0b10] text-neutral-300 p-4 overflow-auto text-[12px]">
      <p className="text-[10px] text-neutral-500 mb-3">
        asset workshop — author a paper prop live (dev-only, ?workshop=1 · guide: src/render/CLAUDE.md · sibling: ?gallery=1)
      </p>

      <div className="flex flex-wrap gap-6 items-start">
        {/* editor column */}
        <div className="w-[340px] shrink-0">
          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400 mb-1">prop definition (JSON)</h2>
          <textarea
            value={text}
            onChange={(e) => edit(e.target.value)}
            spellCheck={false}
            className="w-full h-72 rounded border border-neutral-700 bg-[#12121a] text-emerald-100/90 font-mono text-[11px] p-2 leading-snug"
          />
          {errors.length > 0 ? (
            <ul className="mt-1 text-red-400/90 space-y-0.5">
              {errors.map((e, i) => <li key={i}>✗ {e}</li>)}
            </ul>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-emerald-400/90">✓ valid — contract-clean</span>
              <button onClick={copy} className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-white/5">
                {copied ? 'copied ✓' : 'copy TS snippet'}
              </button>
            </div>
          )}

          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400 mt-4 mb-1">start from an existing prop</h2>
          <div className="flex flex-wrap gap-1.5">
            {BIOMES.flatMap((b) => TERRAIN_PROPS[b].map((p) => (
              <button
                key={`${b}-${p.id}`}
                onClick={() => load(p)}
                title={`${b}/${p.id}`}
                className="w-11 h-11 rounded border border-neutral-800 hover:border-neutral-500"
                style={{ ...ARENA_SKINS.paper.surface, backgroundImage: `${propUrl(p)}, ${ARENA_SKINS.paper.grounds?.[b]?.image ?? ''}`, backgroundSize: '100% 100%, 22px' }}
              />
            )))}
          </div>

          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400 mt-4 mb-1">palette roles (click = copy name)</h2>
          <div className="flex flex-wrap gap-1">
            {Object.entries(PAPER_PALETTE).map(([role, hex]) => (
              <button
                key={role}
                onClick={() => navigator.clipboard?.writeText(role)}
                className="flex items-center gap-1 pr-1.5 rounded border border-neutral-800 hover:border-neutral-500"
                title={hex}
              >
                <span className="w-4 h-4 rounded-l" style={{ background: hex }} />
                <span className="text-[10px] text-neutral-400">{role}</span>
              </button>
            ))}
          </div>
        </div>

        {/* preview column */}
        <div className="flex-1 min-w-[320px]">
          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400 mb-1">size ladder × biome grounds</h2>
          {BIOMES.map((b) => (
            <div key={b} className="flex items-end gap-2 mb-2">
              {SIZES.map((s) => (
                <GroundBox key={s} biome={b} size={s + 12}>
                  {url && <div className="absolute inset-0" style={{ backgroundImage: url, backgroundSize: `${s}px`, backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />}
                </GroundBox>
              ))}
              <span className="text-[10px] text-neutral-500 pb-1">{b}</span>
            </div>
          ))}

          <div className="flex items-center gap-2 mt-4 mb-1">
            <h2 className="text-[11px] uppercase tracking-widest text-neutral-400">placed like the game places it (seeded jitter)</h2>
            <button onClick={() => setSeed((s) => s + 1)} className="px-1.5 rounded border border-neutral-600 text-[10px] hover:bg-white/5">
              reroll seed ({seed})
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {BIOMES.map((b) => (
              <GroundBox key={b} biome={b} size={224}>
                {def && <div className="absolute inset-0" style={{ backgroundImage: sceneUrl(def, seed), backgroundSize: '100% 100%' }} />}
              </GroundBox>
            ))}
          </div>

          <p className="mt-4 text-[10px] text-neutral-500 max-w-xl leading-relaxed">
            rules of the language: paths live in a ±1 unit box (y down) · colors are palette ROLES, never hex ·
            depth = a base path + the same path with <code>lit: true</code> (the renderer nudges it up-left — one light
            direction everywhere; or use <code>cutout()</code> in props.ts) · no gradients, no filters ·
            imported art: <code>npm run import-svg -- file.svg</code> normalizes an editor SVG into this exact shape.
          </p>
        </div>
      </div>
    </div>
  )
}
