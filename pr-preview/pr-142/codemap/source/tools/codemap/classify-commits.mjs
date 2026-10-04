#!/usr/bin/env node
// Keeps commit-tags.json (the Codemap Timeline's classification) current.
//
//   node tools/codemap/classify-commits.mjs --auto     # classify unclassified commits with `claude -p` (haiku) and append
//   node tools/codemap/classify-commits.mjs            # --check: just report if any commit is unclassified
//   node tools/codemap/classify-commits.mjs --list      # human-readable list of unclassified commits
//   node tools/codemap/classify-commits.mjs --json      # unclassified commits as a JSON batch
//   node tools/codemap/classify-commits.mjs --append    # merge a JSON array of {hash,category,feature,tags} from stdin
//
// --auto is the one-call path the pre-push hook uses: it hands the unclassified
// commits to Haiku via `claude -p` and appends the result. It intentionally runs
// AFTER the commits exist, so the tip commit lands unclassified until the next
// push — being one commit behind is fine (it shows in the Timeline's
// `unclassified` lane). Never blocks; degrades to a nudge if `claude` is absent.

import { execFileSync } from 'node:child_process'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const TAGS = join(HERE, 'commit-tags.json')
const CATEGORIES = ['feature', 'fix', 'refactor', 'perf', 'docs', 'test', 'chore', 'infra']

const readTags = () => { try { return JSON.parse(readFileSync(TAGS, 'utf8')) } catch { return {} } }

function unclassified() {
  const tags = readTags()
  let raw = ''
  try { raw = execSync('git log --no-merges --date=short --pretty=\x1e%H\x1f%ad\x1f%s --name-only', { cwd: REPO, maxBuffer: 128 * 1024 * 1024 }).toString() }
  catch { return [] }
  const recs = []
  for (const block of raw.split('\x1e')) {
    if (!block.trim()) continue
    const lines = block.split('\n')
    const [hash, date, subj] = lines[0].split('\x1f')
    if (tags[hash.slice(0, 10)]) continue
    const dirs = new Set()
    for (const l of lines.slice(1)) { if (!l.trim()) continue; const p = l.split('/'); dirs.add(p.length > 2 ? p.slice(0, 2).join('/') : (p[0] || l)) }
    recs.push({ hash: hash.slice(0, 10), date, subj, dirs: [...dirs].slice(0, 6) })
  }
  return recs
}

function appendClassifications(arr) {
  const tags = readTags()
  let added = 0
  for (const c of arr) {
    if (!c || !c.hash) continue
    if (!CATEGORIES.includes(c.category)) throw new Error(`bad category "${c.category}" for ${c.hash} (one of ${CATEGORIES.join('|')})`)
    const key = String(c.hash).slice(0, 10)
    if (!tags[key]) added++
    tags[key] = { category: c.category, feature: c.feature, tags: Array.isArray(c.tags) ? c.tags : [] }
  }
  const sorted = Object.fromEntries(Object.keys(tags).sort().map((k) => [k, tags[k]]))
  writeFileSync(TAGS, JSON.stringify(sorted))
  return { added, total: Object.keys(sorted).length }
}

const PROMPT = (recs) =>
  `Classify these git commits from a mobile game codebase (React + a deterministic combat engine; ` +
  `"codemap" is a dev tool under tools/codemap; *.md/BACKLOG commits are usually docs). ` +
  `Reply with ONLY a JSON array — no prose, no code fences. Each element: ` +
  `{"hash": <the 10-char hash>, "category": one of [${CATEGORIES.map((c) => `"${c}"`).join(',')}], ` +
  `"feature": a short kebab-case subsystem slug (reuse when sensible: combat-engine, tactics, skills, movement, ` +
  `open-world, save, offline, leveling, map-locations, mapgen, city-graphics, skins-render, terrain, tactician-shell, ` +
  `logistics, consumables, quests, codemap, perf-harness, ui, asset-pipeline, docs-backlog), "tags": 1-3 keywords}.\n` +
  `Commits:\n${JSON.stringify(recs.map((r) => ({ hash: r.hash, subj: r.subj, dirs: r.dirs })))}`

function classifyWithClaude(recs) {
  const out = execFileSync('claude', ['-p', '--model', 'haiku'], {
    input: PROMPT(recs), encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'], // drop stderr (trust-dialog notice etc.)
  })
  const m = out.replace(/```json|```/g, '').match(/\[[\s\S]*\]/)
  if (!m) throw new Error('no JSON array in claude output')
  return JSON.parse(m[0])
}

const mode = process.argv[2] || '--check'

if (mode === '--append') {
  const { added, total } = appendClassifications(JSON.parse(readFileSync(0, 'utf8')))
  console.error(`[codemap] appended (${added} new) → commit-tags.json now has ${total}. Rebuild: npm run codemap`)
  process.exit(0)
}

const recs = unclassified()

if (mode === '--json') { process.stdout.write(JSON.stringify(recs)); process.exit(0) }

if (mode === '--auto') {
  if (recs.length === 0) { console.error('[codemap] all commits classified.'); process.exit(0) }
  let all = []
  try {
    for (let i = 0; i < recs.length; i += 50) all = all.concat(classifyWithClaude(recs.slice(i, i + 50)))
  } catch (e) {
    console.error(`[codemap] auto-classify skipped (${e.message}). Classify manually: node tools/codemap/classify-commits.mjs --json`)
    process.exit(0)
  }
  const { added, total } = appendClassifications(all)
  console.error(`[codemap] classified ${added} commit(s) via haiku → commit-tags.json now has ${total}.`)
  console.error(`[codemap] commit tools/codemap/commit-tags.json to include them (then \`npm run codemap\`).`)
  process.exit(0)
}

// --check / --list
if (recs.length === 0) { if (mode === '--list') console.error('[codemap] all commits classified.'); process.exit(0) }
console.error(`\n[codemap] ${recs.length} commit(s) not yet classified for the Timeline lens.`)
console.error(`Auto-classify with haiku:  node tools/codemap/classify-commits.mjs --auto`)
if (mode === '--list') for (const r of recs) console.error(`  ${r.hash}  [${r.dirs.join(', ')}]  ${r.subj}`)
console.error(`(set SKIP_CODEMAP_CLASSIFY=1 to skip.)\n`)
process.exit(0)
