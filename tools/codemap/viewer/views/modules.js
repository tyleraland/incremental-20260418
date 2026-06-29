/* Modules lens — the import graph. Nodes colored by layer, sized by √LOC,
   diamond hubs, red dead-code; arrows are imports. */
import * as lib from '../lib.js'

const state = { showTests: false, layerEnabled: {}, query: '' }
let cy, ctx, nodeById

export default {
  id: 'modules', label: 'Modules', kind: 'graph', needs: ['modules'],
  mount(c) {
    ctx = c
    nodeById = new Map(c.data.modules.nodes.map((n) => [n.id, n]))
    render()
    if (c.arg) focus(c.arg)
  },
}

function render() {
  const G = ctx.data.modules
  const layers = [...new Set(G.nodes.filter((n) => state.showTests || !n.test).map((n) => n.layer))].sort()
  layers.forEach((l) => { if (!(l in state.layerEnabled)) state.layerEnabled[l] = l !== '__tests__' })
  buildSidebar(layers)

  const nodes = G.nodes
    .filter((n) => (state.showTests || !n.test) && state.layerEnabled[n.layer])
    .map((n) => ({ data: { id: n.id, label: lib.short(n.id), layer: n.layer, dead: !!n.dead, hub: !!n.hub, size: 16 + Math.sqrt(n.loc) * 1.7 } }))
  const present = new Set(nodes.map((n) => n.data.id))
  const edges = G.edges.filter((e) => present.has(e.source) && present.has(e.target))
    .map((e) => ({ data: { id: e.source + '>' + e.target, source: e.source, target: e.target } }))

  cy = lib.mountCy(ctx.root, [...nodes, ...edges], style(), { name: 'cose', animate: false,
    nodeRepulsion: 9000, idealEdgeLength: 70, gravity: 0.3, numIter: 1200, randomize: false })
  ctx.setCy(cy)
  cy.on('tap', 'node', (ev) => detail(ev.target.id()))
  cy.on('tap', (ev) => { if (ev.target === cy) { cy.elements().removeClass('faded pick nbr lit'); lib.clearDetail() } })
  if (state.query) applySearch()
}

function style() {
  return [
    { selector: 'node', style: { 'background-color': (n) => lib.layerColor(n.data('layer')), 'width': 'data(size)', 'height': 'data(size)',
      'label': 'data(label)', 'font-size': 7, 'color': '#c9d1d9', 'text-valign': 'bottom', 'text-margin-y': 2, 'min-zoomed-font-size': 7 } },
    { selector: 'node[?hub]', style: { 'shape': 'diamond', 'border-width': 2, 'border-color': '#d29922' } },
    { selector: 'node[?dead]', style: { 'shape': 'round-rectangle', 'border-width': 2, 'border-color': '#f85149', 'background-color': '#f85149', 'background-opacity': 0.25 } },
    { selector: 'edge', style: { 'width': 0.6, 'line-color': '#30363d', 'curve-style': 'straight', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#30363d', 'arrow-scale': 0.5 } },
    { selector: '.faded', style: { 'opacity': 0.08 } },
    { selector: '.pick', style: { 'border-width': 3, 'border-color': '#58a6ff', 'opacity': 1 } },
    { selector: '.nbr', style: { 'opacity': 1 } },
    { selector: 'edge.lit', style: { 'line-color': '#58a6ff', 'target-arrow-color': '#58a6ff', 'width': 1.4, 'opacity': 1 } },
  ]
}

function buildSidebar(layers) {
  const s = ctx.sidebar
  s.innerHTML = '<input id="m-search" type="search" placeholder="filter by path…" autocomplete="off" />' +
    '<div class="group-title">Layers</div>'
  layers.forEach((l) => {
    const lab = document.createElement('label')
    lab.innerHTML = `<input type="checkbox" ${state.layerEnabled[l] ? 'checked' : ''}/><span class="swatch" style="background:${lib.layerColor(l)}"></span>${l}`
    lab.querySelector('input').addEventListener('change', (e) => { state.layerEnabled[l] = e.target.checked; render() })
    s.appendChild(lab)
  })
  const t = document.createElement('label'); t.style.marginTop = '10px'
  t.innerHTML = `<input type="checkbox" ${state.showTests ? 'checked' : ''}/><span>show test files</span>`
  t.querySelector('input').addEventListener('change', (e) => { state.showTests = e.target.checked; render() })
  s.appendChild(t)
  s.insertAdjacentHTML('beforeend',
    '<div class="group-title">Legend</div>' +
    '<div class="row"><span class="swatch" style="background:#d29922;transform:rotate(45deg)"></span>hub (high fan-in)</div>' +
    '<div class="row"><span class="swatch" style="background:#f85149"></span>dead (no importer)</div>' +
    '<div class="row muted" style="margin-top:6px">size ∝ √LOC · arrow = imports</div>')
  const inp = lib.el('m-search')
  inp.value = state.query
  inp.addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); applySearch() })
}

function applySearch() {
  if (!state.query) { cy.nodes().removeClass('faded'); return }
  cy.nodes().forEach((n) => n.toggleClass('faded', !n.id().toLowerCase().includes(state.query)))
}

function detail(id) {
  const n = nodeById.get(id)
  if (!n) return
  const node = cy.getElementById(id); if (node.nonempty()) lib.highlightNode(cy, node)
  const G = ctx.data.modules
  const importers = G.edges.filter((e) => e.target === id).map((e) => e.source)
  const imports = G.edges.filter((e) => e.source === id).map((e) => e.target)
  const tags = [n.dead && '<span class="tag dead">dead</span>', n.hub && '<span class="tag hub">hub</span>', n.test && '<span class="tag">test</span>'].filter(Boolean)
  const mlink = (m) => lib.goLink('modules', m, lib.short(m))
  const html =
    `<h2>${lib.short(id)}</h2><div class="sub muted">${n.layer} · ${n.loc} LOC · ${n.exportCount} exports</div>` +
    tags.join(' ') +
    (n.features?.length ? lib.sec('Features', n.features.map((f) => lib.goLink('features', f, f))) : '') +
    (n.registries?.length ? lib.sec('Content registries', n.registries.map((r) => `${r.name} <span class="muted">×${r.count}</span>`)) : '') +
    lib.sec(`Imports (${imports.length})`, imports.length ? imports.map(mlink) : ['<span class="muted">— none —</span>']) +
    lib.sec(`Imported by (${importers.length})`, importers.length ? importers.map(mlink) : ['<span class="muted">— none —</span>']) +
    (n.exportCount ? lib.sec('Exports', n.exports.map((e) => `<span>${e}</span>`)) : '')
  lib.setDetail(html, ctx.go)
}

function focus(id) {
  const n = nodeById.get(id)
  if (n && !state.layerEnabled[n.layer]) { state.layerEnabled[n.layer] = true; render() }
  if (n?.test && !state.showTests) { state.showTests = true; render() }
  const node = cy.getElementById(id)
  if (node.nonempty()) { cy.animate({ center: { eles: node }, zoom: 1.4 }, { duration: 300 }); lib.highlightNode(cy, node) }
  detail(id)
}
