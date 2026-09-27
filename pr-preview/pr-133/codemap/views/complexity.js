/* Complexity lens — per-function metrics + the cross-lens payoff: risk hotspots
   (complexity × churn) and, when coverage is present, complex-and-untested files.
   All deterministic from the AST; churn/coverage merged from the other lenses. */
import * as lib from '../lib.js'

const state = { metric: 'cyclomatic' }
const METRICS = [['cyclomatic', 'Cyclomatic'], ['cognitive', 'Cognitive'], ['depth', 'Max nesting'], ['loc', 'Lines']]
let ctx, moduleIds

export default {
  id: 'complexity', label: 'Complexity', kind: 'html', needs: ['complexity', 'git', 'coverage', 'modules'],
  mount(c) {
    ctx = c
    moduleIds = new Set(c.data.modules.nodes.map((n) => n.id))
    render()
  },
}

function render() {
  const CX = ctx.data.complexity, GIT = ctx.data.git, COV = ctx.data.coverage
  const s = CX.stats
  ctx.sidebar.innerHTML =
    '<div class="group-title">Complexity</div>' +
    `<div class="muted" style="font-size:12px;line-height:1.8">${lib.fmtNum(s.functions)} functions<br>` +
    `<b style="color:var(--hub)">${s.over10}</b> with CC&gt;10 · <b style="color:var(--dead)">${s.over20}</b> &gt;20<br>` +
    `median maintainability ${s.medianMi}</div>` +
    '<div class="group-title">Rank functions by</div>' +
    METRICS.map(([v, l]) => `<label><input type="radio" name="mx" value="${v}" ${state.metric === v ? 'checked' : ''}/><span>${l}</span></label>`).join('') +
    '<p class="muted" style="font-size:11px;margin-top:12px">Each function is measured on its own body (nested functions counted separately). Cognitive is SonarSource-style (approximate).</p>'
  ctx.sidebar.querySelectorAll('input[name=mx]').forEach((r) => r.addEventListener('change', (e) => { state.metric = e.target.value; render() }))

  // Risk = complexity × churn, per file (the "refactor-me" ranking)
  const churnOf = (p) => GIT.files?.[p]?.commits || 0
  const risk = Object.entries(CX.byFile)
    .map(([path, v]) => ({ path, maxCc: v.maxCyclomatic, mi: v.mi, churn: churnOf(path), cov: COV.files?.[path]?.statements ?? null, score: v.maxCyclomatic * churnOf(path) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 20)

  const fileCell = (p) => moduleIds.has(p) ? lib.goLink('modules', p, lib.short(p)) : `<span class="mono">${lib.short(p)}</span>`
  const covCell = (v) => v == null ? '<span class="muted">–</span>' : `<span style="color:${lib.heat(1 - v / 100)}">${v}%</span>`

  const fns = CX.functions.slice().sort((a, b) => b[state.metric] - a[state.metric]).slice(0, 30)

  ctx.root.innerHTML =
    `<h3>Risk hotspots <span class="muted">— complexity × churn</span></h3>` +
    `<p class="muted">Files that are both convoluted and change often. The top of this list is where refactors pay off most.</p>` +
    `<table><thead><tr><th>file</th><th class="num">max CC</th><th class="num">commits</th><th class="num">risk</th><th class="num">cov</th><th class="num">MI</th></tr></thead><tbody>` +
    risk.map((r) => `<tr><td>${fileCell(r.path)}</td><td class="num">${r.maxCc}</td><td class="num">${r.churn}</td>` +
      `<td class="num"><b>${r.score}</b></td><td class="num">${covCell(r.cov)}</td><td class="num" style="color:${lib.heat(1 - r.mi / 100)}">${r.mi}</td></tr>`).join('') +
    `</tbody></table>` +

    `<h3>Most complex functions <span class="muted">— by ${METRICS.find((m) => m[0] === state.metric)[1].toLowerCase()}</span></h3>` +
    `<table><thead><tr><th>function</th><th>file</th><th class="num">CC</th><th class="num">cog</th><th class="num">depth</th><th class="num">loc</th></tr></thead><tbody>` +
    fns.map((f) => `<tr><td class="mono">${esc(f.name)}</td><td>${lib.srcLink(f.file, f.line, lib.short(f.file) + ':' + f.line)}</td>` +
      `<td class="num" style="color:${f.cyclomatic > 20 ? 'var(--dead)' : f.cyclomatic > 10 ? 'var(--hub)' : 'inherit'}">${f.cyclomatic}</td>` +
      `<td class="num">${f.cognitive}</td><td class="num">${f.depth}</td><td class="num">${f.loc}</td></tr>`).join('') +
    `</tbody></table>`

  ctx.root.querySelectorAll('a[data-go]').forEach((a) => a.addEventListener('click', () => ctx.go(a.dataset.go, a.dataset.arg)))
  lib.wireSrc(ctx.root)
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
