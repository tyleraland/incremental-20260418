// Coverage lens — parses istanbul-shaped coverage-final.json (emitted by
// `vitest run --coverage` with the json reporter; both the v8 and istanbul
// providers write this shape). Unlike the other lenses this reflects a TEST RUN,
// not pure source — it's graceful when the file is absent (returns available:false
// so the viewer prompts you to generate it).

import { readFileSync } from 'node:fs'
import { relative, join, isAbsolute } from 'node:path'

const pct = (covered, total) => (total > 0 ? +((covered / total) * 100).toFixed(1) : null)

export function extractCoverage({ REPO }) {
  let raw
  try { raw = JSON.parse(readFileSync(join(REPO, 'coverage', 'coverage-final.json'), 'utf8')) }
  catch { return { available: false, stats: { files: 0 }, files: {} } }

  const rel = (p) => {
    const r = isAbsolute(p) ? relative(REPO, p) : p
    return r.split('\\').join('/')
  }
  const files = {}
  let totS = 0, covS = 0, totB = 0, covB = 0, totF = 0, covF = 0

  for (const [abs, fc] of Object.entries(raw)) {
    const path = rel(abs)
    if (!path.startsWith('src/')) continue
    const s = Object.values(fc.s || {})
    const sTot = s.length, sCov = s.filter((v) => v > 0).length
    const branches = Object.values(fc.b || {}).flat()
    const bTot = branches.length, bCov = branches.filter((v) => v > 0).length
    const fn = Object.values(fc.f || {})
    const fTot = fn.length, fCov = fn.filter((v) => v > 0).length
    totS += sTot; covS += sCov; totB += bTot; covB += bCov; totF += fTot; covF += fCov
    files[path] = {
      statements: pct(sCov, sTot), branches: pct(bCov, bTot), functions: pct(fCov, fTot),
      uncovered: sTot - sCov,
    }
  }

  return {
    available: true,
    stats: {
      files: Object.keys(files).length,
      statements: pct(covS, totS), branches: pct(covB, totB), functions: pct(covF, totF),
    },
    files,
  }
}
