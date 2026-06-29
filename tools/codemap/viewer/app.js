/* Codemap viewer — deterministic, no build step. Loads graph.json (emitted by
   analyze.mjs) and renders three views over it. All analysis is done at build
   time; this file is pure presentation. */

const LAYER_COLORS = {
  engine: '#f0883e', data: '#3fb950', lib: '#58a6ff', components: '#bc8cff',
  pages: '#db61a2', stores: '#e3b341', save: '#39c5cf', proto: '#ff7b72',
  render: '#a5d6ff', dev: '#7d8590', root: '#6e7681', __tests__: '#484f58',
}
const layerColor = (l) => LAYER_COLORS[l] || '#6e7681'
const short = (id) => id.replace(/^src\//, '')
const el = (id) => document.getElementById(id)
const fail = (msg) => { const e = el('error'); e.hidden = false; e.textContent = msg }

let G = null            // the graph
let cy = null           // cytoscape instance
let view = 'modules'    // current view
let nodeById = new Map()
let featById = new Map()

fetch('./graph.json')
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
  .then(boot)
  .catch((e) => fail('Could not load graph.json (' + e.message + '). Run `node analyze.mjs` first.'))

function boot(graph) {
  G = graph
  nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  featById = new Map(graph.features.map((f) => [f.id, f]))

  const d = new Date(graph.generatedAt)
  el('meta').textContent = `@${graph.gitHash} · ${isNaN(d) ? graph.generatedAt : d.toLocaleString()}`
  const s = graph.stats
  el('stats').innerHTML =
    `<span><b>${s.codeFiles}</b> files</span>` +
    `<span><b>${s.codeLoc.toLocaleString()}</b> LOC</span>` +
    `<span><b>${s.edges}</b> imports</span>` +
    `<span><b>${s.features}</b> features</span>` +
    `<span class="${s.deadModules ? 'warn' : ''}"><b>${s.deadModules}</b> dead</span>` +
    `<span class="${s.cycles ? 'warn' : ''}"><b>${s.cycles}</b> cycles</span>`

  document.querySelectorAll('#views button').forEach((b) =>
    b.addEventListener('click', () => switchView(b.dataset.view)))
  el('search').addEventListener('input', (e) => applySearch(e.target.value.trim().toLowerCase()))

  switchView('modules')
}

function switchView(v) {
  view = v
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('active', b.dataset.view === v))
  el('search').style.display = v === 'inventory' ? 'none' : ''
  el('cyhint').style.display = v === 'inventory' ? 'none' : ''
  el('inventory').hidden = v !== 'inventory'
  el('cy').style.display = v === 'inventory' ? 'none' : ''
  clearDetail()
  if (v === 'modules') renderModules()
  else if (v === 'features') renderFeatures()
  else renderInventory()
}

/* ── Modules view ─────────────────────────────────────────────────────────── */
let showTests = false
const layerEnabled = {}

function renderModules() {
  const layersPresent = [...new Set(G.nodes.filter((n) => showTests || !n.test).map((n) => n.layer))]
  layersPresent.forEach((l) => { if (!(l in layerEnabled)) layerEnabled[l] = l !== '__tests__' })

  buildSidebarModules(layersPresent)
  buildLegendModules(layersPresent)

  const nodes = G.nodes
    .filter((n) => (showTests || !n.test) && layerEnabled[n.layer])
    .map((n) => ({ data: {
      id: n.id, label: short(n.id), layer: n.layer, loc: n.loc,
      dead: !!n.dead, hub: !!n.hub, test: !!n.test,
      size: 16 + Math.sqrt(n.loc) * 1.7,
    }}))
  const present = new Set(nodes.map((n) => n.data.id))
  const edges = G.edges
    .filter((e) => present.has(e.source) && present.has(e.target))
    .map((e) => ({ data: { id: e.source + '>' + e.target, source: e.source, target: e.target } }))

  mountCy([...nodes, ...edges], moduleStyle(), { name: 'cose', animate: false,
    nodeRepulsion: 9000, idealEdgeLength: 70, gravity: 0.3, numIter: 1200, randomize: false })
  cy.on('tap', 'node', (ev) => showModuleDetail(ev.target.id()))
}

