// Battle-snapshot repro harness (dev only).
//
// Pull a `BSNAP.…` token from a GitHub gist (or a raw URL / file / literal /
// stdin), cache it locally, deserialize it, and step the deterministic combat
// sim — printing per-round HP, position, and (optionally) the damage/heal/cast
// events for the units you care about. This is the headless version of the
// BattleView "⎘ state" → "paste BSNAP → watch it recur" loop: it turns a bug
// report into one command instead of a hand-rolled throwaway test.
//
// Runs TS straight from source via Vite's ssrLoadModule, so the `@/` alias and
// the engine's per-battle ambients (arena bounds / timeScale) all just work —
// no build step, no new deps.
//
//   node scripts/bsnap.mjs <source> [options]
//
// <source> is one of:
//   • a gist page URL     https://gist.github.com/user/<id>
//   • a raw gist/file URL https://gist.githubusercontent.com/.../raw
//   • a local file path   ./repro.txt   (or anything that isn't a URL/token)
//   • a literal token     BSNAP.eJ…
//   • -                   read the token from stdin
//
// Options:
//   -n, --rounds <N>     engine rounds to advance            (default 24)
//   -w, --watch <ids>    comma-separated combatant ids to track
//                          (default: every player-team unit)
//   -e, --events         also print events touching a watched unit each round
//       --all-events     print every event each round (implies -e)
//       --no-step        just dump the opening roster + zones, don't advance
//       --save <path>    where to cache the pulled token (default .bsnap/last.txt)
//       --no-save        don't cache the token
//   -h, --help           this message
//
// Examples:
//   node scripts/bsnap.mjs https://gist.github.com/tyleraland/<id> -w u4 -e
//   node scripts/bsnap.mjs .bsnap/last.txt -n 40            # replay the cached one
//   node scripts/bsnap.mjs - < token.txt --no-step         # roster-only from stdin

import { createServer } from 'vite'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

// ── arg parsing ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const opts = { rounds: 24, watch: null, events: false, allEvents: false, step: true, save: '.bsnap/last.txt' }
let source = null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '-h' || a === '--help') { printHelp(); process.exit(0) }
  else if (a === '-n' || a === '--rounds') opts.rounds = Number(argv[++i])
  else if (a === '-w' || a === '--watch') opts.watch = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
  else if (a === '-e' || a === '--events') opts.events = true
  else if (a === '--all-events') { opts.events = true; opts.allEvents = true }
  else if (a === '--no-step') opts.step = false
  else if (a === '--save') opts.save = argv[++i]
  else if (a === '--no-save') opts.save = null
  else if (source === null) source = a
  else die(`unexpected argument: ${a}`)
}
if (source === null) die('no <source> given — pass a gist URL, file, token, or - for stdin (try --help)')

function printHelp() {
  const banner = readFileSync(new URL(import.meta.url)).toString().split('\n')
    .filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')
  process.stdout.write(banner + '\n')
}
function die(msg) { process.stderr.write(`bsnap: ${msg}\n`); process.exit(1) }

// ── resolve the source → a raw BSNAP token ───────────────────────────────────
async function resolveToken(src) {
  if (src === '-') return extract(readFileSync(0).toString())          // stdin
  if (src.startsWith('BSNAP.')) return extract(src)                    // literal
  if (/^https?:\/\//.test(src)) {
    const url = toRawGist(src)
    const res = await fetch(url)
    if (!res.ok) die(`fetch ${url} → HTTP ${res.status}`)
    return extract(await res.text())
  }
  if (existsSync(src)) return extract(readFileSync(src).toString())    // file
  die(`source is not a URL, an existing file, a BSNAP token, or - : ${src}`)
}

// gist.github.com/user/<id>[/rev] → its /raw endpoint. Already-raw URLs pass through.
function toRawGist(url) {
  const m = url.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)/i)
  return m ? `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw` : url
}

// Pull the first BSNAP token out of arbitrary surrounding text. The snapshot
// guard tolerates internal whitespace/line-wraps, so we keep from `BSNAP.` to
// the end and just trim — no need to un-wrap.
function extract(text) {
  const i = text.indexOf('BSNAP.')
  if (i < 0) die('no "BSNAP." token found in the source')
  return text.slice(i).trim()
}

