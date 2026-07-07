// Codemap orchestrator.
//
// Runs each lens extractor, writes one dataset per lens into dist/data/, plus a
// manifest.json (headline stats + dataset list) and the static viewer. This is a
// PLATFORM: to add a new lens, drop an extractor here and a view in viewer/views/.
// Every extractor is deterministic (same source -> same dataset, apart from the
// git hash / timestamp stamped here).

import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative, extname } from 'node:path'

import { extractModules } from './extract/modules.mjs'
import { extractGit } from './extract/git.mjs'
import { extractComplexity } from './extract/complexity.mjs'
import { extractCoverage } from './extract/coverage.mjs'
import { extractSmells } from './extract/smells.mjs'
import { extractFilesystem } from './extract/filesystem.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const OUT_DIR = join(HERE, 'dist')
const DATA_DIR = join(OUT_DIR, 'data')

const gitHash = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim() } catch { return 'unknown' } })()
const generatedAt = new Date().toISOString()

// ── run lenses (order matters: filesystem blends the other signals per-file) ──
const modules = extractModules({ REPO, HERE })
const git = extractGit({ REPO })
const complexity = extractComplexity({ REPO })
const coverage = extractCoverage({ REPO })
const smells = extractSmells({ REPO })
const filesystem = extractFilesystem({ REPO, modules, git, complexity, coverage, smells })

const datasets = {
  modules: { ...modules, generatedAt, gitHash },
  git: { ...git, generatedAt, gitHash },
  complexity: { ...complexity, generatedAt, gitHash },
  coverage: { ...coverage, generatedAt, gitHash },
  smells: { ...smells, generatedAt, gitHash },
  filesystem: { ...filesystem, generatedAt, gitHash },
}

// ── manifest: headline stats for the shell header + dataset registry ──────────
const manifest = {
  generatedAt,
  gitHash,
  repo: REPO.split('/').pop(),
  headline: {
    codeFiles: modules.stats.codeFiles,
    codeLoc: modules.stats.codeLoc,
    edges: modules.stats.edges,
    features: modules.stats.features,
    deadModules: modules.stats.deadModules,
    cycles: modules.stats.cycles,
    trackedFiles: filesystem.stats.files,
    bytes: filesystem.stats.bytes,
    commits: git.stats.commits,
    authors: git.stats.authors,
    over10: complexity.stats.over10,
    coverage: coverage.available ? coverage.stats.statements : null,
    deadExports: modules.stats.deadExports,
    smells: smells.stats.total,
  },
  datasets: Object.keys(datasets).map((id) => ({ id, file: `data/${id}.json` })),
}

// ── emit ──────────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true })
for (const [id, data] of Object.entries(datasets)) writeFileSync(join(DATA_DIR, `${id}.json`), JSON.stringify(data))
writeFileSync(join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

// copy the viewer tree recursively
const copyTree = (from, to) => {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const s = join(from, entry.name), d = join(to, entry.name)
    if (entry.isDirectory()) copyTree(s, d)
    else copyFileSync(s, d)
  }
}
copyTree(join(HERE, 'viewer'), OUT_DIR)
// vendor pinned cytoscape (no runtime CDN dependency)
copyFileSync(join(HERE, 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'), join(OUT_DIR, 'cytoscape.min.js'))

// Mirror the tracked text source into dist/source/ so the viewer can show raw
// code on demand (fetched per-file, not bundled into a dataset). The repo is
// public, so no confidentiality concern; binary/oversized files are skipped.
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss',
  '.html', '.md', '.yml', '.yaml', '.txt', '.svg', '.sh', '.cfg', '.toml', '.xml', '.nvmrc', ''])
let sourceFiles = 0
try {
  const tracked = execSync('git ls-files', { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').filter(Boolean)
  for (const p of tracked) {
    if (!SOURCE_EXT.has(extname(p).toLowerCase())) continue
    const abs = join(REPO, p)
    try { if (statSync(abs).size > 512 * 1024) continue } catch { continue }
    const dest = join(OUT_DIR, 'source', p)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(abs, dest)
    sourceFiles++
  }
} catch { /* no git / no files */ }

const kb = (b) => (b / 1024).toFixed(0) + 'kb'
console.log(
  `codemap @${gitHash}\n` +
  `  modules:    ${modules.stats.codeFiles} files, ${modules.stats.edges} edges, ${modules.stats.features} features, ` +
    `${modules.stats.deadModules} dead, ${modules.stats.cycles} cycles\n` +
  `  filesystem: ${filesystem.stats.files} tracked files, ${kb(filesystem.stats.bytes)}\n` +
  `  git:        ${git.stats.commits} commits, ${git.stats.authors} authors` +
    (git.available ? '' : ' (unavailable)') + '\n' +
  `  complexity: ${complexity.stats.functions} functions, ${complexity.stats.over10} over CC>10, median MI ${complexity.stats.medianMi}\n` +
  `  coverage:   ` + (coverage.available ? `${coverage.stats.statements}% statements over ${coverage.stats.files} files` : 'unavailable (run `npm run coverage`)') + '\n' +
  `  smells:     ${smells.stats.total} across ${smells.stats.files} files · ${modules.stats.deadExports} dead exports\n` +
  `  source:     ${sourceFiles} files mirrored to source/\n` +
  `  -> ${relative(REPO, DATA_DIR)}/{modules,git,complexity,coverage,smells,filesystem,manifest}.json`,
)
