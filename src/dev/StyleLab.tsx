import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tone } from '@/render/appearance'
import { PAPER_PALETTE, PAPER_TONE } from '@/render/palette'
import { compilePaperRigDirections } from '@/render/paperRig/compile'
import type { CompiledPaperRigView } from '@/render/paperRig/types'
import { WORKBENCH_HORSE } from '@/render/paperRig/horse'

// ── Style lab (?stylelab=1) ──────────────────────────────────────────────────
//
// One 3D representation (the parametric WORKBENCH_HORSE rig) → one projection
// core (compilePaperRigDirections: FK + heading rotate + 60° ortho project +
// depth sort, in paperRig/compile.ts) → THREE swappable stylizers, rendered
// across the eight baked headings so an art-style choice becomes a screenshot
// instead of an argument. Everything stays on the shipped paper contract:
// named palette ROLES only, one light direction (dark base + lit copy nudged
// up-left), deterministic geometry. The point is that the expensive part —
// turning a posed 3D rig into flat 2D — is shared; a "style" is just the thin
// back end that paints the projected parts.

const VIEWS = compilePaperRigDirections(WORKBENCH_HORSE)
const TONES: readonly Tone[] = ['neutral', 'enemy', 'player']

// A draw op is a single flat path: fill + optional dark outline, optionally the
// lit two-tone copy (nudged up-left) or a heavier ink stroke.
interface Op { d: string; fill: string; outline?: string; nudge?: boolean; heavy?: boolean }

// Accents (hooves / muzzle / tail) get fixed material roles so the creature
// reads as one family regardless of team tone — same idea as the shipped bodies.
function accentColor(id: string): string {
  if (id.startsWith('muzzle')) return PAPER_PALETTE.cream
  if (id.includes('Hoof')) return PAPER_PALETTE.wallOutline
  return PAPER_PALETTE.woodDeep // tail / mane
}

// STYLE A — flat paper-cel: the shipped two-tone look, sourced from the rig.
// Body plates draw a dark base + outline, then the same path in the lit tone
// nudged up-left (the pseudo-3D read without a gradient). Accents stay flat.
function celOps(view: CompiledPaperRigView, tone: Tone): Op[] {
  const T = PAPER_TONE[tone]
  const ops: Op[] = []
  for (const part of view.parts) {
    if (part.role === 'body') {
      ops.push({ d: part.d, fill: T.base, outline: T.outline })
      ops.push({ d: part.d, fill: T.top, nudge: true })
    } else {
      ops.push({ d: part.d, fill: accentColor(part.id), outline: T.outline })
    }
  }
  return ops
}

// STYLE B — inked / illustrative: flat single-tone fills (no lit nudge, so it
// reads flatter and more graphic) with a heavy ink stroke on every part. NOTE:
// a single clean silhouette outline needs a boolean union of the parts (not
// done here); the per-part ink overlap is the cheap stand-in and the honest
// limit the research flagged for geometry-native vector.
function inkedOps(view: CompiledPaperRigView, tone: Tone): Op[] {
  const T = PAPER_TONE[tone]
  return view.parts.map((part) => ({
    d: part.d,
    fill: part.role === 'body' ? T.top : accentColor(part.id),
    outline: PAPER_PALETTE.ink,
    heavy: true,
  }))
}

