/* Codemap shell — a multi-lens platform. Each view is a self-contained module
   that declares the datasets it needs and renders into the stage. To add a lens:
   write viewer/views/<name>.js exporting the view contract below, an extractor in
   extract/<name>.mjs, and register it in VIEWS here.

   View contract:
     { id, label, kind: 'graph'|'html', needs: ['modules', ...],
       mount(ctx) }   // ctx: { root, sidebar, data, manifest, go(viewId, arg), arg, lib } */

import * as lib from './lib.js'
import modulesView from './views/modules.js'
import featuresView from './views/features.js'
import filesView from './views/files.js'
import gitView from './views/git.js'
import inventoryView from './views/inventory.js'
import complexityView from './views/complexity.js'
import coverageView from './views/coverage.js'
import heatmapView from './views/heatmap.js'

const VIEWS = [modulesView, featuresView, filesView, heatmapView, gitView, complexityView, coverageView, inventoryView]
const byId = new Map(VIEWS.map((v) => [v.id, v]))

const el = lib.el
const fail = (msg) => { const e = el('error'); e.hidden = false; e.textContent = msg }

let manifest = null
let cy = null // active cytoscape instance, destroyed on view switch

async function boot() {
  try { manifest = await fetch('./data/manifest.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }) }
  catch (e) { return fail('Could not load data/manifest.json (' + e.message + '). Run `node analyze.mjs` first.') }

  const d = new Date(manifest.generatedAt)
  el('meta').textContent = `${manifest.repo} @${manifest.gitHash} · ${isNaN(d) ? manifest.generatedAt : d.toLocaleString()}`
  const h = manifest.headline
  el('headline').innerHTML =
    `<span><b>${lib.fmtNum(h.trackedFiles)}</b> files</span>` +
    `<span><b>${lib.fmtNum(h.codeLoc)}</b> LOC</span>` +
    `<span><b>${lib.fmtNum(h.edges)}</b> imports</span>` +
    `<span><b>${lib.fmtNum(h.commits)}</b> commits</span>` +
    (h.coverage != null ? `<span><b>${h.coverage}%</b> cov</span>` : '') +
    `<span class="${h.over10 ? 'warn' : ''}"><b>${h.over10}</b> CC&gt;10</span>` +
    `<span class="${h.deadModules ? 'warn' : ''}"><b>${h.deadModules}</b> dead</span>` +
    `<span class="${h.cycles ? 'warn' : ''}"><b>${h.cycles}</b> cycles</span>`

  el('views').innerHTML = ''
  for (const v of VIEWS) {
    const b = document.createElement('button')
    b.textContent = v.label; b.dataset.view = v.id
    b.addEventListener('click', () => go(v.id))
    el('views').appendChild(b)
  }
  // mobile drawers: ☰ toggles the controls sidebar; the scrim closes both
  el('menu').addEventListener('click', () => document.body.classList.toggle('sidebar-open'))
  el('scrim').addEventListener('click', () => document.body.classList.remove('sidebar-open', 'detail-open'))
  go(location.hash.replace('#', '') && byId.has(location.hash.replace('#', '')) ? location.hash.replace('#', '') : 'modules')
}

async function go(viewId, arg) {
  const view = byId.get(viewId)
  if (!view) return
  location.hash = viewId
  document.body.classList.remove('sidebar-open', 'detail-open') // close mobile drawers on view change
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('active', b.dataset.view === viewId))

  // reset stage
  if (cy) { cy.destroy(); cy = null }
  el('sidebar').innerHTML = ''
  el('cy').innerHTML = ''; el('panel').innerHTML = ''
  const graph = view.kind === 'graph'
  el('cy').hidden = !graph; el('panel').hidden = graph
  el('hint').textContent = graph ? 'drag to pan · scroll to zoom · click a node' : ''
  lib.clearDetail()

  // load datasets, then mount
  let data
  try { data = Object.fromEntries(await Promise.all((view.needs || []).map(async (id) => [id, await lib.loadData(id)]))) }
  catch (e) { return fail('Dataset load failed: ' + e.message) }

  const ctx = {
    root: graph ? el('cy') : el('panel'),
    sidebar: el('sidebar'),
    data, manifest, arg, lib, go,
    setCy: (instance) => { cy = instance },
  }
  try { view.mount(ctx) } catch (e) { fail('View "' + viewId + '" failed: ' + e.message); throw e }
}

boot()
