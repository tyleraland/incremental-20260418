#!/usr/bin/env node
// Keeps commit-tags.json (the Codemap Timeline's classification) current.
//
//   node tools/codemap/classify-commits.mjs            # --check: nudge if any commit is unclassified (used by the pre-push hook)
//   node tools/codemap/classify-commits.mjs --list     # human-readable list of unclassified commits
//   node tools/codemap/classify-commits.mjs --json      # unclassified commits as a JSON batch (to hand an LLM)
//   node tools/codemap/classify-commits.mjs --append    # merge a JSON array of {hash,category,feature,tags} from stdin
//
// The classification itself is an LLM judgment (see the schema below); this script
// only finds what's missing and writes what you hand back. The pre-push hook runs
// --check and prints the instruction so the LLM in the loop can analyze the new
// commits and append them. Nothing here blocks a push.

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
    const key = hash.slice(0, 10)
    if (tags[key]) continue
    const dirs = new Set()
    for (const l of lines.slice(1)) { if (!l.trim()) continue; const p = l.split('/'); dirs.add(p.length > 2 ? p.slice(0, 2).join('/') : (p[0] || l)) }
    recs.push({ hash: key, date, subj, dirs: [...dirs].slice(0, 6) })
  }
  return recs
}

const mode = process.argv[2] || '--check'

if (mode === '--append') {
  const arr = JSON.parse(readFileSync(0, 'utf8'))
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
  console.error(`[codemap] appended ${arr.length} (${added} new) → commit-tags.json now has ${Object.keys(sorted).length}. Rebuild the Timeline with: npm run codemap`)
  process.exit(0)
}

const recs = unclassified()

if (mode === '--json') { process.stdout.write(JSON.stringify(recs)); process.exit(0) }

if (recs.length === 0) { if (mode === '--list') console.error('[codemap] all commits classified.'); process.exit(0) }

// --check / --list : an instruction the LLM in the loop can act on
console.error(`\n[codemap] ${recs.length} commit(s) not yet classified for the Timeline lens.`)
console.error(`To render them: analyze each and append its classification —`)
console.error(`  node tools/codemap/classify-commits.mjs --append <<'JSON'`)
console.error(`  [{"hash":"<10-char>","category":"${CATEGORIES.join('|')}","feature":"<kebab-slug>","tags":["kw"]}]`)
console.error(`  JSON`)
console.error(`Unclassified commits:`)
for (const r of recs) console.error(`  ${r.hash}  [${r.dirs.join(', ')}]  ${r.subj}`)
console.error(`(set SKIP_CODEMAP_CLASSIFY=1 to skip this check.)\n`)
process.exit(0) // never blocks the push
