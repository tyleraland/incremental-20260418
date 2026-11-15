import { useMemo, useState } from 'react'
import { type Biome, BODY_SHAPES, type BodyShape } from '@/render/appearance'
import { PAPER_PALETTE } from '@/render/palette'
import { ARENA_SKINS, TOKEN_SKINS } from '@/render/skins'
import { BodyAnimPreview } from './BodyAnimPreview'
import { propMarkup } from '@/render/terrain'
import { TERRAIN_PROPS, type PropDef } from '@/render/props'
import { listAssets, assetKey, type AssetDescriptor, type AssetCategory } from '@/render/assets'
import { assetCoverage, PROP_ROLES } from '@/render/coverage'
import { SCATTER_KINDS, THEME_TAGS, type ThemeTag, type ScatterKind } from '@/mapgen'
import type { PropRole } from '@/render/props'
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
// The ASSET CATALOG panel (render/assets.ts `listAssets()`) lists every asset —
// prop / monster-body / weapon / building / ground — with its metadata: which
// mapgen `kinds` place a prop (empty = decor/unscattered), a ★ for
// player-selectable, tags on hover. Click to multi-SELECT across categories,
// then "copy names" writes the selected `category:id`s for bulk feedback; a
// prop's ✎ loads it into the editor. Props' `kinds` live in `PROP_META`
// (props.ts) — the catalog surfaces them so nothing goes dark on a generated map.
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

// Same shape props are declared in — paste-ready for TERRAIN_PROPS. `kinds` (and
// playerSelectable/tags) live in PROP_META, so they're emitted as a companion
// line, not on the literal.
function toSnippet(def: PropDef): string {
  const lines = def.paths.map((p) => {
    const parts = [`d: '${p.d}'`]
    if (p.fill) parts.push(`fill: '${p.fill}'`)
    if (p.stroke) parts.push(`stroke: '${p.stroke}'`, `sw: ${p.sw ?? 0.1}`)
    if (p.opacity !== undefined) parts.push(`opacity: ${p.opacity}`)
    if (p.lit) parts.push('lit: true')
    return `      { ${parts.join(', ')} },`
  })
  const arr = (xs?: readonly string[]) => `[${(xs ?? []).map((x) => `'${x}'`).join(', ')}]`
  const metaParts = [
    def.kinds ? `kinds: ${arr(def.kinds)}` : '',
    def.playerSelectable ? 'playerSelectable: true' : '',
    def.tags?.length ? `tags: ${arr(def.tags)}` : '',
    // placement schema (props.ts) — weighted/theme/rotate pick + procgen hints
    def.weight !== undefined ? `weight: ${def.weight}` : '',
    def.themes?.length ? `themes: ${arr(def.themes)}` : '',
    def.role ? `role: '${def.role}'` : '',
    def.near?.length ? `near: ${arr(def.near)}` : '',
    def.avoid?.length ? `avoid: ${arr(def.avoid)}` : '',
    def.rotate ? `rotate: '${def.rotate}'` : '',
    def.clusterWith?.length ? `clusterWith: ${arr(def.clusterWith)}` : '',
  ].filter(Boolean)
  const meta = metaParts.length ? `\n  // PROP_META: ${def.id}: { ${metaParts.join(', ')} },` : ''
  return `    { id: '${def.id}', size: ${def.size}, paths: [\n${lines.join('\n')}\n    ] },${meta}`
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
  // optional metadata (tolerated so a stamped prop round-trips; surfaced as badges)
  if (d.kinds !== undefined) {
    if (!Array.isArray(d.kinds)) errors.push("'kinds' must be an array of ScatterKinds")
    else d.kinds.forEach((k) => { if (!(SCATTER_KINDS as readonly string[]).includes(k)) errors.push(`kind '${k}' is not a ScatterKind (${SCATTER_KINDS.join('/')})`) })
  }
  return { def: errors.length ? null : (d as PropDef), errors }
}

const STARTER = TERRAIN_PROPS.grass.find((p) => p.id === 'bush') ?? TERRAIN_PROPS.grass[0]
const propOf = (a: AssetDescriptor): PropDef | null =>
  a.category === 'prop' && a.biome ? TERRAIN_PROPS[a.biome].find((p) => p.id === a.id) ?? null : null

