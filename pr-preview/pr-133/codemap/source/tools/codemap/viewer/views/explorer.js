/* Explorer lens — a repo file browser. Sidebar surfaces every doc (README /
   CLAUDE.md / AGENTS.md / *.md, wherever they hide) plus the full tree; the panel
   reads the selected file (markdown rendered, code line-numbered) with its git
   history ("versions": when it changed and why). Content is fetched from the
   mirrored source/, markdown rendered by the vendored marked. */
import * as lib from '../lib.js'

const state = { path: null, expanded: null, showHistory: false }
let ctx, leaves

const isDoc = (p) => /\.md$/i.test(p) || /(^|\/)(README|CLAUDE|AGENTS|CHANGELOG|LICENSE)/i.test(p)

export default {
  id: 'explorer', label: 'Explorer', kind: 'html', needs: ['filesystem', 'git', 'modules'],
  mount(c) {
    ctx = c
    leaves = []
    const collect = (n) => { if (n.children) n.children.forEach(collect); else leaves.push(n) }
    collect(c.data.filesystem.tree)
    if (!state.expanded) {
      state.expanded = new Set()
      const seed = (n, d) => { if (n.children) { if (d < 1) state.expanded.add(n.path); n.children.forEach((k) => seed(k, d + 1)) } }
      seed(c.data.filesystem.tree, 0)
    }
    if (!state.path) { // open the root README, else any doc
      const readme = leaves.find((l) => l.path === 'README.md') || leaves.find((l) => /(^|\/)README\.md$/i.test(l.path)) || leaves.find((l) => isDoc(l.path))
      state.path = readme?.path || null
    }
    renderSidebar()
    renderContent()
  },
}

function renderSidebar() {
  const docs = leaves.filter((l) => isDoc(l.path)).sort((a, b) => a.path.localeCompare(b.path))
  const s = ctx.sidebar
  s.innerHTML =
    `<div class="group-title">Docs <span class="muted">(${docs.length})</span></div>` +
    '<div class="ex-docs">' + docs.map((d) =>
      `<a class="ex-doc${d.path === state.path ? ' on' : ''}" data-open="${d.path}">${lib.short(d.path)}</a>`).join('') + '</div>' +
    '<div class="group-title">Tree</div><div id="ex-tree"></div>'
  renderTree()
  s.querySelectorAll('a[data-open]').forEach((a) => a.addEventListener('click', () => { state.path = a.dataset.open; state.showHistory = false; renderSidebar(); renderContent() }))
}

function renderTree() {
  const host = lib.el('ex-tree')
  const rows = []
  const walk = (node, depth) => {
    const isDir = !!node.children
    const open = state.expanded.has(node.path)
    const pad = 4 + depth * 12
    if (isDir) {
      rows.push(`<div class="ex-row dir" data-dir="${node.path}" style="padding-left:${pad}px"><span class="hm-caret">${open ? '▾' : '▸'}</span>${node.name}/</div>`)
      if (open) for (const c of node.children) walk(c, depth + 1)
    } else {
      rows.push(`<div class="ex-row file${node.path === state.path ? ' on' : ''}" data-open="${node.path}" style="padding-left:${pad + 12}px">${node.name}</div>`)
    }
  }
  for (const c of ctx.data.filesystem.tree.children) walk(c, 0)
  host.innerHTML = rows.join('')
  host.querySelectorAll('.ex-row.dir').forEach((r) => r.addEventListener('click', () => { const p = r.dataset.dir; state.expanded.has(p) ? state.expanded.delete(p) : state.expanded.add(p); renderTree() }))
  host.querySelectorAll('.ex-row.file').forEach((r) => r.addEventListener('click', () => { state.path = r.dataset.open; state.showHistory = false; renderSidebar(); renderContent() }))
}

async function renderContent() {
  const panel = ctx.root
  if (!state.path) { panel.innerHTML = '<div class="muted" style="padding:20px">Pick a file.</div>'; return }
  const path = state.path
  const hist = ctx.data.git.files?.[path]?.history || []
  panel.innerHTML =
    `<div class="ex-head"><span class="mono ex-path">${lib.short(path)}</span>` +
    `<a class="ex-act" data-raw="1">raw ⟨⟩</a>` +
    (hist.length ? `<a class="ex-act" data-hist="1">history (${hist.length})</a>` : '') +
    `</div>` +
    (state.showHistory ? historyHtml(hist) : '') +
    `<div class="ex-content"><div class="muted" style="padding:16px">loading…</div></div>`
  panel.querySelector('[data-raw]').addEventListener('click', () => lib.openSource(path))
  const h = panel.querySelector('[data-hist]'); if (h) h.addEventListener('click', () => { state.showHistory = !state.showHistory; renderContent() })

  let text
  try { text = await lib.loadSource(path) }
  catch { panel.querySelector('.ex-content').innerHTML = '<div class="muted" style="padding:16px">Content unavailable (binary or over the size cap).</div>'; return }
  const body = panel.querySelector('.ex-content')
  if (/\.md$/i.test(path) && window.marked) {
    body.className = 'ex-content md-body'
    body.innerHTML = window.marked.parse(text, { mangle: false, headerIds: false })
  } else {
    body.className = 'ex-content'
    const lines = text.split('\n')
    body.innerHTML = '<table class="src-code"><tbody>' +
      lines.map((l, i) => `<tr><td class="ln">${i + 1}</td><td class="lc">${esc(l) || ' '}</td></tr>`).join('') + '</tbody></table>'
  }
}

function historyHtml(hist) {
  return '<div class="ex-history"><div class="muted" style="font-size:11px;margin-bottom:4px">Versions — most recent first</div>' +
    hist.map((h) => `<div class="ex-hrow"><span class="mono muted">${h.short}</span><span class="mono muted">${h.date}</span><span>${esc(h.subject)}</span></div>`).join('') + '</div>'
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
