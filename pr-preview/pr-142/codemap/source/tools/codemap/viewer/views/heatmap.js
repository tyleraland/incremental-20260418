/* Heatmap lens — the whole file tree, expandable, with a heat cell per metric on
   every row. Intensity ∝ how the file scores (red = wants attention): high size/
   complexity/churn/smells/dead-exports, or LOW coverage/maintainability. Folders
   aggregate to their worst descendant so hotspots bubble up when collapsed. Click
   a file to browse its source + dependencies in the detail panel. */
import * as lib from '../lib.js'

// col: bad='high' → red as value rises; bad='low' → red as value falls (toward 0/–).
const COLS = [
  { key: 'size', label: 'Size', bad: 'high', fmt: (v) => lib.fmtBytes(v) },
  { key: 'loc', label: 'LOC', bad: 'high' },
  { key: 'maxCc', label: 'CC', bad: 'high' },
  { key: 'mi', label: 'MI', bad: 'low', max: 100 },
  { key: 'coverage', label: 'Line%', bad: 'low', max: 100 },
  { key: 'branchCov', label: 'Br%', bad: 'low', max: 100 },
  { key: 'churn', label: 'Churn', bad: 'high' },
  { key: 'smells', label: 'Smell', bad: 'high' },
  { key: 'deadExports', label: 'Dead', bad: 'high' },
]
const state = { expanded: null, sort: 'tree' }
let ctx, colMax

export default {
  id: 'heatmap', label: 'Heatmap', kind: 'html', needs: ['filesystem', 'modules'],
  mount(c) {
    ctx = c
    if (!state.expanded) { // default: expand the top two levels so it opens as a tree
      state.expanded = new Set()
      const seed = (n, d) => { if (n.children) { if (d < 2) state.expanded.add(n.path); n.children.forEach((k) => seed(k, d + 1)) } }
      seed(c.data.filesystem.tree, 0)
    }
    // per-column max across leaves, for normalization
    colMax = {}
    const scan = (n) => { if (n.children) n.children.forEach(scan); else for (const col of COLS) if (!col.max) { const v = n[col.key]; if (v != null) colMax[col.key] = Math.max(colMax[col.key] || 0, v) } }
    scan(c.data.filesystem.tree)
    render()
  },
}

// aggregate a metric over a subtree: worst descendant (max for high-bad, min for low-bad)
function agg(node, col) {
  if (!node.children) return node[col.key]
  let best = null
  for (const c of node.children) {
    const v = agg(c, col)
    if (v == null) continue
    best = best == null ? v : (col.bad === 'low' ? Math.min(best, v) : Math.max(best, v))
  }
  return best
}

function intensity(val, col) {
  if (val == null) return 0
  const max = col.max || colMax[col.key] || 1
  const t = col.bad === 'low' ? 1 - val / max : val / max
  return Math.max(0, Math.min(1, t))
}
function cell(val, col) {
  if (val == null || (col.bad === 'high' && val === 0)) return `<td class="hc"><span class="muted">–</span></td>`
  const a = (0.06 + 0.8 * intensity(val, col)).toFixed(3)
  const shown = col.fmt ? col.fmt(val) : val
  return `<td class="hc" style="background:rgba(248,81,73,${a})">${shown}</td>`
}

