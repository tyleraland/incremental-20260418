// Timeline lens — joins the one-time commit classification (commit-tags.json,
// backfilled by Haiku and appended to over time) with git dates, so you can see
// WHEN each feature was developed. Deterministic given the repo + the tags file.
// Commits with no classification yet show as `unclassified`.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function extractTimeline({ REPO, HERE }) {
  let tags = {}
  try { tags = JSON.parse(readFileSync(join(HERE, 'commit-tags.json'), 'utf8')) } catch { /* not backfilled */ }

  let raw = ''
  try {
    raw = execSync('git log --no-merges --date=short --pretty=format:%H\x1f%ad\x1f%s', { cwd: REPO, maxBuffer: 128 * 1024 * 1024 }).toString()
  } catch { return { available: false, stats: { commits: 0 }, commits: [], features: [], categories: [], monthly: [] } }

  const commits = raw.split('\n').filter(Boolean).map((line) => {
    const [hash, date, ...rest] = line.split('\x1f')
    const key = hash.slice(0, 10)
    const t = tags[key] || {}
    return { hash: key, date, subject: rest.join('\x1f'), category: t.category || 'unclassified', feature: t.feature || 'unclassified', tags: t.tags || [] }
  }).sort((a, b) => a.date.localeCompare(b.date))

  const featMap = new Map(), catMap = new Map(), monMap = new Map()
  for (const c of commits) {
    const f = featMap.get(c.feature) || { feature: c.feature, count: 0, first: c.date, last: c.date, categories: {} }
    f.count++; f.first = c.date < f.first ? c.date : f.first; f.last = c.date > f.last ? c.date : f.last
    f.categories[c.category] = (f.categories[c.category] || 0) + 1
    featMap.set(c.feature, f)
    catMap.set(c.category, (catMap.get(c.category) || 0) + 1)
    const mon = c.date.slice(0, 7)
    const m = monMap.get(mon) || { month: mon, total: 0, byCategory: {} }
    m.total++; m.byCategory[c.category] = (m.byCategory[c.category] || 0) + 1
    monMap.set(mon, m)
  }

  const features = [...featMap.values()].sort((a, b) => a.first.localeCompare(b.first) || b.count - a.count)
  const categories = [...catMap.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
  const monthly = [...monMap.values()].sort((a, b) => a.month.localeCompare(b.month))
  const dates = commits.map((c) => c.date)

  return {
    available: commits.some((c) => c.feature !== 'unclassified'),
    stats: {
      commits: commits.length,
      classified: commits.filter((c) => c.feature !== 'unclassified').length,
      features: features.length,
      first: dates[0] || null, last: dates[dates.length - 1] || null,
    },
    commits, features, categories, monthly,
  }
}
