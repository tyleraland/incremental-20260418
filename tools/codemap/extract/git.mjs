// Git lens — commit history + per-file churn from `git log --numstat`.
//
// Deterministic given the repo state (commit hashes). In CI the deploy checks out
// with fetch-depth: 0, so full history is available; a shallow local clone simply
// yields fewer commits. Binary files (numstat "-") contribute commits but no line
// counts. Rename arrows ("a => b", "{a => b}") are normalised to the new path.

import { execSync } from 'node:child_process'

const US = '\x1f' // field sep
const RS = '\x01' // record (commit) sep

function newPath(p) {
  if (!p.includes('=>')) return p
  const brace = p.match(/^(.*)\{(.*?) => (.*?)\}(.*)$/)
  if (brace) return (brace[1] + brace[3] + brace[4]).replace(/\/{2,}/g, '/')
  const arrow = p.match(/^(.*?) => (.*)$/)
  if (arrow) return arrow[2]
  return p
}

export function extractGit({ REPO }) {
  let raw = ''
  try {
    raw = execSync(
      `git log --no-merges --numstat --date=short --pretty=format:'${RS}%H${US}%h${US}%an${US}%ad${US}%s'`,
      { cwd: REPO, maxBuffer: 256 * 1024 * 1024 },
    ).toString()
  } catch {
    return { available: false, stats: { commits: 0 }, commits: [], files: {}, daily: [], authors: [] }
  }

  const commits = []
  const files = {}
  const dailyMap = new Map()
  const authorMap = new Map()

  for (const block of raw.split(RS)) {
    if (!block.trim()) continue
    const lines = block.split('\n')
    const [hash, short, author, date, ...rest] = lines[0].split(US)
    const subject = rest.join(US)
    let ins = 0, del = 0, changed = 0
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const m = line.split('\t')
      if (m.length < 3) continue
      const a = m[0] === '-' ? 0 : parseInt(m[0], 10) || 0
      const d = m[1] === '-' ? 0 : parseInt(m[1], 10) || 0
      const path = newPath(m.slice(2).join('\t'))
      ins += a; del += d; changed++
      const f = files[path] || (files[path] = { commits: 0, ins: 0, del: 0, first: date, last: date, authors: [] })
      f.commits++; f.ins += a; f.del += d
      f.first = date < f.first ? date : f.first
      f.last = date > f.last ? date : f.last
      if (!f.authors.includes(author)) f.authors.push(author)
    }
    commits.push({ hash, short, author, date, subject, files: changed, ins, del })
    const day = dailyMap.get(date) || { date, commits: 0, ins: 0, del: 0 }
    day.commits++; day.ins += ins; day.del += del; dailyMap.set(date, day)
    const au = authorMap.get(author) || { name: author, commits: 0, ins: 0, del: 0 }
    au.commits++; au.ins += ins; au.del += del; authorMap.set(author, au)
  }

  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  const authors = [...authorMap.values()].sort((a, b) => b.commits - a.commits)
  const dates = commits.map((c) => c.date).sort()

  return {
    available: true,
    stats: {
      commits: commits.length,
      authors: authors.length,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
      activeDays: daily.length,
      filesTouched: Object.keys(files).length,
      insertions: commits.reduce((s, c) => s + c.ins, 0),
      deletions: commits.reduce((s, c) => s + c.del, 0),
    },
    commits, // newest first (git log default)
    files,
    daily,
    authors,
  }
}
