/* Inventory lens — the textual report: code-by-layer, content registries,
   features, dead code, import cycles, unowned modules, files by type. */
import * as lib from '../lib.js'

export default {
  id: 'inventory', label: 'Inventory', kind: 'html', needs: ['modules', 'filesystem', 'smells'],
  mount(c) {
    const G = c.data.modules, FS = c.data.filesystem, SM = c.data.smells
    const s = G.stats
    c.sidebar.innerHTML = '<div class="group-title">Report</div><p class="muted">A static snapshot: structure, content, features, and the gaps worth acting on.</p>'

    const layers = Object.entries(s.byLayer).sort((a, b) => b[1].loc - a[1].loc)
    const maxLoc = Math.max(...layers.map(([, v]) => v.loc))
    const exts = Object.entries(FS.stats.byExt).sort((a, b) => b[1].size - a[1].size).slice(0, 12)
    const maxExt = Math.max(...exts.map(([, v]) => v.size))

    c.root.innerHTML =
      `<h1>Codemap inventory</h1>` +
      `<div class="muted mono">@${G.gitHash} · ${s.codeFiles} code files (${lib.fmtNum(s.codeLoc)} LOC) · ${s.testFiles} specs · ${s.edges} import edges · ${lib.fmtNum(FS.stats.files)} tracked files (${lib.fmtBytes(FS.stats.bytes)})</div>` +

      `<h3>Code by layer</h3><table><tbody>` +
      layers.map(([l, v]) => `<tr><td><span class="swatch" style="background:${lib.layerColor(l)};display:inline-block;margin-right:6px"></span>${l}</td>` +
        `<td class="num">${v.files}f</td><td class="num">${lib.fmtNum(v.loc)}</td><td><span class="bar" style="width:${Math.round(v.loc / maxLoc * 240)}px"></span></td></tr>`).join('') +
      `</tbody></table>` +

      `<h3>Files by type <span class="muted">(${Object.keys(FS.stats.byExt).length})</span></h3><table><tbody>` +
      exts.map(([e, v]) => `<tr><td><span class="swatch" style="background:${lib.extColor(e)};display:inline-block;margin-right:6px"></span>${e}</td>` +
        `<td class="num">${v.files}f</td><td class="num">${lib.fmtBytes(v.size)}</td><td><span class="bar" style="width:${Math.round(v.size / maxExt * 240)}px"></span></td></tr>`).join('') +
      `</tbody></table>` +

      `<h3>Content registries <span class="muted">(${s.registryTotals.length})</span></h3><table>` +
      `<thead><tr><th>registry</th><th class="num">entries</th><th>module</th></tr></thead><tbody>` +
      s.registryTotals.map((r) => `<tr><td class="mono">${r.name}</td><td class="num">${r.count}</td><td>${lib.goLink('modules', r.module, lib.short(r.module))}</td></tr>`).join('') +
      `</tbody></table>` +

      `<h3>Features <span class="muted">(${G.features.length})</span></h3><table>` +
      `<thead><tr><th>feature</th><th class="num">modules</th><th class="num">specs</th><th>derived</th></tr></thead><tbody>` +
      G.features.map((f) => `<tr><td>${lib.goLink('features', f.id, f.name)}</td><td class="num">${f.moduleCount}</td><td class="num">${f.tests.length}</td><td class="mono muted">${f.derivedFrom}</td></tr>`).join('') +
      `</tbody></table>` +

      `<h3>Dead modules <span class="muted">(${G.deadModules.length})</span></h3>` +
      (G.deadModules.length
        ? `<table><tbody>` + G.deadModules.map((m) => `<tr><td>${lib.goLink('modules', m, lib.short(m))}</td></tr>`).join('') + `</tbody></table>`
        : `<p class="muted">none — every module has an importer.</p>`) +

      `<h3>Dead exports <span class="muted">(${G.stats.deadExports}, best-effort)</span></h3>` +
      `<p class="muted">Exported names no other module imports — unused, or only used internally so the <span class="mono">export</span> is superfluous. Barrels/entries exempt; test usage counts.</p>` +
      (G.deadExports.length
        ? `<table><thead><tr><th>module</th><th class="num">count</th><th>names</th></tr></thead><tbody>` +
          G.deadExports.slice(0, 25).map((d) => `<tr><td>${lib.goLink('modules', d.id, lib.short(d.id))}</td>` +
            `<td class="num">${d.names.length}</td><td class="mono muted" style="font-size:11px">${d.names.slice(0, 8).join(', ')}${d.names.length > 8 ? ' …' : ''}</td></tr>`).join('') + `</tbody></table>`
        : `<p class="muted">none.</p>`) +

      `<h3>Bug smells <span class="muted">(${SM.stats.total} in ${SM.stats.files} files)</span></h3>` +
      `<p class="muted">Heuristic text scan: ${Object.entries(SM.stats.byKind).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}. Approximate — a hint to eyeball.</p>` +
      (SM.top.length
        ? `<table><thead><tr><th>file</th><th class="num">smells</th><th>kinds</th></tr></thead><tbody>` +
          SM.top.slice(0, 15).map((f) => `<tr><td>${lib.goLink('modules', f.path, lib.short(f.path))}</td><td class="num">${f.total}</td>` +
            `<td class="mono muted" style="font-size:11px">${Object.keys(f).filter((k) => k !== 'path' && k !== 'total').join(', ')}</td></tr>`).join('') + `</tbody></table>`
        : `<p class="muted">none.</p>`) +

      `<h3>Import cycles <span class="muted">(${G.cycles.length})</span></h3>` +
      (G.cycles.length ? G.cycles.map((cy) => `<div class="callout mono">${cy.map(lib.short).join(' → ')} → ${lib.short(cy[0])}</div>`).join('') : `<p class="muted">none.</p>`) +

      `<h3>Unowned modules <span class="muted">(${G.unownedModules.length})</span></h3>` +
      `<p class="muted">Code attributed to no feature — cross-cutting hubs or coverage gaps.</p>` +
      `<table><tbody>` + G.unownedModules.map((m) => `<tr><td>${lib.goLink('modules', m, lib.short(m))}</td></tr>`).join('') + `</tbody></table>`

    c.root.querySelectorAll('a[data-go]').forEach((a) => a.addEventListener('click', () => c.go(a.dataset.go, a.dataset.arg)))
  },
}
