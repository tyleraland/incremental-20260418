/* Shared helpers for the Codemap viewer platform. No build step: plain ES module
   imported by the shell and every view. Cytoscape is a global (vendored UMD). */

export const LAYER_COLORS = {
  engine: '#f0883e', data: '#3fb950', lib: '#58a6ff', components: '#bc8cff',
  pages: '#db61a2', stores: '#e3b341', save: '#39c5cf', proto: '#ff7b72',
  render: '#a5d6ff', dev: '#7d8590', root: '#6e7681', __tests__: '#484f58',
}
export const EXT_COLORS = {
  '.ts': '#3178c6', '.tsx': '#58a6ff', '.js': '#e3b341', '.mjs': '#e3b341', '.cjs': '#e3b341',
  '.json': '#8b949e', '.css': '#bc8cff', '.md': '#3fb950', '.html': '#f0883e',
  '.yml': '#39c5cf', '.yaml': '#39c5cf', '.svg': '#db61a2', '.sh': '#7d8590',
}
export const layerColor = (l) => LAYER_COLORS[l] || '#6e7681'
export const extColor = (e) => EXT_COLORS[e] || '#484f58'
export const short = (id) => String(id).replace(/^src\//, '')
export const el = (id) => document.getElementById(id)

export const fmtNum = (n) => (n == null ? '–' : Number(n).toLocaleString())
export const fmtBytes = (b) => {
  if (b == null) return '–'
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}

// heat ramp 0..1 -> dark teal → amber → red
export function heat(t) {
  t = Math.max(0, Math.min(1, t))
  const stops = [[33, 50, 60], [56, 120, 90], [227, 179, 65], [248, 81, 73]]
  const x = t * (stops.length - 1)
  const i = Math.floor(x), f = x - i
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)]
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

const cache = new Map()
export async function loadData(id) {
  if (cache.has(id)) return cache.get(id)
  const p = fetch(`./data/${id}.json`).then((r) => { if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`); return r.json() })
  cache.set(id, p)
  return p
}

/* ── detail panel ─────────────────────────────────────────────────────────── */
export function clearDetail() {
  el('detail').innerHTML = '<div class="detail-empty muted">Select something for details.</div>'
}
export function setDetail(html, linkHandler) {
  const d = el('detail')
  d.innerHTML = html
  if (linkHandler) d.querySelectorAll('a[data-go]').forEach((a) =>
    a.addEventListener('click', () => linkHandler(a.dataset.go, a.dataset.arg)))
}
export const sec = (title, items) =>
  `<div class="section">${title}</div><ul>` + items.map((i) => `<li>${i}</li>`).join('') + '</ul>'
export const goLink = (view, arg, label) => `<a data-go="${view}" data-arg="${arg}">${label}</a>`

/* ── cytoscape mount + highlight (shared by graph views) ──────────────────── */
export function mountCy(container, elements, style, layout) {
  const cy = cytoscape({ container, elements, style, layout, wheelSensitivity: 0.25, minZoom: 0.1, maxZoom: 3 })
  window.__cy = cy
  return cy
}
export function highlightNode(cy, node) {
  cy.elements().addClass('faded').removeClass('pick nbr lit')
  node.removeClass('faded').addClass('pick')
  node.connectedEdges().removeClass('faded').addClass('lit')
  node.connectedEdges().connectedNodes().removeClass('faded').addClass('nbr')
}
