// Filesystem lens — the tracked file tree with size, LOC, and a blended
// "importance" score. File list comes from `git ls-files` (so ignored paths,
// node_modules, and dist are excluded deterministically).
//
// importance = normalized blend of module fan-in (how many modules import it),
// git churn (how often it changes), and size. It is a heuristic knob for the
// treemap's color, not a hard metric — views can also color by any raw signal.

import { execSync } from 'node:child_process'
import { statSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.html',
  '.md', '.yml', '.yaml', '.txt', '.svg', '.sh', '.cfg', '.toml', '.xml',
])
const norm = (v, max) => (max > 0 ? v / max : 0)

export function extractFilesystem({ REPO, modules, git, complexity, coverage, smells }) {
  let list = []
  try {
    list = execSync('git ls-files', { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
      .toString().split('\n').map((s) => s.trim()).filter(Boolean)
  } catch { /* leave empty */ }

  const fanIn = new Map((modules?.nodes || []).map((n) => [n.id, n.inbound + n.inboundTest]))
  const nodeBy = new Map((modules?.nodes || []).map((n) => [n.id, n]))
  const churn = git?.files || {}
  const cx = complexity?.byFile || {}
  const cov = coverage?.files || {}
  const sm = smells?.files || {}

  // build leaves
  const leaves = []
  for (const path of list) {
    let size = 0
    try { size = statSync(join(REPO, path)).size } catch { continue }
    const ext = extname(path).toLowerCase()
    let loc = 0
    if (TEXT_EXT.has(ext) && size < 2 * 1024 * 1024) {
      try { loc = readFileSync(join(REPO, path), 'utf8').split('\n').length } catch { /* binary */ }
    }
    leaves.push({
      name: path.split('/').pop(), path, ext: ext || '(none)', size, loc,
      fanIn: fanIn.get(path) || 0,
      churn: churn[path]?.commits || 0,
      lastDate: churn[path]?.last || null,
      maxCc: cx[path]?.maxCyclomatic ?? null,
      mi: cx[path]?.mi ?? null,
      coverage: cov[path]?.statements ?? null,
      branchCov: cov[path]?.branches ?? null,
      funcCov: cov[path]?.functions ?? null,
      smells: sm[path]?.total ?? 0,
      dead: !!nodeBy.get(path)?.dead,
      deadExports: nodeBy.get(path)?.deadExportCount ?? 0,
    })
  }

  // normalize importance across all leaves
  const maxFan = Math.max(1, ...leaves.map((l) => l.fanIn))
  const maxChurn = Math.max(1, ...leaves.map((l) => l.churn))
  const maxLoc = Math.max(1, ...leaves.map((l) => l.loc))
  for (const l of leaves) {
    l.importance = +(0.4 * norm(l.fanIn, maxFan) + 0.35 * norm(l.churn, maxChurn) + 0.25 * norm(l.loc, maxLoc)).toFixed(4)
  }

  // assemble nested tree
  const root = { name: REPO.split('/').pop() || '(root)', path: '', children: [], size: 0, loc: 0 }
  const dirNode = (parent, name, path) => {
    let node = parent.children.find((c) => c.name === name && c.children)
    if (!node) { node = { name, path, children: [], size: 0, loc: 0 }; parent.children.push(node) }
    return node
  }
  for (const leaf of leaves.sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = leaf.path.split('/')
    let cur = root
    for (let i = 0; i < parts.length - 1; i++) {
      cur = dirNode(cur, parts[i], parts.slice(0, i + 1).join('/'))
    }
    cur.children.push(leaf)
  }
  // roll up sizes/loc to directories
  const rollup = (node) => {
    if (!node.children) return { size: node.size, loc: node.loc }
    let size = 0, loc = 0
    for (const c of node.children) { const r = rollup(c); size += r.size; loc += r.loc }
    node.size = size; node.loc = loc
    node.children.sort((a, b) => b.size - a.size)
    return { size, loc }
  }
  rollup(root)

  // top-importance flat list for quick scanning
  const top = [...leaves].sort((a, b) => b.importance - a.importance).slice(0, 40)

  // bytes by extension
  const byExt = {}
  for (const l of leaves) {
    byExt[l.ext] = byExt[l.ext] || { files: 0, size: 0, loc: 0 }
    byExt[l.ext].files++; byExt[l.ext].size += l.size; byExt[l.ext].loc += l.loc
  }

  return {
    stats: {
      files: leaves.length,
      bytes: leaves.reduce((s, l) => s + l.size, 0),
      loc: leaves.reduce((s, l) => s + l.loc, 0),
      byExt,
    },
    tree: root,
    top,
  }
}
