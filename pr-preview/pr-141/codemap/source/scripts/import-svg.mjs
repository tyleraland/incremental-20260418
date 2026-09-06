// SVG → PropDef importer (asset-pipeline step 5; authoring guide: src/render/CLAUDE.md).
//
// Normalize an SVG drawn in a real editor (Inkscape / Figma / a tracer) into
// the paper prop data format (src/render/props.ts): flatten every transform,
// fit + quantize the geometry into the [-1,1] unit box, snap each fill/stroke
// to the NEAREST palette role (src/render/palette.ts), and REJECT anything the
// paper language forbids (filters, gradients, masks, images, text). The output
// is a paste-ready `PropDef` snippet — drawing in an editor needs zero runtime
// changes, and the palette contract test keeps the result honest either way.
//
//   node scripts/import-svg.mjs <file.svg> [options]     (npm run import-svg -- <file.svg>)
//
// Options:
//   --id <name>    prop id in the snippet            (default: the file stem)
//   --size <n>     PropDef size multiplier           (default 1)
//   --fit <r>      fit the art to ±r of the unit box (default 0.9)
//   --json         emit JSON instead of the TS snippet
//
// What it handles: path/rect/circle/ellipse/polygon/polyline/line, nested <g>
// transforms (matrix/translate/scale/rotate/skew), style="" or attribute
// paints. Arcs survive any similarity transform (translate/rotate/uniform
// scale/flip); a skew or non-uniform scale over an arc is an error — flatten
// the path in the editor first. Iterate on the result live in `?workshop=1`.
//
// Runs the palette straight from TS source via Vite's ssrLoadModule (the
// bsnap.mjs trick) — no build step, no new deps.

import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const opts = { file: null, id: null, size: 1, fit: 0.9, json: false }
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--id') opts.id = argv[++i]
  else if (a === '--size') opts.size = Number(argv[++i])
  else if (a === '--fit') opts.fit = Number(argv[++i])
  else if (a === '--json') opts.json = true
  else if (a === '-h' || a === '--help') { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(0, 26).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0) }
  else if (!opts.file) opts.file = a
  else fail(`unexpected argument: ${a}`)
}
if (!opts.file) fail('usage: node scripts/import-svg.mjs <file.svg> [--id name] [--size n] [--fit r] [--json]')

function fail(msg) { console.error(`import-svg: ${msg}`); process.exit(1) }
const warn = (msg) => console.error(`  ⚠ ${msg}`)

// ── matrices (x' = a·x + c·y + e; y' = b·x + d·y + f) ───────────────────────
const IDENT = [1, 0, 0, 1, 0, 0]
const mul = (m, n) => [   // apply n FIRST, then m (svg transform="M N" order)
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const det = (m) => m[0] * m[3] - m[1] * m[2]
// A similarity transform (rotation/uniform scale/flip, no skew) — the only
// family an arc's rx/ry/x-rotation survives without conversion to curves.
const isSimilarity = (m) => {
  const l1 = m[0] ** 2 + m[1] ** 2, l2 = m[2] ** 2 + m[3] ** 2
  return Math.abs(l1 - l2) < 1e-6 * Math.max(1, l1) && Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-6 * Math.max(1, l1)
}

function parseTransform(str) {
  let m = IDENT
  for (const [, fn, argStr] of str.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = argStr.split(/[\s,]+/).filter(Boolean).map(Number)
    let t = IDENT
    if (fn === 'matrix') t = v
    else if (fn === 'translate') t = [1, 0, 0, 1, v[0], v[1] ?? 0]
    else if (fn === 'scale') t = [v[0], 0, 0, v[1] ?? v[0], 0, 0]
    else if (fn === 'rotate') {
      const r = (v[0] * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r)
      t = [cos, sin, -sin, cos, 0, 0]
      if (v.length > 1) t = mul(mul([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]])
    } else if (fn === 'skewX') t = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0]
    else if (fn === 'skewY') t = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0]
    m = mul(m, t)
  }
  return m
}

// ── SVG scan: reject the forbidden, collect drawables with flat transforms ──
const src = readFileSync(opts.file, 'utf8')
for (const bad of ['linearGradient', 'radialGradient', 'filter', 'mask', 'pattern', '<image', '<text', 'fe' + 'GaussianBlur']) {
  if (src.includes(bad)) fail(`forbidden by the paper language: ${bad.replace('<', '')} (flat fills only — see src/render/CLAUDE.md)`)
}