function OpsSvg({ view, ops, size }: { view: CompiledPaperRigView; ops: Op[]; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="block overflow-visible" aria-hidden>
      <ellipse cx={view.shadow.cx} cy={view.shadow.cy} rx={view.shadow.rx} ry={view.shadow.ry} fill={PAPER_PALETTE.shadow} fillOpacity={0.24} />
      {ops.map((op, i) => (
        <path
          key={i}
          d={op.d}
          fill={op.fill}
          stroke={op.outline}
          strokeWidth={op.outline ? (op.heavy ? 2.2 : 1.1) : undefined}
          transform={op.nudge ? 'translate(-1.4 -2)' : undefined}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

// STYLE C — pixel scaffold: rasterize the cel SVG small (no smoothing), then
// snap every opaque pixel to the nearest palette color. Demonstrates the
// "3D-as-scaffold" finding entirely client-side; a CI build would swap the
// browser Image/canvas rasterizer for resvg/sharp and emit an indexed PNG.
function celSvgString(view: CompiledPaperRigView, tone: Tone): string {
  const sh = view.shadow
  const body = celOps(view, tone)
    .map((op) => `<path d="${op.d}" fill="${op.fill}"${op.outline ? ` stroke="${op.outline}" stroke-width="1.1"` : ''}${op.nudge ? ' transform="translate(-1.4 -2)"' : ''} stroke-linejoin="round"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><ellipse cx="${sh.cx}" cy="${sh.cy}" rx="${sh.rx}" ry="${sh.ry}" fill="${PAPER_PALETTE.shadow}" fill-opacity="0.24"/>${body}</svg>`
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function pixelPalette(tone: Tone): [number, number, number][] {
  const T = PAPER_TONE[tone]
  return [T.top, T.base, T.outline, PAPER_PALETTE.woodDeep, PAPER_PALETTE.wallOutline, PAPER_PALETTE.cream].map(hexToRgb)
}

function quantize(data: ImageData, palette: [number, number, number][]) {
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) { px[i + 3] = 0; continue }
    px[i + 3] = 255
    let best = 0
    let bestDist = Infinity
    for (let p = 0; p < palette.length; p++) {
      const dr = px[i] - palette[p][0]
      const dg = px[i + 1] - palette[p][1]
      const db = px[i + 2] - palette[p][2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) { bestDist = dist; best = p }
    }
    px[i] = palette[best][0]
    px[i + 1] = palette[best][1]
    px[i + 2] = palette[best][2]
  }
}

function PixelHorse({ view, tone, size, pixels }: { view: CompiledPaperRigView; tone: Tone; size: number; pixels: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const svg = useMemo(() => celSvgString(view, tone), [view, tone])
  const palette = useMemo(() => pixelPalette(tone), [tone])
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      ctx.clearRect(0, 0, pixels, pixels)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, pixels, pixels)
      const data = ctx.getImageData(0, 0, pixels, pixels)
      quantize(data, palette)
      ctx.putImageData(data, 0, 0)
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    return () => { cancelled = true }
  }, [svg, palette, pixels])
  return <canvas ref={ref} width={pixels} height={pixels} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
}

const CELL = 78
const PIXELS = 44

const ROWS = [
  { key: 'cel', label: 'A · Flat cel', note: 'shipped two-tone, rig-sourced' },
  { key: 'inked', label: 'B · Inked', note: 'flat fills + heavy ink stroke' },
  { key: 'pixel', label: 'C · Pixel', note: `raster ${PIXELS}px + palette snap` },
] as const

export default function StyleLab() {
  const [tone, setTone] = useState<Tone>('neutral')
  return (
    <div className="min-h-full overflow-auto bg-neutral-900 p-5 text-neutral-200">
      <h1 className="text-lg font-semibold text-neutral-50">Style lab</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-400">
        One rig (<code>WORKBENCH_HORSE</code>) → one projection core → three stylizers, across the eight baked headings.
        The 3D→2D projection is shared; a "style" is just the thin back end that paints the projected parts. All fills are
        palette roles, one light direction, deterministic.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Team tone</span>
        {TONES.map((t) => (
          <button
            key={t}
            onClick={() => setTone(t)}
            className={`rounded px-2.5 py-1 text-xs capitalize ${t === tone ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-800 text-neutral-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4 inline-grid gap-px rounded bg-neutral-800" style={{ gridTemplateColumns: `120px repeat(${VIEWS.length}, ${CELL}px)` }}>
        <div className="bg-neutral-900 p-2" />
        {VIEWS.map((v) => (
          <div key={v.headingDeg} className="bg-neutral-900 p-1 text-center text-[11px] text-neutral-500">{v.headingDeg}°</div>
        ))}
        {ROWS.map((row) => (
          <StyleRow key={row.key} row={row} tone={tone} />
        ))}
      </div>

      <p className="mt-4 max-w-2xl text-xs text-neutral-500">
        Honest limits (per the research): silhouette detail can pop between headings — coarsen &amp; merge to stabilize.
        Inked's single clean outline wants a boolean union of the parts (the per-part ink overlap here is the cheap
        stand-in). The pixel row is a scaffold: good for pose/angle consistency, but a hero sprite still wants a human
        pixel pass. In CI the pixel rasterizer would be resvg/sharp emitting an indexed PNG, not a browser canvas.
      </p>
    </div>
  )
}

function StyleRow({ row, tone }: { row: (typeof ROWS)[number]; tone: Tone }) {
  return (
    <>
      <div className="flex flex-col justify-center bg-neutral-900 p-2">
        <span className="text-xs font-medium text-neutral-200">{row.label}</span>
        <span className="text-[10px] text-neutral-500">{row.note}</span>
      </div>
      {VIEWS.map((view) => (
        <div key={view.headingDeg} className="flex items-center justify-center bg-neutral-900 p-1">
          {row.key === 'cel' && <OpsSvg view={view} ops={celOps(view, tone)} size={CELL - 8} />}
          {row.key === 'inked' && <OpsSvg view={view} ops={inkedOps(view, tone)} size={CELL - 8} />}
          {row.key === 'pixel' && <PixelHorse view={view} tone={tone} size={CELL - 8} pixels={PIXELS} />}
        </div>
      ))}
    </>
  )
}