function moduleStyle() {
  return [
    { selector: 'node', style: {
      'background-color': (n) => layerColor(n.data('layer')),
      'width': 'data(size)', 'height': 'data(size)',
      'label': 'data(label)', 'font-size': 7, 'color': '#c9d1d9',
      'text-valign': 'bottom', 'text-margin-y': 2, 'min-zoomed-font-size': 7,
      'border-width': 0,
    }},
    { selector: 'node[?hub]', style: { 'shape': 'diamond', 'border-width': 2, 'border-color': '#d29922' } },
    { selector: 'node[?dead]', style: { 'shape': 'round-rectangle', 'border-width': 2,
      'border-color': '#f85149', 'background-color': '#f85149', 'background-opacity': 0.25 } },
    { selector: 'edge', style: {
      'width': 0.6, 'line-color': '#30363d', 'curve-style': 'straight',
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#30363d', 'arrow-scale': 0.5,
    }},
    { selector: '.faded', style: { 'opacity': 0.08 } },
    { selector: '.pick', style: { 'border-width': 3, 'border-color': '#58a6ff', 'opacity': 1 } },
    { selector: '.nbr', style: { 'opacity': 1 } },
    { selector: 'edge.lit', style: { 'line-color': '#58a6ff', 'target-arrow-color': '#58a6ff', 'width': 1.4, 'opacity': 1 } },
  ]
}

function buildSidebarModules(layers) {
  const c = el('controls')
  c.innerHTML = '<div class="group-title">Layers</div>'
  layers.sort().forEach((l) => {
    const lab = document.createElement('label')
    lab.innerHTML = `<input type="checkbox" ${layerEnabled[l] ? 'checked' : ''}/>` +
      `<span class="swatch" style="background:${layerColor(l)}"></span>${l}`
    lab.querySelector('input').addEventListener('change', (e) => { layerEnabled[l] = e.target.checked; renderModules() })
    c.appendChild(lab)
  })
  const t = document.createElement('label')
  t.style.marginTop = '10px'
  t.innerHTML = `<input type="checkbox" ${showTests ? 'checked' : ''}/><span>show test files</span>`
  t.querySelector('input').addEventListener('change', (e) => { showTests = e.target.checked; renderModules() })
  c.appendChild(t)
}

function buildLegendModules(layers) {
  el('legend').innerHTML = '<div class="group-title">Shapes</div>' +
    '<div class="row"><span class="swatch" style="background:#d29922;transform:rotate(45deg)"></span>hub (high fan-in)</div>' +
    '<div class="row"><span class="swatch" style="background:#f85149"></span>dead (no importer)</div>' +
    '<div class="row muted" style="margin-top:6px">size ∝ √LOC · arrow = imports</div>'
}

/* ── Features view ────────────────────────────────────────────────────────── */
function renderFeatures() {
  el('controls').innerHTML = '<div class="group-title">Feature graph</div>' +
    '<p class="muted">Nodes = features (size ∝ owned modules). Arrows = a module in A imports a module in B (width ∝ count). Click a feature for its modules.</p>'
  el('legend').innerHTML = ''

  const maxW = Math.max(1, ...G.featureEdges.map((e) => e.weight))
  const nodes = G.features.map((f) => ({ data: {
    id: 'F:' + f.id, label: f.name, fid: f.id, layer: f.layerHint || 'root',
    size: 20 + Math.sqrt(f.moduleCount) * 5, derived: f.derivedFrom,
  }}))
  const edges = G.featureEdges.map((e) => ({ data: {
    id: 'F:' + e.source + '>' + e.target, source: 'F:' + e.source, target: 'F:' + e.target,
    w: 0.8 + (e.weight / maxW) * 5,
  }}))

  mountCy([...nodes, ...edges], [
    { selector: 'node', style: {
      'background-color': (n) => layerColor(n.data('layer')),
      'width': 'data(size)', 'height': 'data(size)', 'label': 'data(label)',
      'font-size': 9, 'color': '#e6edf3', 'text-valign': 'bottom', 'text-margin-y': 3,
      'text-wrap': 'wrap', 'text-max-width': 90, 'text-outline-width': 2, 'text-outline-color': '#0d1117',
    }},
    { selector: 'node[derived = "manifest"]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': '#8b949e' } },
    { selector: 'edge', style: {
      'width': 'data(w)', 'line-color': '#30363d', 'curve-style': 'bezier',
      'target-arrow-shape': 'triangle', 'target-arrow-color': '#30363d', 'opacity': 0.85,
    }},
    { selector: '.faded', style: { 'opacity': 0.1 } },
    { selector: '.pick', style: { 'border-width': 3, 'border-color': '#58a6ff' } },
    { selector: 'edge.lit', style: { 'line-color': '#58a6ff', 'target-arrow-color': '#58a6ff', 'opacity': 1 } },
  ], { name: 'cose', animate: false, nodeRepulsion: 32000, idealEdgeLength: 110,
    nodeOverlap: 28, gravity: 0.35, numIter: 1500, randomize: false })

  cy.on('tap', 'node', (ev) => showFeatureDetail(ev.target.data('fid')))
}

