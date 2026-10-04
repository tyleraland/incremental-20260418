// Smells lens — a cheap, deterministic bug-risk scan over source text. Not a
// type-checker; a heuristic that flags the patterns most correlated with latent
// bugs and debt, per file. Approximate (regex over text, so a match inside a
// string counts) — a signal to eyeball, not a verdict.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

const PATTERNS = [
  ['todo', /\b(?:TODO|FIXME|HACK|XXX|BUG)\b/g],          // known-unfinished / known-broken
  ['tsSuppress', /@ts-(?:ignore|expect-error|nocheck)\b/g], // type-checker silenced
  ['eslintDisable', /eslint-disable\b/g],                // linter silenced
  ['anyType', /:\s*any\b|\bas\s+any\b/g],                // escape hatch out of the type system
  ['emptyCatch', /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g],   // swallowed error
  ['console', /\bconsole\.(?:log|debug)\b|\bdebugger\b/g], // stray debug output
]

export function extractSmells({ REPO }) {
  let list = []
  try {
    list = execSync('git ls-files', { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
      .toString().split('\n').filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('__tests__') && !/\.(test|spec)\./.test(p))
  } catch { /* no git */ }

  const files = {}
  const byKind = {}
  for (const p of list) {
    if (!['.ts', '.tsx'].includes(extname(p))) continue
    let text
    try { text = readFileSync(join(REPO, p), 'utf8') } catch { continue }
    const breakdown = {}
    let total = 0
    for (const [kind, re] of PATTERNS) {
      const n = (text.match(re) || []).length
      if (n) { breakdown[kind] = n; total += n; byKind[kind] = (byKind[kind] || 0) + n }
    }
    if (total) files[p] = { total, ...breakdown }
  }

  const top = Object.entries(files).map(([path, v]) => ({ path, ...v })).sort((a, b) => b.total - a.total)
  return {
    stats: { files: Object.keys(files).length, total: Object.values(byKind).reduce((s, v) => s + v, 0), byKind },
    files,
    top: top.slice(0, 40),
  }
}
