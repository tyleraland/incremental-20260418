/* Files lens — squarified treemap of the tracked file tree. Area ∝ bytes; color
   by importance (fan-in + churn + size), file type, or churn. Click a directory
   to drill in; click a file for details. */
import * as lib from '../lib.js'

const state = { path: '', colorBy: 'importance' }
let ctx, moduleIds

export default {
  id: 'files', label: 'Files', kind: 'html', needs: ['filesystem', 'modules'],
  mount(c) {
    ctx = c
    moduleIds = new Set(c.data.modules.nodes.map((n) => n.id))
    state.path = ''
    render()
  },
}

function findNode(node, path) {
  if (node.path === path) return node
  if (!node.children) return null
  for (const ch of node.children) { const r = findNode(ch, path); if (r) return r }
  return null
}

function render() {
  const fs = ctx.data.filesystem
  const root = findNode(fs.tree, state.path) || fs.tree
  buildSidebar(fs)

  // breadcrumb
  const parts = state.path ? state.path.split('/') : []
  const crumbs = [`<a data-crumb="">${fs.tree.name}</a>`]
  parts.forEach((p, i) => crumbs.push(`<a data-crumb="${parts.slice(0, i + 1).join('/')}">${p}</a>`))
  const panel = ctx.root
  panel.innerHTML =
    `<div class="breadcrumb">${crumbs.join(' <span class="muted">/</span> ')} ` +
    `<span class="muted">— ${root.children?.length || 0} entries · ${lib.fmtBytes(root.size)} · ${lib.fmtNum(root.loc)} LOC</span></div>` +
    `<div id="tm"></div>`
  panel.querySelectorAll('a[data-crumb]').forEach((a) => a.addEventListener('click', () => { state.path = a.dataset.crumb; render() }))

  const host = lib.el('tm')
  const w = host.clientWidth || panel.clientWidth - 4
  const h = (host.clientHeight && host.clientHeight > 40) ? host.clientHeight : panel.clientHeight - 48

  // recursively lay out the whole subtree (classic nested treemap)
  const cells = []
  layoutTree(root, 0, 0, w, h, 0, cells)

  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('class', 'treemap')
  for (const c of cells) { // dirs before leaves (traversal order) → children paint inside parents
    const n = c.node, isDir = !!n.children
    const g = document.createElementNS(ns, 'g')
    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('x', c.x + 0.5); rect.setAttribute('y', c.y + 0.5)
    rect.setAttribute('width', Math.max(0, c.w - 1)); rect.setAttribute('height', Math.max(0, c.h - 1))
    rect.setAttribute('rx', 2); rect.setAttribute('fill', colorOf(n, isDir)); rect.setAttribute('class', 'cell' + (isDir ? ' dir' : ''))
    g.appendChild(rect)
    const labelOk = isDir ? (c.header && c.w > 40) : (c.w > 38 && c.h > 14)
    if (labelOk) {
      const t = document.createElementNS(ns, 'text')
      t.setAttribute('x', c.x + 4); t.setAttribute('y', c.y + (isDir ? 11 : 13))
      t.setAttribute('class', 'cell-label' + (isDir ? ' dir-label' : ''))
      t.textContent = isDir ? n.name + '/' : n.name
      g.appendChild(t)
    }
    const title = document.createElementNS(ns, 'title')
    title.textContent = `${n.path || n.name}\n${lib.fmtBytes(n.size)} · ${lib.fmtNum(n.loc)} LOC` + (isDir ? ` · ${n.children.length} entries` : ` · churn ×${n.churn} · fan-in ${n.fanIn}`)
    g.appendChild(title)
    g.addEventListener('click', (ev) => { ev.stopPropagation(); isDir ? (state.path = n.path, render()) : fileDetail(n) })
    svg.appendChild(g)
  }
  host.appendChild(svg)
}

// Recursively squarify: each directory gets a header strip (for its label) and an
// inset content area its children are laid into. Leaves are terminal rects.
function layoutTree(node, x, y, w, h, depth, cells) {
  const isDir = !!node.children
  const header = isDir && depth > 0 && w > 40 && h > 26 ? 13 : 0
  cells.push({ node, x, y, w, h, header })
  if (!isDir || !node.children.length) return
  const pad = depth > 0 ? 2 : 0
  const ix = x + pad, iy = y + pad + header, iw = w - 2 * pad, ih = h - 2 * pad - header
  if (iw <= 1 || ih <= 1) return
  const items = node.children.filter((c) => c.size > 0).map((c) => ({ node: c, value: c.size }))
  for (const r of squarify(items, ix, iy, iw, ih)) layoutTree(r.node, r.x, r.y, r.w, r.h, depth + 1, cells)
}