/* ── shared cytoscape mount + highlight ───────────────────────────────────── */
function mountCy(elements, style, layout) {
  if (cy) cy.destroy()
  cy = cytoscape({ container: el('cy'), elements, style, layout,
    wheelSensitivity: 0.25, minZoom: 0.1, maxZoom: 3 })
  window.__cy = cy  // debug/test handle
  cy.on('tap', (ev) => { if (ev.target === cy) { cy.elements().removeClass('faded pick nbr lit'); clearDetail() } })
}

function highlight(node) {
  cy.elements().addClass('faded').removeClass('pick nbr lit')
  node.removeClass('faded').addClass('pick')
  node.connectedEdges().removeClass('faded').addClass('lit')
  node.connectedEdges().connectedNodes().removeClass('faded').addClass('nbr')
}

function applySearch(q) {
  if (!cy || view === 'inventory') return
  if (!q) { cy.nodes().removeClass('faded'); return }
  cy.nodes().forEach((n) => n.toggleClass('faded', !n.id().toLowerCase().includes(q)))
}

/* ── detail panel ─────────────────────────────────────────────────────────── */
function clearDetail() { el('detail').innerHTML = '<div class="detail-empty muted">Select a node for details.</div>' }
function link(id) { return `<a data-mod="${id}">${short(id)}</a>` }
function wireLinks(root) {
  root.querySelectorAll('a[data-mod]').forEach((a) =>
    a.addEventListener('click', () => focusModule(a.dataset.mod)))
  root.querySelectorAll('a[data-feat]').forEach((a) =>
    a.addEventListener('click', () => { switchView('features'); showFeatureDetail(a.dataset.feat) }))
}

function showModuleDetail(id) {
  const n = nodeById.get(id)
  if (!n) return
  if (cy) { const node = cy.getElementById(id); if (node.nonempty()) highlight(node) }
  const importers = G.edges.filter((e) => e.target === id).map((e) => e.source)
  const imports = G.edges.filter((e) => e.source === id).map((e) => e.target)
  const tags = []
  if (n.dead) tags.push('<span class="tag dead">dead</span>')
  if (n.hub) tags.push('<span class="tag hub">hub</span>')
  if (n.test) tags.push('<span class="tag">test</span>')
  const regs = (n.registries || []).map((r) => `${r.name} <span class="muted">×${r.count}</span>`)

  const d = el('detail')
  d.innerHTML =
    `<h2>${short(id)}</h2>` +
    `<div class="sub muted">${n.layer} · ${n.loc} LOC · ${n.exportCount} exports</div>` +
    tags.join(' ') +
    (n.features?.length ? sec('Features', n.features.map((f) =>
      `<a data-feat="${f}">${featById.get(f)?.name || f}</a>`)) : '') +
    (regs.length ? sec('Content registries', regs) : '') +
    sec(`Imports (${imports.length})`, imports.map(link)) +
    sec(`Imported by (${importers.length})`, importers.length ? importers.map(link) : ['<span class="muted">— none —</span>']) +
    (n.exportCount ? sec('Exports', n.exports.map((e) => `<span>${e}</span>`)) : '')
  wireLinks(d)
}

function showFeatureDetail(fid) {
  const f = featById.get(fid)
  if (!f) return
  if (cy && view === 'features') { const node = cy.getElementById('F:' + fid); if (node.nonempty()) highlight(node) }
  const deps = G.featureEdges.filter((e) => e.source === fid)
  const usedBy = G.featureEdges.filter((e) => e.target === fid)
  const d = el('detail')
  d.innerHTML =
    `<h2>${f.name}</h2>` +
    `<div class="sub muted">${f.id} · ${f.moduleCount} modules · derived: ${f.derivedFrom}</div>` +
    `<p>${f.description}</p>` +
    (deps.length ? sec('Depends on', deps.map((e) =>
      `<a data-feat="${e.target}">${featById.get(e.target)?.name}</a> <span class="muted">×${e.weight}</span>`)) : '') +
    (usedBy.length ? sec('Used by', usedBy.map((e) =>
      `<a data-feat="${e.source}">${featById.get(e.source)?.name}</a> <span class="muted">×${e.weight}</span>`)) : '') +
    sec(`Modules (${f.modules.length})`, f.modules.map(link)) +
    (f.tests?.length ? sec(`Specs (${f.tests.length})`, f.tests.map((t) => `<span>${short(t)}</span>`)) : '')
  wireLinks(d)
}