const attrsOf = (tag) => {
  const out = {}
  for (const [, k, v1, v2] of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[k] = v1 ?? v2
  if (out.style) for (const decl of out.style.split(';')) {
    const [k, ...rest] = decl.split(':')
    if (k && rest.length && out[k.trim()] === undefined) out[k.trim()] = rest.join(':').trim()
  }
  return out
}

const DRAWABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'])
const SKIP_SUBTREE = new Set(['defs', 'clipPath', 'symbol', 'metadata'])
const elements = []                 // { tag, attrs, matrix }
{
  const stack = [{ matrix: IDENT, skip: false }]
  for (const [full, close, name, body, selfClose] of src.matchAll(/<(\/?)([a-zA-Z:]+)([^>]*?)(\/?)>/g)) {
    void full
    const top = stack[stack.length - 1]
    if (close) { if (stack.length > 1) stack.pop(); continue }
    const attrs = attrsOf(body)
    const matrix = attrs.transform ? mul(top.matrix, parseTransform(attrs.transform)) : top.matrix
    const skip = top.skip || SKIP_SUBTREE.has(name)
    if (!skip && DRAWABLE.has(name)) elements.push({ tag: name, attrs, matrix })
    if (!selfClose && name !== '?xml') stack.push({ matrix, skip })
  }
}
if (elements.length === 0) fail('no drawable elements found (path/rect/circle/ellipse/polygon/polyline/line)')

// ── primitives → path data ───────────────────────────────────────────────────
function primitiveToPath(tag, a) {
  const n = (k, dflt = 0) => Number(a[k] ?? dflt)
  switch (tag) {
    case 'rect': {
      if (a.rx || a.ry) warn(`rect corner radius dropped (${a.rx ?? a.ry}) — round it as a path in the editor if it matters`)
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
      return `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`
    }
    case 'circle': case 'ellipse': {
      const rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry')
      const [cx, cy] = [n('cx'), n('cy')]
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
    }
    case 'line': return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`
    case 'polygon': case 'polyline': {
      const pts = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
      let d = `M${pts[0]} ${pts[1]}`
      for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
      return tag === 'polygon' ? d + 'Z' : d
    }
    default: return a.d ?? ''
  }
}

// ── path transform: absolute-ize, then map every coordinate pair ────────────
// Returns { cmds: [{c, v: number[]}], pts: [[x,y]…] } with pts = every on-path
// + control point (the bbox sample set).
function transformPath(d, m) {
  const tokens = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?)/gi)]
  const out = [], pts = []
  let i = 0, cx = 0, cy = 0, startX = 0, startY = 0
  const read = () => Number(tokens[i++][2])
  const push = (c, v) => out.push({ c, v })
  const mapPt = (x, y) => { const p = apply(m, x, y); pts.push(p); return p }
  while (i < tokens.length) {
    const c = tokens[i][1]
    if (!c) fail(`malformed path data near token ${i}`)
    i++
    const rel = c === c.toLowerCase() && c !== 'z'
    const C = c.toUpperCase()
    if (C === 'Z') { push('Z', []); cx = startX; cy = startY; continue }
    // one command may carry several coordinate groups (implicit repetition;
    // after an M the implicit repeats are Ls)
    let first = true
    do {
      const eff = C === 'M' && !first ? 'L' : C
      if (eff === 'M' || eff === 'L' || eff === 'T') {
        const x = read() + (rel ? cx : 0), y = read() + (rel ? cy : 0)
        push(eff, [...mapPt(x, y)]); cx = x; cy = y
        if (eff === 'M') { startX = x; startY = y }
      } else if (eff === 'H') {
        const x = read() + (rel ? cx : 0)
        push('L', [...mapPt(x, cy)]); cx = x
      } else if (eff === 'V') {
        const y = read() + (rel ? cy : 0)
        push('L', [...mapPt(cx, y)]); cy = y
      } else if (eff === 'C' || eff === 'S' || eff === 'Q') {
        const k = eff === 'C' ? 3 : 2, v = []
        let x = cx, y = cy
        for (let j = 0; j < k; j++) { x = read() + (rel ? cx : 0); y = read() + (rel ? cy : 0); v.push(...mapPt(x, y)) }
        push(eff, v); cx = x; cy = y
      } else if (eff === 'A') {
        if (!isSimilarity(m)) fail('an arc under a skew/non-uniform scale — flatten the path to curves in the editor first')
        const s = Math.hypot(m[0], m[1])
        const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI
        const [rx, ry, xrot, laf, sf] = [read(), read(), read(), read(), read()]
        const x = read() + (rel ? cx : 0), y = read() + (rel ? cy : 0)
        push('A', [rx * s, ry * s, xrot + rot, laf, det(m) < 0 ? 1 - sf : sf, ...mapPt(x, y)])
        cx = x; cy = y
      } else fail(`unsupported path command: ${c}`)
      first = false
    } while (i < tokens.length && !tokens[i][1])
  }
  return { cmds: out, pts }
}

// ── color snap ───────────────────────────────────────────────────────────────
function parseColor(v) {
  if (!v || v === 'none' || v === 'transparent') return null
  const named = { black: [0, 0, 0], white: [255, 255, 255], grey: [128, 128, 128], gray: [128, 128, 128] }
  if (named[v]) return named[v]
  let m = v.match(/^#([0-9a-f]{3})$/i)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16))
  m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return [0, 1, 2].map((k) => parseInt(m[1].slice(k * 2, k * 2 + 2), 16))
  m = v.match(/^rgba?\(([^)]*)\)$/)
  if (m) return m[1].split(/[\s,/]+/).slice(0, 3).map(Number)
  if (v.includes('url(')) fail(`paint '${v}' references a paint server — flat palette fills only`)
  fail(`unparseable color: '${v}'`)
}

async function loadPalette() {
  const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
  try {
    return (await server.ssrLoadModule('/src/render/palette.ts')).PAPER_PALETTE
  } finally { await server.close() }
}

const PALETTE = await loadPalette()
const snapReport = []
function snapRole(v, kind, ctx) {
  const rgb = parseColor(v)
  if (!rgb) return null
  let best = null, bestD = Infinity
  for (const [role, hex] of Object.entries(PALETTE)) {
    const p = [0, 1, 2].map((k) => parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16))
    const d = Math.hypot(rgb[0] - p[0], rgb[1] - p[1], rgb[2] - p[2])
    if (d < bestD) { bestD = d; best = role }
  }
  snapReport.push(`  ${ctx} ${kind} ${v} → '${best}' (${PALETTE[best]}${bestD > 0.5 ? `, Δ${bestD.toFixed(0)}` : ', exact'})`)
  if (bestD > 90) warn(`${ctx}: '${v}' is far from every palette role (Δ${bestD.toFixed(0)}) — consider adding a role to palette.ts instead`)
  return best
}

// ── build, fit to the unit box, quantize, emit ───────────────────────────────
const paths = elements.map((el, idx) => {
  const d = primitiveToPath(el.tag, el.attrs)
  if (!d) fail(`element ${idx} (${el.tag}) has no geometry`)
  const { cmds, pts } = transformPath(d, el.matrix)
  const fillRole = el.attrs.fill === undefined && el.tag !== 'line' && el.tag !== 'polyline'
    ? snapRole('black', 'fill(default)', `path ${idx}`)          // SVG's default paint
    : snapRole(el.attrs.fill, 'fill', `path ${idx}`)
  const strokeRole = snapRole(el.attrs.stroke, 'stroke', `path ${idx}`)
  const sw = strokeRole ? Number(el.attrs['stroke-width'] ?? 1) * Math.sqrt(Math.abs(det(el.matrix))) : null
  const opacity = el.attrs.opacity !== undefined ? Number(el.attrs.opacity) : undefined
  return { cmds, pts, fillRole, strokeRole, sw, opacity }
})

const all = paths.flatMap((p) => p.pts)
const [minX, maxX] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))]
const [minY, maxY] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))]
const scale = (2 * opts.fit) / Math.max(maxX - minX, maxY - minY, 1e-9)
const [midX, midY] = [(minX + maxX) / 2, (minY + maxY) / 2]
const q = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r }
const fit = ([x, y]) => [q((x - midX) * scale), q((y - midY) * scale)]

const propPaths = paths.map((p) => {
  let d = ''
  for (const { c, v } of p.cmds) {
    if (c === 'Z') { d += 'Z'; continue }
    if (c === 'A') {
      const [rx, ry, rot, laf, sf, x, y] = v
      const [fx, fy] = fit([x, y])
      d += `A${q(rx * scale)} ${q(ry * scale)} ${q(rot)} ${laf} ${sf} ${fx} ${fy}`
      continue
    }
    const coords = []
    for (let i = 0; i < v.length; i += 2) coords.push(fit([v[i], v[i + 1]]).join(' '))
    d += `${c}${coords.join(' ')}`
  }
  const out = { d }
  if (p.fillRole) out.fill = p.fillRole
  if (p.strokeRole) { out.stroke = p.strokeRole; out.sw = Math.max(0.04, q(p.sw * scale)) }
  if (p.opacity !== undefined && p.opacity !== 1) out.opacity = p.opacity
  return out
})

const id = opts.id ?? basename(opts.file).replace(/\.svg$/i, '')
const def = { id, size: opts.size, paths: propPaths }

console.error(`import-svg: ${elements.length} element(s) from ${opts.file}, fitted ±${opts.fit}:`)
for (const line of snapReport) console.error(line)
console.error('  → paste into TERRAIN_PROPS (src/render/props.ts) or preview in ?workshop=1\n')

if (opts.json) {
  console.log(JSON.stringify(def, null, 2))
} else {
  const pathLines = propPaths.map((p) => {
    const parts = [`d: '${p.d}'`]
    if (p.fill) parts.push(`fill: '${p.fill}'`)
    if (p.stroke) parts.push(`stroke: '${p.stroke}'`, `sw: ${p.sw}`)
    if (p.opacity !== undefined) parts.push(`opacity: ${p.opacity}`)
    return `      { ${parts.join(', ')} },`
  })
  console.log(`    { id: '${id}', size: ${opts.size}, paths: [\n${pathLines.join('\n')}\n    ] },`)
}
