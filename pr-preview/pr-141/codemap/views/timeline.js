/* Timeline lens — when each feature was developed. A swimlane per feature (or
   category), one dot per commit placed by date and colored by category. Data is
   the one-time Haiku classification (commit-tags.json) joined with git dates. */
import * as lib from '../lib.js'

const CAT_COLORS = {
  feature: '#3fb950', fix: '#f85149', refactor: '#58a6ff', perf: '#bc8cff',
  docs: '#8b949e', test: '#39c5cf', chore: '#6e7681', infra: '#d29922', unclassified: '#3d444d',
}
const catColor = (c) => CAT_COLORS[c] || '#484f58'
const state = { lane: 'feature' }
let ctx

export default {
  id: 'timeline', label: 'Timeline', kind: 'html', needs: ['timeline'],
  mount(c) {
    ctx = c
    const T = c.data.timeline
    if (!T.available) {
      c.sidebar.innerHTML = '<div class="group-title">Timeline</div><p class="muted">No classifications.</p>'
      c.root.innerHTML = `<div class="stub"><h1>Timeline <span class="muted" style="font-size:14px">— not backfilled</span></h1>` +
        `<p>Needs <span class="mono">tools/codemap/commit-tags.json</span> (a one-time Haiku classification of git history).</p></div>`
      return
    }
    renderSidebar()
    render()
  },
}

function renderSidebar() {
  const T = ctx.data.timeline
  ctx.sidebar.innerHTML =
    '<div class="group-title">Timeline</div>' +
    `<div class="muted" style="font-size:12px;line-height:1.8">${lib.fmtNum(T.stats.commits)} commits · ${T.stats.classified} classified<br>` +
    `${T.stats.features} features<br>${T.stats.first} → ${T.stats.last}</div>` +
    '<div class="group-title">Lanes</div>' +
    ['feature', 'category'].map((v) => `<label><input type="radio" name="ln" value="${v}" ${state.lane === v ? 'checked' : ''}/><span>by ${v}</span></label>`).join('') +
    '<div class="group-title">Category</div>' +
    Object.entries(CAT_COLORS).filter(([k]) => k !== 'unclassified').map(([k, c]) =>
      `<div class="row"><span class="swatch" style="background:${c}"></span>${k}</div>`).join('')
  ctx.sidebar.querySelectorAll('input[name=ln]').forEach((r) => r.addEventListener('change', (e) => { state.lane = e.target.value; render() }))
}

function render() {
  const T = ctx.data.timeline
  const day = (d) => Math.floor(new Date(d + 'T00:00:00').getTime() / 86400000)
  const d0 = day(T.stats.first), d1 = Math.max(day(T.stats.last), d0 + 1)

  // lanes
  let lanes
  if (state.lane === 'feature') lanes = T.features.map((f) => ({ key: f.feature, label: f.feature, count: f.count }))
  else lanes = T.categories.map((c) => ({ key: c.category, label: c.category, count: c.count }))
  const laneIndex = new Map(lanes.map((l, i) => [l.key, i]))
  const keyOf = (c) => state.lane === 'feature' ? c.feature : c.category

  const GUTTER = 150, ROW = 18, PAD_T = 34, PAD_R = 24
  const host = ctx.root
  const W = Math.max(host.clientWidth || 900, GUTTER + 400)
  const plotW = W - GUTTER - PAD_R
  const H = PAD_T + lanes.length * ROW + 16
  const x = (d) => GUTTER + ((day(d) - d0) / (d1 - d0)) * plotW
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'timeline')

  // month gridlines + labels
  const months = T.monthly.map((m) => m.month)
  for (const m of months) {
    const gx = x(m + '-01')
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', gx); line.setAttribute('x2', gx); line.setAttribute('y1', PAD_T - 6); line.setAttribute('y2', H - 8)
    line.setAttribute('class', 'tl-grid'); svg.appendChild(line)
    const lbl = document.createElementNS(ns, 'text')
    lbl.setAttribute('x', gx + 2); lbl.setAttribute('y', 14); lbl.setAttribute('class', 'tl-month'); lbl.textContent = m; svg.appendChild(lbl)
  }

  // lane labels + baselines
  lanes.forEach((l, i) => {
    const y = PAD_T + i * ROW + ROW / 2
    const t = document.createElementNS(ns, 'text')
    t.setAttribute('x', GUTTER - 8); t.setAttribute('y', y + 3); t.setAttribute('class', 'tl-lane'); t.setAttribute('text-anchor', 'end')
    t.textContent = `${l.label} (${l.count})`; svg.appendChild(t)
    const base = document.createElementNS(ns, 'line')
    base.setAttribute('x1', GUTTER); base.setAttribute('x2', W - PAD_R); base.setAttribute('y1', y); base.setAttribute('y2', y)
    base.setAttribute('class', 'tl-base'); svg.appendChild(base)
  })

  // commit dots
  for (const c of T.commits) {
    const li = laneIndex.get(keyOf(c)); if (li == null) continue
    const cy = PAD_T + li * ROW + ROW / 2
    const dot = document.createElementNS(ns, 'circle')
    dot.setAttribute('cx', x(c.date)); dot.setAttribute('cy', cy); dot.setAttribute('r', 3.2)
    dot.setAttribute('fill', catColor(c.category)); dot.setAttribute('class', 'tl-dot')
    const title = document.createElementNS(ns, 'title')
    title.textContent = `${c.date} · ${c.category} · ${c.feature}\n${c.subject}` + (c.tags.length ? `\n[${c.tags.join(', ')}]` : '')
    dot.appendChild(title); svg.appendChild(dot)
  }

  host.innerHTML = ''
  host.appendChild(svg)
}