function sec(title, items) {
  return `<div class="section">${title}</div><ul>` + items.map((i) => `<li>${i}</li>`).join('') + '</ul>'
}

function focusModule(id) {
  if (view !== 'modules') { showTests = nodeById.get(id)?.test || showTests; switchView('modules') }
  const n = nodeById.get(id)
  if (n && !layerEnabled[n.layer]) { layerEnabled[n.layer] = true; renderModules() }
  const node = cy.getElementById(id)
  if (node.nonempty()) { cy.animate({ center: { eles: node }, zoom: 1.4 }, { duration: 300 }); highlight(node) }
  showModuleDetail(id)
}

/* ── Inventory view ───────────────────────────────────────────────────────── */
function renderInventory() {
  el('controls').innerHTML = ''
  el('legend').innerHTML = ''
  const s = G.stats
  const layers = Object.entries(s.byLayer).sort((a, b) => b[1].loc - a[1].loc)
  const maxLoc = Math.max(...layers.map(([, v]) => v.loc))

  const inv = el('inventory')
  inv.innerHTML =
    `<h1>Codemap inventory</h1>` +
    `<div class="muted mono">@${G.gitHash} · ${s.codeFiles} code files (${s.codeLoc.toLocaleString()} LOC) · ` +
      `${s.testFiles} specs (${(s.loc - s.codeLoc).toLocaleString()} LOC) · ${s.edges} import edges</div>` +

    `<h3>Code by layer</h3><table><tbody>` +
    layers.map(([l, v]) => `<tr>` +
      `<td><span class="swatch" style="background:${layerColor(l)};display:inline-block;margin-right:6px"></span>${l}</td>` +
      `<td class="num">${v.files}f</td><td class="num">${v.loc.toLocaleString()}</td>` +
      `<td><span class="bar" style="width:${Math.round((v.loc / maxLoc) * 240)}px"></span></td></tr>`).join('') +
    `</tbody></table>` +

    `<h3>Content registries <span class="muted">(${s.registryTotals.length})</span></h3><table>` +
    `<thead><tr><th>registry</th><th class="num">entries</th><th>module</th></tr></thead><tbody>` +
    s.registryTotals.map((r) => `<tr><td class="mono">${r.name}</td><td class="num">${r.count}</td>` +
      `<td>${link(r.module)}</td></tr>`).join('') + `</tbody></table>` +

    `<h3>Features <span class="muted">(${G.features.length})</span></h3><table>` +
    `<thead><tr><th>feature</th><th class="num">modules</th><th class="num">specs</th><th>derived</th></tr></thead><tbody>` +
    G.features.map((f) => `<tr><td><a data-feat="${f.id}">${f.name}</a></td>` +
      `<td class="num">${f.moduleCount}</td><td class="num">${f.tests.length}</td>` +
      `<td class="mono muted">${f.derivedFrom}</td></tr>`).join('') + `</tbody></table>` +

    `<h3>Dead modules <span class="muted">(${G.deadModules.length})</span></h3>` +
    (G.deadModules.length
      ? `<table><tbody>` + G.deadModules.map((m) => `<tr><td>${link(m)}</td>` +
          `<td class="num muted">${nodeById.get(m)?.loc} LOC</td></tr>`).join('') + `</tbody></table>`
      : `<p class="muted">none — every module has an importer.</p>`) +

    `<h3>Import cycles <span class="muted">(${G.cycles.length})</span></h3>` +
    (G.cycles.length
      ? G.cycles.map((c) => `<div class="callout mono">${c.map(short).join(' → ')} → ${short(c[0])}</div>`).join('')
      : `<p class="muted">none.</p>`) +

    `<h3>Unowned modules <span class="muted">(${G.unownedModules.length})</span></h3>` +
    `<p class="muted">Code attributed to no feature — cross-cutting hubs or coverage gaps.</p>` +
    `<table><tbody>` + G.unownedModules.map((m) => `<tr><td>${link(m)}</td>` +
      `<td class="num muted">${nodeById.get(m)?.hub ? 'hub' : ''}</td></tr>`).join('') + `</tbody></table>`

  wireLinks(inv)
}
