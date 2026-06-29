/* Placeholder lenses — reserved slots that show the recipe for adding a lens.
   They render even with no dataset, so the platform's extension points are
   visible and documented in the UI itself. Replace each with a real extractor +
   view when the data is wired (coverage report, complexity metrics, heatmaps). */
import * as lib from '../lib.js'

function stub(id, label, blurb, signal) {
  return {
    id, label, kind: 'html', needs: [],
    mount(c) {
      c.sidebar.innerHTML = `<div class="group-title">${label}</div><p class="muted">Not wired yet — a reserved lens slot.</p>`
      c.root.innerHTML =
        `<div class="stub">` +
        `<h1>${label} <span class="muted" style="font-size:14px">— planned lens</span></h1>` +
        `<p>${blurb}</p>` +
        `<div class="callout"><b>To wire it up</b><ol>` +
        `<li>Add <span class="mono">tools/codemap/extract/${id}.mjs</span> exporting <span class="mono">extract${cap(id)}({ REPO, modules, git })</span> — emit a deterministic dataset. ${signal}</li>` +
        `<li>Register it in <span class="mono">analyze.mjs</span> so it writes <span class="mono">data/${id}.json</span>.</li>` +
        `<li>Fill in this view in <span class="mono">viewer/views/${id}.js</span> (declare <span class="mono">needs: ['${id}']</span>) and render the dataset.</li>` +
        `</ol>Every lens is independent: it reads its own dataset and renders into the stage. The shell, sidebar, and detail panel are shared.</div>` +
        `</div>`
    },
  }
}
const cap = (s) => s[0].toUpperCase() + s.slice(1)

export const coverageView = stub('coverage', 'Coverage',
  'Overlay test-coverage onto the module graph and treemap — color each file by line/branch coverage to spotlight untested hot paths.',
  'Source: parse <span class="mono">coverage/coverage-final.json</span> from <span class="mono">vitest run --coverage</span>.')

export const complexityView = stub('complexity', 'Complexity',
  'Per-function cyclomatic / cognitive complexity and file-level hotspots, cross-referenced with churn to find risky code (complex AND frequently changed).',
  'Source: walk the ts-morph AST (already loaded in the modules extractor) and count decision points per function.')
