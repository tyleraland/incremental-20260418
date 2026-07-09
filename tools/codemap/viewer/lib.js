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

/* ── raw source viewer ────────────────────────────────────────────────────── */
const srcCache = new Map()
function loadSource(path) {
  if (!srcCache.has(path)) srcCache.set(path, fetch(`./source/${path}`).then((r) => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
  return srcCache.get(path)
}
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
// a clickable "view source" anchor (wired by wireSrc / setDetail)
export const srcLink = (path, line, label) => `<a data-src="${path}"${line ? ` data-line="${line}"` : ''}>${label}</a>`

export async function openSource(path, line) {
  let host = document.getElementById('source-overlay')
  if (!host) { host = document.createElement('div'); host.id = 'source-overlay'; document.body.appendChild(host) }
  host.hidden = false
  host.innerHTML =
    `<div class="src-head"><span class="src-path mono">${short(path)}</span>` +
    (line ? `<span class="muted mono">:${line}</span>` : '') +
    `<span class="muted" style="margin-left:auto;font-size:11px">source</span>` +
    `<button class="src-close" aria-label="Close">✕</button></div>` +
    `<div class="src-body"><div class="muted" style="padding:16px">loading…</div></div>`
  const close = () => { host.hidden = true }
  host.querySelector('.src-close').addEventListener('click', close)
  host.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })
  let text
  try { text = await loadSource(path) }
  catch (e) { host.querySelector('.src-body').innerHTML = `<div class="muted" style="padding:16px">Source unavailable (${e.message}). It may be binary or over the size cap.</div>`; return }
  const lines = text.split('\n')
  host.querySelector('.src-body').innerHTML =
    '<table class="src-code"><tbody>' +
    lines.map((l, i) => `<tr id="L${i + 1}"><td class="ln">${i + 1}</td><td class="lc">${escapeHtml(l) || ' '}</td></tr>`).join('') +
    '</tbody></table>'
  if (line) {
    const row = document.getElementById('L' + line)
    if (row) { row.classList.add('src-hot'); row.scrollIntoView({ block: 'center' }) }
  }
}

// wire any [data-src] anchors within `root` to the source viewer
export function wireSrc(root) {
  root.querySelectorAll('a[data-src]').forEach((a) =>
    a.addEventListener('click', (e) => { e.preventDefault(); openSource(a.dataset.src, a.dataset.line ? +a.dataset.line : null) }))
}

/* ── detail panel (a bottom sheet on mobile) ──────────────────────────────── */
export function clearDetail() {
  el('detail').innerHTML = '<div class="detail-empty muted">Select something for details.</div>'
  document.body.classList.remove('detail-open')
}
export function setDetail(html, linkHandler) {
  const d = el('detail')
  d.innerHTML = '<button class="sheet-close" aria-label="Close">✕</button>' + html
  document.body.classList.add('detail-open')
  d.querySelector('.sheet-close').addEventListener('click', clearDetail)
  const go = (view, arg) => { document.body.classList.remove('detail-open'); linkHandler && linkHandler(view, arg) }
  if (linkHandler) d.querySelectorAll('a[data-go]').forEach((a) =>
    a.addEventListener('click', () => go(a.dataset.go, a.dataset.arg)))
  wireSrc(d)
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
