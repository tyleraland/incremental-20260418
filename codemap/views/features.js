/* Features lens — directed feature-dependency graph. Node size ∝ owned modules;
   arrow A→B = a module in A imports a module in B (width ∝ count). Dashed border
   = manifest-only (untested) feature. */
import * as lib from '../lib.js'

let cy, ctx, featById

export default {
  id: 'features', label: 'Features', kind: 'graph', needs: ['modules'],
  mount(c) {
    ctx = c
    const G = c.data.modules
    featById = new Map(G.features.map((f) => [f.id, f]))
    c.sidebar.innerHTML = '<div class="group-title">Feature graph</div>' +
      '<p class="muted">Nodes = features (size ∝ owned modules). Arrows = a module in A imports a module in B (width ∝ count). Dashed = no tests. Click a feature for its modules.</p>'

    const maxW = Math.max(1, ...G.featureEdges.map((e) => e.weight))
    const nodes = G.features.map((f) => ({ data: { id: 'F:' + f.id, label: f.name, fid: f.id, layer: f.layerHint || 'root', size: 20 + Math.sqrt(f.moduleCount) * 5, derived: f.derivedFrom } }))
    const edges = G.featureEdges.map((e) => ({ data: { id: 'F:' + e.source + '>' + e.target, source: 'F:' + e.source, target: 'F:' + e.target, w: 0.8 + (e.weight / maxW) * 5 } }))

    cy = lib.mountCy(c.root, [...nodes, ...edges], style(), { name: 'cose', animate: false,
      nodeRepulsion: 32000, idealEdgeLength: 110, nodeOverlap: 28, gravity: 0.35, numIter: 1500, randomize: false })
    c.setCy(cy)
    cy.on('tap', 'node', (ev) => detail(ev.target.data('fid')))
    cy.on('tap', (ev) => { if (ev.target === cy) { cy.elements().removeClass('faded pick nbr lit'); lib.clearDetail() } })
    if (c.arg) detail(c.arg)
  },
}

function style() {
  return [
    { selector: 'node', style: { 'background-color': (n) => lib.layerColor(n.data('layer')), 'width': 'data(size)', 'height': 'data(size)',
      'label': 'data(label)', 'font-size': 9, 'color': '#e6edf3', 'text-valign': 'bottom', 'text-margin-y': 3, 'text-wrap': 'wrap', 'text-max-width': 90, 'text-outline-width': 2, 'text-outline-color': '#0d1117' } },
    { selector: 'node[derived = "manifest"]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': '#8b949e' } },
    { selector: 'edge', style: { 'width': 'data(w)', 'line-color': '#30363d', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#30363d', 'opacity': 0.85 } },
    { selector: '.faded', style: { 'opacity': 0.1 } },
    { selector: '.pick', style: { 'border-width': 3, 'border-color': '#58a6ff' } },
    { selector: '.nbr', style: { 'opacity': 1 } },
    { selector: 'edge.lit', style: { 'line-color': '#58a6ff', 'target-arrow-color': '#58a6ff', 'opacity': 1 } },
  ]
}

function detail(fid) {
  const f = featById.get(fid); if (!f) return
  const G = ctx.data.modules
  const node = cy.getElementById('F:' + fid); if (node.nonempty()) lib.highlightNode(cy, node)
  const deps = G.featureEdges.filter((e) => e.source === fid)
  const usedBy = G.featureEdges.filter((e) => e.target === fid)
  const flink = (id) => lib.goLink('features', id, featById.get(id)?.name || id)
  const html =
    `<h2>${f.name}</h2><div class="sub muted">${f.id} · ${f.moduleCount} modules · derived: ${f.derivedFrom}</div>` +
    `<p>${f.description}</p>` +
    (deps.length ? lib.sec('Depends on', deps.map((e) => `${flink(e.target)} <span class="muted">×${e.weight}</span>`)) : '') +
    (usedBy.length ? lib.sec('Used by', usedBy.map((e) => `${flink(e.source)} <span class="muted">×${e.weight}</span>`)) : '') +
    lib.sec(`Modules (${f.modules.length})`, f.modules.map((m) => lib.goLink('modules', m, lib.short(m)))) +
    (f.tests?.length ? lib.sec(`Specs (${f.tests.length})`, f.tests.map((t) => `<span>${lib.short(t)}</span>`)) : '')
  lib.setDetail(html, ctx.go)
}