function colorOf(n, isDir) {
  if (isDir) return '#161b22'
  if (state.colorBy === 'type') return lib.extColor(n.ext)
  if (state.colorBy === 'churn') return lib.heat(Math.min(1, n.churn / 10))
  if (state.colorBy === 'complexity') return n.maxCc == null ? '#20262e' : lib.heat(Math.min(1, n.maxCc / 25))
  if (state.colorBy === 'coverage') return n.coverage == null ? '#20262e' : lib.heat(1 - n.coverage / 100)
  return lib.heat(n.importance) // importance
}

function buildSidebar(fs) {
  const s = ctx.sidebar
  const modes = [['importance', 'Importance (fan-in+churn+size)'], ['type', 'File type'], ['churn', 'Git churn'], ['complexity', 'Complexity (max CC)'], ['coverage', 'Coverage (red = low)']]
  s.innerHTML = '<div class="group-title">Color by</div>' +
    modes.map(([v, label]) => `<label><input type="radio" name="cb" value="${v}" ${state.colorBy === v ? 'checked' : ''}/><span>${label}</span></label>`).join('')
  s.querySelectorAll('input[name=cb]').forEach((r) => r.addEventListener('change', (e) => { state.colorBy = e.target.value; render() }))
  s.insertAdjacentHTML('beforeend',
    `<div class="group-title">Repo</div><div class="muted" style="font-size:12px">${lib.fmtNum(fs.stats.files)} tracked files · ${lib.fmtBytes(fs.stats.bytes)} · ${lib.fmtNum(fs.stats.loc)} LOC</div>` +
    '<div class="group-title">Most important</div>' +
    '<ol class="ranklist">' + fs.top.slice(0, 12).map((l) => `<li><a data-top="${l.path}">${lib.short(l.path)}</a></li>`).join('') + '</ol>')
  s.querySelectorAll('a[data-top]').forEach((a) => a.addEventListener('click', () => {
    const node = findNode(fs.tree, a.dataset.top); if (node) fileDetail(node)
  }))
}

function fileDetail(n) {
  const isModule = moduleIds.has(n.path)
  const rows = [
    ['Size', lib.fmtBytes(n.size)], ['Lines', lib.fmtNum(n.loc)], ['Type', n.ext],
    ['Fan-in (importers)', lib.fmtNum(n.fanIn)], ['Git commits', lib.fmtNum(n.churn)],
    ['Max cyclomatic', n.maxCc != null ? String(n.maxCc) : '–'],
    ['Maintainability', n.mi != null ? String(n.mi) : '–'],
    ['Coverage', n.coverage != null ? n.coverage + '%' : '–'],
    ['Last changed', n.lastDate || '–'], ['Importance', n.importance != null ? n.importance.toFixed(3) : '–'],
  ]
  const html =
    `<h2>${n.name}</h2><div class="sub muted">${n.path}</div>` +
    `<p>${lib.srcLink(n.path, null, '⟨⟩ view source')}${isModule ? ' · ' + lib.goLink('modules', n.path, 'open in Modules graph') : ''}</p>` +
    '<table class="kv">' + rows.map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('') + '</table>'
  lib.setDetail(html, ctx.go)
}

/* squarified treemap (Bruls, Huizing, van Wijk) */
function squarify(items, x, y, w, h) {
  const out = []
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total <= 0 || w <= 0 || h <= 0) return out
  const scale = (w * h) / total
  const nodes = items.map((i) => ({ item: i, area: i.value * scale })).filter((n) => n.area > 0).sort((a, b) => b.area - a.area)
  const rect = { x, y, w, h }
  let row = []
  const worst = (r, len) => {
    const sum = r.reduce((s, n) => s + n.area, 0)
    const mx = Math.max(...r.map((n) => n.area)), mn = Math.min(...r.map((n) => n.area))
    return Math.max((len * len * mx) / (sum * sum), (sum * sum) / (len * len * mn))
  }
  const flush = () => {
    const sum = row.reduce((s, n) => s + n.area, 0)
    if (rect.w >= rect.h) {
      const thick = sum / rect.h; let yy = rect.y
      for (const n of row) { const hh = n.area / thick; out.push({ node: n.item.node, x: rect.x, y: yy, w: thick, h: hh }); yy += hh }
      rect.x += thick; rect.w -= thick
    } else {
      const thick = sum / rect.w; let xx = rect.x
      for (const n of row) { const ww = n.area / thick; out.push({ node: n.item.node, x: xx, y: rect.y, w: ww, h: thick }); xx += ww }
      rect.y += thick; rect.h -= thick
    }
    row = []
  }
  for (const n of nodes) {
    const len = Math.min(rect.w, rect.h)
    if (row.length === 0 || worst([...row, n], len) <= worst(row, len)) row.push(n)
    else { flush(); row.push(n) }
  }
  if (row.length) flush()
  return out
}