// ── load the engine from TS source and run ───────────────────────────────────
async function main() {
  const token = await resolveToken(source)
  if (opts.save) {
    mkdirSync(dirname(opts.save), { recursive: true })
    writeFileSync(opts.save, token + '\n')
    log(`cached token → ${opts.save} (${token.length} chars)`)
  }

  const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
  let snapshot, engine
  try {
    snapshot = await server.ssrLoadModule('/src/engine/snapshot.ts')
    engine = await server.ssrLoadModule('/src/engine/engine.ts')
  } finally {
    // keep the server up until after we've loaded; close at the very end
  }

  let battle
  try {
    battle = snapshot.deserializeBattle(token)
  } catch (e) {
    await server.close()
    die(`deserializeBattle failed — ${e.message}`)
  }

  const watch = opts.watch ?? battle.combatants.filter((c) => c.team === 'player').map((c) => c.id)
  const unknown = (opts.watch ?? []).filter((id) => !battle.combatants.some((c) => c.id === id))
  if (unknown.length) log(`⚠ watch id(s) not in battle: ${unknown.join(', ')}`)

  printRoster(battle)
  if (opts.step) stepBattle(engine, battle, watch)

  await server.close()
}

function printRoster(b) {
  log(`\nmode=${b.mode}  round=${b.round}  logical=${Math.floor(b.round / b.timeScale)}  timeScale=${b.timeScale}  grid=${b.cols}×${b.rows}  outcome=${b.outcome}`)
  for (const c of b.combatants) {
    const skills = c.skills.map((s) => `${s.id}(r${s.range},${s.targeting},${s.type}${s.zone ? `,dot${s.zone.dotDamage}` : ''})`).join(' ') || '—'
    log(`  ${pad(c.team, 6)} ${pad(c.id, 16)} "${c.name}"  hp ${c.hp}/${c.maxHp}  str${c.str} int${c.int} spd${c.spd}  pos ${fx(c.pos.x)},${fx(c.pos.y)}  melee ${c.meleeRange} ranged ${c.rangedRange}`)
    log(`         skills: ${skills}`)
  }
  if (b.zones.length) log(`  zones: ${JSON.stringify(b.zones.map((z) => ({ id: z.id, dot: z.dotDamage, el: z.element, follow: z.follow, left: z.roundsLeft })))}`)
}

function stepBattle(engine, b, watch) {
  log(`\nstepping ${opts.rounds} round(s), watching: ${watch.join(', ')}\n`)
  const prev = Object.fromEntries(watch.map((id) => [id, hpOf(b, id)]))
  for (let i = 0; i < opts.rounds; i++) {
    engine.advanceRound(b)
    const logical = Math.floor(b.round / b.timeScale)
    const cols = watch.map((id) => {
      const c = b.combatants.find((x) => x.id === id)
      if (!c) return `${id}=∅`
      const d = c.hp - prev[id]; prev[id] = c.hp
      const tag = !c.alive ? ' KO' : ''
      return `${id} ${c.hp}/${c.maxHp}${d ? `(${d > 0 ? '+' : ''}${d})` : ''}@${fx(c.pos.x)},${fx(c.pos.y)}${tag}`
    })
    log(`R${pad(String(b.round), 3)} L${pad(String(logical), 3)}  ${cols.join('   ')}`)
    if (opts.events) {
      const evs = b.events.filter((e) => opts.allEvents || watch.includes(e.targetId) || watch.includes(e.sourceId))
      for (const e of evs) log(`        · ${e.type} ${fmtEvent(e)}`)
    }
    b.events.length = 0
    if (b.outcome !== 'ongoing') { log(`\noutcome → ${b.outcome} at round ${b.round}`); break }
  }
}

function fmtEvent(e) {
  const bits = []
  if (e.sourceId) bits.push(`src=${e.sourceId}`)
  if (e.targetId) bits.push(`→${e.targetId}`)
  if (e.value != null) bits.push(`v=${e.value}`)
  if (e.element) bits.push(`el=${e.element}`)
  if (e.skillId) bits.push(`sk=${e.skillId}`)
  return bits.join(' ')
}

const hpOf = (b, id) => b.combatants.find((c) => c.id === id)?.hp ?? 0
const fx = (n) => n.toFixed(1)
const pad = (s, n) => String(s).padEnd(n)
const log = (s) => process.stdout.write(s + '\n')

main().catch((e) => { process.stderr.write(`bsnap: ${e.stack || e}\n`); process.exit(1) })