const CATS: { cat: AssetCategory; label: string }[] = [
  { cat: 'prop', label: 'props' },
  { cat: 'monster-body', label: 'monster bodies' },
  { cat: 'weapon', label: 'weapons' },
  { cat: 'building', label: 'buildings' },
  { cat: 'ground', label: 'grounds' },
]

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
  const [monBody, setMonBody] = useState<BodyShape>('canine')
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [namesCopied, setNamesCopied] = useState(false)
  // catalog filters (compose with AND) + group-by. All prop-centric: a theme/
  // role/kind filter narrows to matching props (non-prop assets carry no tags).
  const [groupBy, setGroupBy] = useState<'category' | 'theme' | 'role'>('category')
  const [fTheme, setFTheme] = useState<Set<ThemeTag>>(new Set())
  const [fRole, setFRole] = useState<Set<PropRole>>(new Set())
  const [fKind, setFKind] = useState<Set<ScatterKind>>(new Set())

  const coverage = useMemo(() => assetCoverage(), [])
  const catalog = useMemo(() => listAssets(), [])
  const filtered = useMemo(() => {
    const keep = (a: AssetDescriptor): boolean => {
      if (fTheme.size) {
        if (a.category !== 'prop') return false
        const th = a.themes ?? []
        if (!(th.length === 0 || th.some((t) => fTheme.has(t)))) return false // universal props match any theme
      }
      if (fRole.size) {
        if (a.category !== 'prop') return false
        if (!fRole.has(a.role ?? 'field')) return false
      }
      if (fKind.size) {
        if (a.category !== 'prop') return false
        if (!(a.kinds ?? []).some((k) => fKind.has(k))) return false
      }
      return true
    }
    return catalog.filter(keep)
  }, [catalog, fTheme, fRole, fKind])

  const byCat = useMemo(() => {
    const m = new Map<AssetCategory, AssetDescriptor[]>()
    for (const a of filtered) (m.get(a.category) ?? m.set(a.category, []).get(a.category)!).push(a)
    return m
  }, [filtered])
  // group-by theme / role operate on props only (the taggable category).
  const props = useMemo(() => filtered.filter((a) => a.category === 'prop'), [filtered])
  const groups = useMemo((): { label: string; items: AssetDescriptor[] }[] => {
    if (groupBy === 'theme') {
      const out: { label: string; items: AssetDescriptor[] }[] =
        THEME_TAGS.map((t) => ({ label: t as string, items: props.filter((a) => (a.themes ?? []).includes(t)) }))
      const universal = props.filter((a) => !(a.themes && a.themes.length))
      if (universal.length) out.push({ label: 'universal (no themes)', items: universal })
      return out.filter((g) => g.items.length)
    }
    return PROP_ROLES.map((r) => ({ label: r, items: props.filter((a) => (a.role ?? 'field') === r) })).filter((g) => g.items.length)
  }, [groupBy, props])
  const filtersActive = fTheme.size + fRole.size + fKind.size > 0

  const toggleSet = <T,>(set: (fn: (p: Set<T>) => Set<T>) => void) => (v: T) =>
    set((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); setNamesCopied(false); return n })
  const toggleTheme = toggleSet(setFTheme)
  const toggleRole = toggleSet(setFRole)
  const toggleKind = toggleSet(setFKind)
  const clearFilters = () => { setFTheme(new Set()); setFRole(new Set()); setFKind(new Set()) }

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
  const toggle = (key: string) => {
    setNamesCopied(false)
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const copyNames = () => {
    if (!selected.size) return
    navigator.clipboard?.writeText([...selected].join('\n')).then(() => setNamesCopied(true))
  }

  const url = def ? propUrl(def) : null

  // One asset card — reused by the category / theme / role groupings.
  const card = (a: AssetDescriptor) => {
    const key = assetKey(a)
    const pdef = propOf(a)
    const sel = selected.has(key)
    const isProp = a.category === 'prop'
    const title = [
      key,
      a.kinds?.length ? `kinds: ${a.kinds.join(', ')}` : (isProp ? 'kinds: none' : ''),
      a.role ? `role: ${a.role}` : '',
      a.weight !== undefined ? `weight: ${a.weight}` : '',
      a.themes?.length ? `themes: ${a.themes.join(', ')}` : (isProp ? 'themes: universal' : ''),
      a.rotate ? `rotate: ${a.rotate}` : '',
      a.near?.length ? `near: ${a.near.join(', ')}` : '',
      a.avoid?.length ? `avoid: ${a.avoid.join(', ')}` : '',
      a.clusterWith?.length ? `clusterWith: ${a.clusterWith.join(', ')}` : '',
      a.tags.length ? `tags: ${a.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n')
    return (
      <div
        key={key}
        onClick={() => toggle(key)}
        title={title}
        className={`relative w-[74px] rounded border cursor-pointer select-none ${sel ? 'border-emerald-400 ring-1 ring-emerald-400/60' : 'border-neutral-800 hover:border-neutral-600'}`}
      >
        {pdef && a.biome ? (
          <div
            className="h-[46px] rounded-t"
            style={{ ...ARENA_SKINS.paper.surface, backgroundImage: `${propUrl(pdef)}, ${ARENA_SKINS.paper.grounds?.[a.biome]?.image ?? ''}`, backgroundSize: '100% 100%, 20px' }}
          />
        ) : (
          <div className="h-[46px] rounded-t bg-[#12121a] flex items-center justify-center text-[9px] text-neutral-500 px-1 text-center">{a.material ?? a.biome ?? a.category}</div>
        )}
        <div className="px-1 py-0.5 flex items-center gap-0.5">
          <span className="text-[10px] text-neutral-300 truncate">{a.id}</span>
          {a.playerSelectable && <span className="text-[9px] text-yellow-300/90">★</span>}
          {pdef && (
            <button
              onClick={(e) => { e.stopPropagation(); load(pdef) }}
              title="edit in the authoring panel"
              className="ml-auto text-[10px] text-neutral-500 hover:text-emerald-300"
            >✎</button>
          )}
        </div>
        {isProp && (
          <>
            <div className="px-1 text-[8px] leading-tight text-neutral-500 truncate">
              {a.kinds?.length ? a.kinds.join(' ') : <span className="text-amber-400/70">decor</span>}
            </div>
            <div className="px-1 pb-0.5 text-[8px] leading-tight text-sky-400/70 truncate">
              {a.role || a.weight !== undefined || a.themes?.length || a.rotate ? (
                [
                  a.role,
                  a.weight !== undefined ? `w${a.weight}` : '',
                  a.rotate ? `↻${a.rotate}` : '',
                  a.themes?.length ? a.themes.join(',') : 'universal',
                ].filter(Boolean).join(' · ')
              ) : (
                <span className="text-amber-400/60">untagged</span>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div data-workshop className="min-h-full bg-[#0b0b10] text-neutral-300 p-4 overflow-auto text-[12px]">
      <p className="text-[10px] text-neutral-500 mb-3">
        asset workshop — author a paper prop + browse/select every asset (dev-only, ?workshop=1 · guide: src/render/CLAUDE.md · sibling: ?gallery=1)
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
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-emerald-400/90">✓ valid — contract-clean</span>
              {def?.kinds && (
                <span className="text-[10px] text-neutral-400">
                  kinds: {def.kinds.length ? def.kinds.join(', ') : <em className="text-amber-400/80">none — decor/unscattered</em>}
                </span>
              )}
              {def && (def.role || def.weight !== undefined || def.themes?.length || def.rotate) && (
                <span className="text-[10px] text-sky-400/80">
                  {[
                    def.role ?? 'field',
                    `w${def.weight ?? 1}`,
                    `↻${def.rotate ?? 'upright'}`,
                    def.themes?.length ? def.themes.join(',') : 'universal',
                  ].join(' · ')}
                </span>
              )}
              {def?.playerSelectable && <span className="text-[10px] text-yellow-300/90">★ player-selectable</span>}
              <button onClick={copy} className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-white/5">
                {copied ? 'copied ✓' : 'copy TS snippet'}
              </button>
            </div>
          )}

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

      {/* ── Monster bodies: the animated token families, grouped, with a state
             machine (idle / attack / walk / hit — the same CSS the battlefield
             uses, via the shared BodyAnimPreview). Pick a body on the left; it
             drives the live preview on the right. ── */}
      <div className="mt-6 border-t border-neutral-800 pt-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400">monster bodies ({BODY_SHAPES.length})</h2>
          <span className="text-[10px] text-neutral-500">click a body · toggle idle / attack / walk / hit (more states as they land)</span>
        </div>
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex flex-wrap gap-1.5 max-w-[430px]">
            {BODY_SHAPES.map((s) => {
              const Body = TOKEN_SKINS.paper
              const sel = s === monBody
              return (
                <button
                  key={s}
                  onClick={() => setMonBody(s)}
                  title={s}
                  className={`w-[60px] rounded border ${sel ? 'border-emerald-400 ring-1 ring-emerald-400/60' : 'border-neutral-800 hover:border-neutral-600'}`}
                >
                  <div className="h-[46px] grid place-items-center bg-[#141019] rounded-t overflow-hidden">
                    <Body glyph="" tone="enemy" bodyShape={s} creature alive selected={false} facingDeg={0} dims={{ width: '40px', height: '40px', fontSize: '0px' }} />
                  </div>
                  <div className="px-1 py-0.5 text-[9px] text-neutral-400 truncate text-center">{s}</div>
                </button>
              )
            })}
          </div>
          <div className="rounded-lg border border-neutral-800 p-3 bg-[#0f0f16]">
            <BodyAnimPreview shape={monBody} size={120} />
            <p className="mt-2 text-[10px] text-neutral-500 max-w-[19rem] leading-snug">
              Live paper token (facing right). <b className="text-neutral-300">Idle</b> · <b className="text-neutral-300">Attack</b> (jab + lunge, loops back to idle) · <b className="text-neutral-300">Walk</b> (foot shuffle — legged bodies only) · <b className="text-neutral-300">Hit</b> (recoil). More states slot in as they're authored.
            </p>
          </div>
        </div>
      </div>

      {/* ── Asset catalog: every asset, discoverable + multi-selectable ── */}
      <div className="mt-6 border-t border-neutral-800 pt-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400">asset catalog ({catalog.length})</h2>
          <span className="text-[10px] text-neutral-500">click = select · ✎ = edit prop · ★ = player-selectable</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-neutral-400">{selected.size} selected</span>
            <button
              onClick={copyNames}
              disabled={!selected.size}
              className="px-2 py-0.5 rounded border border-neutral-600 hover:bg-white/5 disabled:opacity-40"
            >
              {namesCopied ? 'copied ✓' : 'copy names'}
            </button>
            <button
              onClick={() => { setSelected(new Set()); setNamesCopied(false) }}
              disabled={!selected.size}
              className="px-2 py-0.5 rounded border border-neutral-800 hover:bg-white/5 disabled:opacity-40"
            >
              clear
            </button>
          </span>
        </div>

        {/* filters + group-by (all prop-centric — narrow to matching props) */}
        <div className="mb-3 space-y-1 text-[10px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-500 w-12">group</span>
            {(['category', 'theme', 'role'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-2 py-0.5 rounded border ${groupBy === g ? 'border-emerald-400 text-emerald-300' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}
              >{g}</button>
            ))}
            <span className="ml-2 text-neutral-500">{filtered.length}/{catalog.length} shown</span>
            {filtersActive && (
              <button onClick={clearFilters} className="px-2 py-0.5 rounded border border-neutral-700 text-neutral-400 hover:border-neutral-500">clear filters</button>
            )}
          </div>
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-neutral-500 w-12 pt-0.5">theme</span>
            <span className="flex flex-wrap gap-1">
              {THEME_TAGS.map((t) => (
                <button key={t} onClick={() => toggleTheme(t)}
                  className={`px-1.5 rounded border ${fTheme.has(t) ? 'border-amber-400 text-amber-300' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}>{t}</button>
              ))}
            </span>
          </div>
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-neutral-500 w-12 pt-0.5">role</span>
            <span className="flex flex-wrap gap-1">
              {PROP_ROLES.map((r) => (
                <button key={r} onClick={() => toggleRole(r)}
                  className={`px-1.5 rounded border ${fRole.has(r) ? 'border-sky-400 text-sky-300' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}>{r}</button>
              ))}
            </span>
          </div>
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-neutral-500 w-12 pt-0.5">kind</span>
            <span className="flex flex-wrap gap-1">
              {SCATTER_KINDS.map((k) => (
                <button key={k} onClick={() => toggleKind(k)}
                  className={`px-1.5 rounded border ${fKind.has(k) ? 'border-fuchsia-400 text-fuchsia-300' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}>{k}</button>
              ))}
            </span>
          </div>
        </div>

        {groupBy === 'category' ? (
          CATS.map(({ cat, label }) => {
            const items = byCat.get(cat) ?? []
            if (!items.length) return null
            return (
              <div key={cat} className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">{label} ({items.length})</div>
                <div className="flex flex-wrap gap-1.5">{items.map(card)}</div>
              </div>
            )
          })
        ) : (
          groups.length ? groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">{g.label} ({g.items.length})</div>
              <div className="flex flex-wrap gap-1.5">{g.items.map(card)}</div>
            </div>
          )) : <div className="text-[10px] text-neutral-500">no props match the filters</div>
        )}
      </div>

      {/* ── Coverage: per-theme scatter capabilities + gaps (render/coverage.ts) ── */}
      <div className="mt-6 border-t border-neutral-800 pt-4">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h2 className="text-[11px] uppercase tracking-widest text-neutral-400">theme coverage</h2>
          <span className="text-[10px] text-neutral-500">
            ✓/count = props the generator can draw on a map of this theme (themed + universal) · ⚠️ = a gap that falls back to filler (generation stays graceful)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-collapse">
            <thead>
              <tr className="text-neutral-500 text-left">
                <th className="pr-3 py-1 font-normal">theme</th>
                <th className="px-2 py-1 font-normal text-right">themed</th>
                {PROP_ROLES.map((r) => <th key={r} className="px-2 py-1 font-normal">{r}</th>)}
                <th className="px-2 py-1 font-normal">gaps</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => {
                const cell = (n: number, warn: boolean) => (
                  <td className={`px-2 py-0.5 ${n ? 'text-emerald-300' : warn ? 'text-amber-400/90' : 'text-neutral-700'}`}>
                    {n ? `✓ ${n}` : (warn ? '⚠️' : '·')}
                  </td>
                )
                return (
                  <tr key={c.theme} className="border-t border-neutral-900">
                    <td className={`pr-3 py-0.5 ${c.hasThemed ? 'text-neutral-300' : 'text-amber-400'}`}>
                      {c.theme}{!c.hasThemed && ' ⚠️'}
                    </td>
                    <td className={`px-2 py-0.5 text-right ${c.hasThemed ? 'text-neutral-400' : 'text-amber-400'}`}>{c.themedCount}</td>
                    {cell(c.byRole.field, false)}
                    {cell(c.byRole.cluster, c.hasThemed)}
                    {cell(c.byRole.edge, c.hasThemed)}
                    {cell(c.byRole.understory, false)}
                    {cell(c.byRole.accent, false)}
                    <td className="px-2 py-0.5">
                      {c.gaps.length ? (
                        <span className="text-amber-400/90 cursor-help" title={c.gaps.join('\n')}>⚠️ {c.gaps.length}</span>
                      ) : (
                        <span className="text-emerald-400/70">full</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-neutral-500 max-w-2xl leading-relaxed">
          Gaps are WARNINGS, not failures — the generator falls back to the universal / cross-theme candidate set
          (terrain.tsx <code>themeFilteredCands</code>/<code>roleFilteredCands</code>), so a theme with no edge/ribbon
          prop still renders filler grass at its shorelines/verges. Fill a gap by tagging (or authoring) a prop in
          <code> PROP_META</code> (props.ts) with that theme + role. Live source of truth — this table updates as props change.
        </p>
      </div>
    </div>
  )
}
