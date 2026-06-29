// Modules lens — the import/feature graph of the TypeScript project.
//
//   1. STRUCTURE  - every module, its layer/role, LOC, exports, import edges.
//                   Dead modules + import cycles fall out for free.
//   2. CONTENT    - *_REGISTRY object literals counted as data (code vs content).
//   3. FEATURES   - hybrid: name-correspondence ownership + authored features.json.
//
// Why name-correspondence and not import closure? The engine is tested as a black
// box (every engine spec imports only the `@/engine` barrel), so a closure spans
// the whole engine and can't say which feature a module belongs to. The project's
// own convention - `engine/barriers.test.ts` tests `engine/barriers.ts` - is the
// honest, discriminating signal. Feature->feature edges are real imports between
// owned modules (directed).
//
// Pure: same source in -> same dataset out.

import { Project, SyntaxKind } from 'ts-morph'
import { readFileSync } from 'node:fs'
import { relative, join } from 'node:path'

const LAYERS = ['engine', 'data', 'lib', 'components', 'pages', 'stores', 'save', 'proto', 'render', 'dev', '__tests__']

export function extractModules({ REPO, HERE }) {
  const rel = (p) => relative(REPO, p).split('\\').join('/')
  const layerOf = (path) => {
    const parts = path.split('/')
    if (parts.length < 3) return 'root'
    return LAYERS.includes(parts[1]) ? parts[1] : 'root'
  }
  const isTest = (path) => path.includes('__tests__') || /\.(test|spec)\.[tj]sx?$/.test(path)
  const ENTRYISH = (path) =>
    /^src\/(main\.tsx|App\.tsx|vite-env\.d\.ts|test-setup\.ts)$/.test(path) || path.endsWith('.d.ts')

  const project = new Project({ tsConfigFilePath: join(REPO, 'tsconfig.json'), skipAddingFilesFromTsConfig: false })
  const files = project.getSourceFiles().filter((f) => rel(f.getFilePath()).startsWith('src/'))

  // 1. Nodes
  const nodes = new Map()
  for (const f of files) {
    const path = rel(f.getFilePath())
    const exports = [...f.getExportedDeclarations().keys()].sort()
    nodes.set(path, {
      id: path, label: path.replace(/^src\//, ''), layer: layerOf(path), test: isTest(path),
      loc: f.getEndLineNumber(), exports, exportCount: exports.length,
      inbound: 0, inboundTest: 0, outbound: 0, registries: [], features: [],
    })
  }

  // 2. Edges (static + dynamic import()/re-export, via the @/ alias)
  const edges = []
  const seenEdge = new Set()
  const addEdge = (from, to) => {
    if (from === to) return
    const key = from + ' ' + to
    if (seenEdge.has(key)) return
    seenEdge.add(key); edges.push({ source: from, target: to })
  }
  for (const f of files) {
    const from = rel(f.getFilePath())
    for (const target of f.getReferencedSourceFiles()) {
      const to = rel(target.getFilePath())
      if (nodes.has(to)) addEdge(from, to)
    }
  }
  for (const e of edges) {
    const src = nodes.get(e.source), dst = nodes.get(e.target)
    src.outbound++
    if (src.test) dst.inboundTest++; else dst.inbound++
  }
  const adj = new Map([...nodes.keys()].map((k) => [k, []]))
  for (const e of edges) adj.get(e.source).push(e.target)

  // 3. Content registries
  for (const f of files) {
    const path = rel(f.getFilePath())
    if (nodes.get(path).test) continue
    for (const v of f.getVariableDeclarations()) {
      const name = v.getName()
      if (!/_REGISTRY$|_REGISTRIES$|_KITS$/.test(name)) continue
      const init = v.getInitializer()
      if (!init) continue
      let count = 0
      if (init.getKind() === SyntaxKind.ObjectLiteralExpression) count = init.getProperties().length
      else if (init.getKind() === SyntaxKind.ArrayLiteralExpression) count = init.getElements().length
      else continue
      nodes.get(path).registries.push({ name, count })
    }
  }

  // 4. Dead modules
  const deadModules = []
  for (const n of nodes.values()) {
    if (n.test || ENTRYISH(n.id)) continue
    if (n.inbound === 0) deadModules.push(n.id)
  }
  deadModules.sort()
  for (const id of deadModules) nodes.get(id).dead = true

  // 5. Import cycles (Tarjan SCC over non-test modules)
  const cycles = (() => {
    const ids = [...nodes.keys()].filter((k) => !nodes.get(k).test)
    const idx = new Map(), low = new Map(), onStack = new Set(), stack = []
    let counter = 0
    const out = []
    const strong = (v) => {
      idx.set(v, counter); low.set(v, counter); counter++
      stack.push(v); onStack.add(v)
      for (const w of adj.get(v)) {
        if (nodes.get(w).test) continue
        if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))) }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)))
      }
      if (low.get(v) === idx.get(v)) {
        const comp = []; let w
        do { w = stack.pop(); onStack.delete(w); comp.push(w) } while (w !== v)
        if (comp.length > 1) out.push(comp.sort())
      }
    }
    for (const v of ids) if (!idx.has(v)) strong(v)
    return out.sort((a, b) => a[0].localeCompare(b[0]))
  })()

  // 6. Features
  const manifest = JSON.parse(readFileSync(join(HERE, 'features.json'), 'utf8'))
  const globToRe = (g) => {
    const escaped = g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    const body = escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').split(' ').join('.*')
    return new RegExp('^' + body + '$')
  }
  const baseName = (p) => p.split('/').pop().replace(/\.(test|spec)\.[tj]sx?$/, '').replace(/\.[tj]sx?$/, '')
  const srcByBase = new Map()
  for (const n of nodes.values()) {
    if (n.test) continue
    const b = baseName(n.id)
    if (!srcByBase.has(b)) srcByBase.set(b, [])
    srcByBase.get(b).push(n.id)
  }
  const testFiles = [...nodes.keys()].filter((k) => nodes.get(k).test && /\.(test|spec)\.[tj]sx?$/.test(k))
  const claimed = new Set()
  const features = []
  const CORRESPONDS = /__tests__\/(engine|lib)\//
  for (const def of manifest.features) {
    const testRes = (def.tests || []).map(globToRe)
    const matchedTests = testFiles.filter((t) => !claimed.has(t) && testRes.some((re) => re.test(t)))
    matchedTests.forEach((t) => claimed.add(t))
    const owned = new Set()
    for (const t of matchedTests) if (CORRESPONDS.test(t)) for (const m of srcByBase.get(baseName(t)) || []) owned.add(m)
    for (const entry of def.entries || []) {
      if (nodes.has(entry)) { owned.add(entry); continue }
      if (entry.includes('*')) {
        const re = globToRe(entry)
        for (const id of nodes.keys()) if (!nodes.get(id).test && re.test(id)) owned.add(id)
      }
    }
    features.push({
      id: def.id, name: def.name, description: def.description, layerHint: def.layer || null,
      derivedFrom: matchedTests.length ? (def.entries && def.entries.length ? 'test-name+manifest' : 'test-name') : 'manifest',
      tests: matchedTests.sort(), modules: [...owned].filter((m) => !nodes.get(m).test).sort(),
    })
  }
  const leftovers = testFiles.filter((t) => !claimed.has(t))
  const byDir = new Map()
  for (const t of leftovers) {
    const dir = t.split('/').slice(0, 3).join('/')
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push(t)
  }
  for (const [dir, tests] of [...byDir.entries()].sort()) {
    const area = dir.split('/')[2] || 'misc'
    const owned = new Set()
    for (const t of tests) if (CORRESPONDS.test(t)) for (const m of srcByBase.get(baseName(t)) || []) owned.add(m)
    features.push({
      id: `unmapped-${area}`, name: `Unmapped: ${area}`,
      description: `${tests.length} spec(s) under ${dir} not yet assigned to a named feature.`,
      layerHint: area, derivedFrom: 'inferred', tests: tests.sort(),
      modules: [...owned].filter((m) => !nodes.get(m).test).sort(),
    })
  }
  for (const feat of features) feat.moduleCount = feat.modules.length
  for (const feat of features) for (const m of feat.modules) if (nodes.get(m)) nodes.get(m).features.push(feat.id)

  const HUB_AT = 8
  for (const n of nodes.values()) n.hub = !n.test && n.inbound >= HUB_AT

  const unownedModules = [...nodes.values()]
    .filter((n) => !n.test && !n.dead && !ENTRYISH(n.id) && n.features.length === 0)
    .map((n) => n.id).sort()

  const ownerOf = (id) => (nodes.get(id) ? nodes.get(id).features : [])
  const feMap = new Map()
  for (const e of edges) {
    for (const a of ownerOf(e.source)) for (const b of ownerOf(e.target)) {
      if (a === b) continue
      const k = a + ' ' + b
      feMap.set(k, (feMap.get(k) || 0) + 1)
    }
  }
  const featureEdges = [...feMap.entries()]
    .map(([k, weight]) => ({ source: k.split(' ')[0], target: k.split(' ')[1], weight }))
    .sort((x, y) => y.weight - x.weight || (x.source + x.target).localeCompare(y.source + y.target))

  // 7. Stats
  const codeNodes = [...nodes.values()].filter((n) => !n.test)
  const byLayer = {}
  for (const n of nodes.values()) {
    byLayer[n.layer] = byLayer[n.layer] || { files: 0, loc: 0 }
    byLayer[n.layer].files++; byLayer[n.layer].loc += n.loc
  }
  const registryTotals = []
  for (const n of nodes.values()) for (const r of n.registries) registryTotals.push({ ...r, module: n.id })
  registryTotals.sort((a, b) => b.count - a.count)

  return {
    stats: {
      files: nodes.size, codeFiles: codeNodes.length, testFiles: nodes.size - codeNodes.length,
      loc: [...nodes.values()].reduce((s, n) => s + n.loc, 0), codeLoc: codeNodes.reduce((s, n) => s + n.loc, 0),
      edges: edges.length, deadModules: deadModules.length, cycles: cycles.length,
      features: features.length, unownedModules: unownedModules.length, byLayer, registryTotals,
    },
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target)),
    features: features.sort((a, b) => b.modules.length - a.modules.length),
    featureEdges, unownedModules, deadModules, cycles,
  }
}