function render() {
  const fs = ctx.data.filesystem
  ctx.sidebar.innerHTML =
    '<div class="group-title">Heatmap</div>' +
    '<p class="muted" style="font-size:12px">Every file, colored by each metric — red wants attention (high size/complexity/churn/smells/dead, or low coverage/MI). Folders show their worst descendant. Click a file to browse it.</p>' +
    '<div class="group-title">Sort siblings by</div>' +
    `<select id="hm-sort" class="hm-select">` +
    `<option value="tree"${state.sort === 'tree' ? ' selected' : ''}>Name (tree)</option>` +
    COLS.map((c) => `<option value="${c.key}"${state.sort === c.key ? ' selected' : ''}>${c.label}</option>`).join('') +
    `</select>` +
    '<div style="margin-top:10px;display:flex;gap:6px">' +
    '<button id="hm-exp" class="hm-btn">Expand all</button><button id="hm-col" class="hm-btn">Collapse</button></div>'
  lib.el('hm-sort').addEventListener('change', (e) => { state.sort = e.target.value; render() })
  lib.el('hm-exp').addEventListener('click', () => { const all = new Set(); const w = (n) => { if (n.children) { all.add(n.path); n.children.forEach(w) } }; w(fs.tree); state.expanded = all; render() })
  lib.el('hm-col').addEventListener('click', () => { state.expanded = new Set(['']); render() })

  const rows = []
  const sortChildren = (children) => {
    if (state.sort === 'tree') return children
    const col = COLS.find((c) => c.key === state.sort)
    return [...children].sort((a, b) => {
      const av = agg(a, col), bv = agg(b, col)
      if (av == null) return 1; if (bv == null) return -1
      return col.bad === 'low' ? av - bv : bv - av
    })
  }
  const walk = (node, depth) => {
    const isDir = !!node.children
    const open = state.expanded.has(node.path)
    const pad = 6 + depth * 13
    const name = isDir
      ? `<span class="hm-caret">${open ? '▾' : '▸'}</span><span class="hm-dir">${node.name}/</span>`
      : `<span class="hm-file" data-src="${node.path}">${node.name}</span>`
    rows.push(
      `<tr class="hm-row${isDir ? ' dir' : ''}" data-path="${node.path}" data-dir="${isDir}">` +
      `<td class="hm-name" style="padding-left:${pad}px">${name}</td>` +
      COLS.map((c) => cell(isDir ? agg(node, c) : node[c.key], c)).join('') +
      `</tr>`)
    if (isDir && open) for (const c of sortChildren(node.children)) walk(c, depth + 1)
  }
  for (const c of sortChildren(fs.tree.children)) walk(c, 0)

  ctx.root.innerHTML =
    `<table class="heatmap"><thead><tr><th class="hm-name">${lib.fmtNum(fs.stats.files)} files</th>` +
    COLS.map((c) => `<th class="hc">${c.label}</th>`).join('') + `</tr></thead><tbody>` +
    rows.join('') + `</tbody></table>`

  ctx.root.querySelectorAll('tr.hm-row').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('[data-src]')) { lib.openSource(e.target.closest('[data-src]').dataset.src); return }
    if (tr.dataset.dir === 'true') { const p = tr.dataset.path; state.expanded.has(p) ? state.expanded.delete(p) : state.expanded.add(p); render() }
    else fileDetail(tr.dataset.path)
  }))
}

function fileDetail(path) {
  const G = ctx.data.modules
  const n = new Map(G.nodes.map((x) => [x.id, x])).get(path)
  const fs = ctx.data.filesystem
  const findLeaf = (node) => node.path === path ? node : (node.children || []).reduce((r, c) => r || findLeaf(c), null)
  const leaf = findLeaf(fs.tree) || {}
  const importers = G.edges.filter((e) => e.target === path).map((e) => e.source)
  const imports = G.edges.filter((e) => e.source === path).map((e) => e.target)
  const mlink = (m) => lib.goLink('modules', m, lib.short(m))
  const row = (k, v) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`
  const html =
    `<h2>${leaf.name || path.split('/').pop()}</h2><div class="sub muted">${path}</div>` +
    `<p>${lib.srcLink(path, null, '⟨⟩ view source')}${n ? ' · ' + lib.goLink('modules', path, 'in Modules graph') : ''}</p>` +
    '<table class="kv">' +
    row('Size', lib.fmtBytes(leaf.size)) + row('Lines', lib.fmtNum(leaf.loc)) +
    row('Max cyclomatic', leaf.maxCc ?? '–') + row('Maintainability', leaf.mi ?? '–') +
    row('Line coverage', leaf.coverage != null ? leaf.coverage + '%' : '–') +
    row('Branch coverage', leaf.branchCov != null ? leaf.branchCov + '%' : '–') +
    row('Git commits', lib.fmtNum(leaf.churn)) + row('Smells', leaf.smells || 0) +
    row('Dead exports', leaf.deadExports || 0) + '</table>' +
    (n ? lib.sec(`Imports (${imports.length})`, imports.length ? imports.map(mlink) : ['<span class="muted">—</span>']) +
      lib.sec(`Imported by (${importers.length})`, importers.length ? importers.map(mlink) : ['<span class="muted">—</span>']) : '')
  lib.setDetail(html, ctx.go)
}
