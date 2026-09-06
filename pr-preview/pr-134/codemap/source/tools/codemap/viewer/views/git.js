/* Git lens — history & churn. Calendar heatmap of daily commits, author
   breakdown, most-churned files, and recent commits. */
import * as lib from '../lib.js'

let ctx, moduleIds

export default {
  id: 'git', label: 'Git', kind: 'html', needs: ['git', 'modules'],
  mount(c) {
    ctx = c
    moduleIds = new Set(c.data.modules.nodes.map((n) => n.id))
    const g = c.data.git
    c.sidebar.innerHTML = '<div class="group-title">History</div>' +
      (g.available
        ? `<div class="muted" style="font-size:12px;line-height:1.7">` +
          `${lib.fmtNum(g.stats.commits)} commits<br>${lib.fmtNum(g.stats.authors)} author(s)<br>` +
          `${g.stats.firstDate} → ${g.stats.lastDate}<br>${lib.fmtNum(g.stats.activeDays)} active days<br>` +
          `<span style="color:#3fb950">+${lib.fmtNum(g.stats.insertions)}</span> / <span style="color:#f85149">−${lib.fmtNum(g.stats.deletions)}</span></div>`
        : '<p class="muted">No git history available (shallow clone with no log).</p>') +
      '<p class="muted" style="margin-top:14px;font-size:11px">In CI the deploy checks out full history (fetch-depth 0), so the hosted view is richer than a shallow local clone.</p>'

    if (!g.available) { c.root.innerHTML = '<p class="muted" style="padding:24px">No commits to show.</p>'; return }

    c.root.innerHTML =
      `<h3>Commit activity</h3><div id="cal"></div>` +
      `<div class="cols">` +
        `<div><h3>Authors</h3>${authorTable(g)}</div>` +
        `<div><h3>Most-churned files</h3>${churnTable(g)}</div>` +
      `</div>` +
      `<h3>Recent commits</h3>${commitList(g)}`
    renderCalendar(g)
    wire()
  },
}

function authorTable(g) {
  return '<table><thead><tr><th>author</th><th class="num">commits</th><th class="num">+/−</th></tr></thead><tbody>' +
    g.authors.slice(0, 20).map((a) => `<tr><td>${esc(a.name)}</td><td class="num">${lib.fmtNum(a.commits)}</td>` +
      `<td class="num"><span style="color:#3fb950">+${lib.fmtNum(a.ins)}</span> <span style="color:#f85149">−${lib.fmtNum(a.del)}</span></td></tr>`).join('') +
    '</tbody></table>'
}

function churnTable(g) {
  const files = Object.entries(g.files).map(([path, f]) => ({ path, ...f }))
    .sort((a, b) => b.commits - a.commits).slice(0, 20)
  return '<table><thead><tr><th>file</th><th class="num">commits</th><th class="num">+/−</th></tr></thead><tbody>' +
    files.map((f) => `<tr><td>${moduleIds.has(f.path) ? lib.goLink('modules', f.path, lib.short(f.path)) : `<span class="mono">${lib.short(f.path)}</span>`}</td>` +
      `<td class="num">${f.commits}</td><td class="num"><span style="color:#3fb950">+${lib.fmtNum(f.ins)}</span> <span style="color:#f85149">−${lib.fmtNum(f.del)}</span></td></tr>`).join('') +
    '</tbody></table>'
}

function commitList(g) {
  return '<table class="commits"><tbody>' + g.commits.slice(0, 40).map((c) =>
    `<tr><td class="mono muted">${c.short}</td><td class="mono muted">${c.date}</td>` +
    `<td>${esc(c.subject)}</td><td class="num muted">${c.files}f</td>` +
    `<td class="num"><span style="color:#3fb950">+${c.ins}</span> <span style="color:#f85149">−${c.del}</span></td></tr>`).join('') +
    '</tbody></table>'
}

function renderCalendar(g) {
  const host = lib.el('cal')
  const counts = new Map(g.daily.map((d) => [d.date, d.commits]))
  const max = Math.max(1, ...g.daily.map((d) => d.commits))
  const first = new Date(g.stats.firstDate + 'T00:00:00')
  const last = new Date(g.stats.lastDate + 'T00:00:00')
  // align start to the Sunday on/before the first commit
  const start = new Date(first); start.setDate(start.getDate() - start.getDay())
  const CELL = 13, GAP = 3
  const days = Math.round((last - start) / 86400000) + 1
  const weeks = Math.ceil((days + 1) / 7)
  const ns = 'http://www.w3.org/2000/svg'
  const W = weeks * (CELL + GAP) + 30, H = 7 * (CELL + GAP) + 20
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'calendar')
  for (let i = 0; i < days; i++) {
    const dt = new Date(start); dt.setDate(start.getDate() + i)
    const iso = dt.toISOString().slice(0, 10)
    if (dt < first && counts.get(iso) == null) { /* still draw empty pre-roll */ }
    const col = Math.floor(i / 7), row = dt.getDay()
    const c = counts.get(iso) || 0
    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('x', 28 + col * (CELL + GAP)); rect.setAttribute('y', 12 + row * (CELL + GAP))
    rect.setAttribute('width', CELL); rect.setAttribute('height', CELL); rect.setAttribute('rx', 2)
    rect.setAttribute('fill', c === 0 ? '#161b22' : lib.heat(0.25 + 0.75 * (c / max)))
    const title = document.createElementNS(ns, 'title'); title.textContent = `${iso}: ${c} commit(s)`
    rect.appendChild(title); svg.appendChild(rect)
  }
  ;['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].forEach((lbl, r) => {
    if (!lbl) return
    const t = document.createElementNS(ns, 'text'); t.setAttribute('x', 0); t.setAttribute('y', 22 + r * (CELL + GAP)); t.setAttribute('class', 'cal-label'); t.textContent = lbl; svg.appendChild(t)
  })
  host.appendChild(svg)
}

function wire() { ctx.root.querySelectorAll('a[data-go]').forEach((a) => a.addEventListener('click', () => ctx.go(a.dataset.go, a.dataset.arg))) }
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
