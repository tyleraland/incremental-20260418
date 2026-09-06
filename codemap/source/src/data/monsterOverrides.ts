// Monster Lab — LIVE monster overrides (dev experimentation tool).
//
// The Monster Lab (?monsterlab=1, ☰ Menu → Developer) lets you retune a
// monster's stats / skills / tactics WHILE the game runs and watch the effect
// on the next spawn. This module is the plumbing behind it: it mutates the live
// `MONSTER_REGISTRY` in place, persists the experiment to localStorage (so it
// survives a reload / "← Game"), and can diff the current experiment against the
// authored defs to emit a hand-off report for an LLM to bake into `monsters.ts`.
//
// Scope: dev-only. Nothing here is imported by the store or engine, so tests and
// snapshot replays are untouched. Overrides apply on boot via
// `applyPersistedOverrides()` (called from App.tsx) so they take effect for
// every subsequent spawn/wave — existing combatants are already cloned, so a
// live tweak lands on the next monster that stands up.
import type { MonsterDef } from '@/types'
import { MONSTER_REGISTRY } from './monsters'

const STORAGE_KEY = 'monster-overrides'
const DRAFT_STORAGE_KEY = 'monster-drafts'

// Plain-data deep clone. MonsterDef carries no functions (skills are {id,level}),
// so a JSON round-trip is a safe, dependency-free structuredClone.
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// The authored defs, captured once at module load BEFORE any override is applied.
// This is the "current" column of the change report and the reset target.
export const ORIGINAL_MONSTERS: Record<string, MonsterDef> = clone(MONSTER_REGISTRY)

// The experiment: full resolved snapshots keyed by monster id. Stored whole (not
// as a patch) so the editor round-trips cleanly; the report derives the diff.
type OverrideMap = Record<string, MonsterDef>
type DraftMap = Record<string, MonsterDef>

function readStored(): OverrideMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as OverrideMap) : {}
  } catch {
    return {}
  }
}

function readDrafts(): DraftMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as DraftMap) : {}
  } catch {
    return {}
  }
}

function writeStored(map: OverrideMap): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* private mode / quota — overrides just won't persist */
  }
}

function writeDrafts(map: DraftMap): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (Object.keys(map).length === 0) localStorage.removeItem(DRAFT_STORAGE_KEY)
    else localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* private mode / quota — local drafts just won't persist */
  }
}

// Apply every persisted override onto the live registry. Idempotent; call once
// at boot. Local draft monsters are injected first, then authored-monster
// overrides patch the original registry entries.
export function applyPersistedOverrides(): void {
  for (const [id, def] of Object.entries(readDrafts())) MONSTER_REGISTRY[id] = clone(def)
  const stored = readStored()
  for (const [id, def] of Object.entries(stored)) {
    if (MONSTER_REGISTRY[id]) MONSTER_REGISTRY[id] = clone(def)
  }
}

// Ids currently carrying an experiment (persisted + applied).
export function overriddenIds(): string[] {
  return Object.keys(readStored())
}

export function isOverridden(id: string): boolean {
  return id in readStored()
}

export function draftIds(): string[] {
  return Object.keys(readDrafts())
}

export function isDraftMonster(id: string): boolean {
  return id in readDrafts()
}

export function setDraftMonster(def: MonsterDef): void {
  const drafts = readDrafts()
  drafts[def.id] = clone(def)
  writeDrafts(drafts)
  MONSTER_REGISTRY[def.id] = clone(def)
}

export function deleteDraftMonster(id: string): void {
  const drafts = readDrafts()
  delete drafts[id]
  writeDrafts(drafts)
  delete MONSTER_REGISTRY[id]
}

export function buildDraftExport(id: string): string {
  const def = MONSTER_REGISTRY[id]
  if (!def) return ''
  return JSON.stringify(def, null, 2)
}

// The live (possibly overridden) def; the authored baseline.
export function currentDef(id: string): MonsterDef | undefined {
  return MONSTER_REGISTRY[id]
}
export function originalDef(id: string): MonsterDef | undefined {
  return ORIGINAL_MONSTERS[id]
}

// Set the live experiment for one monster: mutate the registry + persist. If the
// draft is byte-identical to the authored def, clear the override instead (so a
// round-trip back to defaults leaves a clean slate + report).
export function setOverride(id: string, def: MonsterDef): void {
  if (!ORIGINAL_MONSTERS[id]) return
  const stored = readStored()
  if (JSON.stringify(def) === JSON.stringify(ORIGINAL_MONSTERS[id])) {
    delete stored[id]
    MONSTER_REGISTRY[id] = clone(ORIGINAL_MONSTERS[id])
  } else {
    stored[id] = clone(def)
    MONSTER_REGISTRY[id] = clone(def)
  }
  writeStored(stored)
}

// Revert one monster to its authored def.
export function resetOverride(id: string): void {
  const stored = readStored()
  delete stored[id]
  writeStored(stored)
  if (ORIGINAL_MONSTERS[id]) MONSTER_REGISTRY[id] = clone(ORIGINAL_MONSTERS[id])
}

// Revert everything.
export function resetAllOverrides(): void {
  for (const id of overriddenIds()) {
    if (ORIGINAL_MONSTERS[id]) MONSTER_REGISTRY[id] = clone(ORIGINAL_MONSTERS[id])
  }
  writeStored({})
}

// ── Diff + change-request report ────────────────────────────────────────────

export interface FieldChange { path: string; from: unknown; to: unknown }

const fmt = (v: unknown): string => {
  if (v === undefined || v === null) return '—'
  if (Array.isArray(v)) {
    if (v.length === 0) return '—'
    return v
      .map((e) => {
        if (e && typeof e === 'object') {
          const o = e as Record<string, unknown>
          if ('id' in o && 'level' in o) return `${o.id} Lv${o.level}`
          if ('id' in o && 'rank' in o) return `${o.id} (r${o.rank})`
        }
        return String(e)
      })
      .join(', ')
  }
  return String(v)
}

// Field-by-field diff of the live def vs the authored baseline. Walks the exact
// set the Lab can edit (stats tuples split into ability/armor legs, skills &
// tactics compared as whole lists).
export function diffMonster(id: string): FieldChange[] {
  const cur = MONSTER_REGISTRY[id]
  const orig = ORIGINAL_MONSTERS[id]
  if (!cur || !orig) return []
  const changes: FieldChange[] = []
  const cmp = (path: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ path, from, to })
  }
  cmp('level', orig.level, cur.level)
  cmp('name', orig.name, cur.name)
  cmp('health', orig.health, cur.health)
  cmp('element', orig.element, cur.element)
  cmp('size', orig.size, cur.size)
  cmp('bodyShape', orig.bodyShape, cur.bodyShape)
  cmp('attackName', orig.attackName, cur.attackName)
  cmp('stats.attack', orig.stats.attack, cur.stats.attack)
  cmp('stats.defense[ability]', orig.stats.defense[0], cur.stats.defense[0])
  cmp('stats.defense[armor]', orig.stats.defense[1], cur.stats.defense[1])
  cmp('stats.magicAttack', orig.stats.magicAttack, cur.stats.magicAttack)
  cmp('stats.magicDefense[ability]', orig.stats.magicDefense[0], cur.stats.magicDefense[0])
  cmp('stats.magicDefense[armor]', orig.stats.magicDefense[1], cur.stats.magicDefense[1])
  cmp('stats.attackSpeed', orig.stats.attackSpeed, cur.stats.attackSpeed)
  cmp('stats.accuracy', orig.stats.accuracy, cur.stats.accuracy)
  cmp('stats.dodge', orig.stats.dodge, cur.stats.dodge)
  cmp('stats.moveSpeed', orig.stats.moveSpeed, cur.stats.moveSpeed)
  cmp('stats.attackRange', orig.stats.attackRange, cur.stats.attackRange)
  cmp('skills', orig.skills, cur.skills)
  cmp('tactics', orig.tactics, cur.tactics)
  cmp('armorReduction', orig.armorReduction, cur.armorReduction)
  cmp('dodgePeriod', orig.dodgePeriod, cur.dodgePeriod)
  cmp('threatMult', orig.threatMult, cur.threatMult)
  return changes
}

// A markdown change-request report for every overridden monster — the hand-off
// artifact. Pairs a human-readable per-field diff table with the full new def as
// JSON so an LLM can patch `src/data/monsters.ts` with zero ambiguity.
export function buildChangeReport(): string {
  const ids = overriddenIds().filter((id) => diffMonster(id).length > 0)
  if (ids.length === 0) return '_No monster overrides — tune something in the Monster Lab first._'

  const lines: string[] = []
  lines.push('# Monster balance change request')
  lines.push('')
  lines.push(
    'These values were tuned live in the Monster Lab (`?monsterlab=1`). Please apply them to ' +
      '`MONSTER_REGISTRY` in `src/data/monsters.ts`. For each monster, set the listed fields to ' +
      'the **new** value and leave everything else (drops, etc.) untouched. The full new def is ' +
      'included as JSON for reference.',
  )
  lines.push('')
  lines.push(`Monsters changed: ${ids.map((id) => `\`${id}\``).join(', ')}`)

  for (const id of ids) {
    const cur = MONSTER_REGISTRY[id]!
    const changes = diffMonster(id)
    lines.push('')
    lines.push(`## ${cur.name} — \`${id}\``)
    lines.push('')
    lines.push('| field | current | new |')
    lines.push('| --- | --- | --- |')
    for (const c of changes) lines.push(`| \`${c.path}\` | ${fmt(c.from)} | **${fmt(c.to)}** |`)
    lines.push('')
    lines.push('<details><summary>Full new def (JSON)</summary>')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(cur, null, 2))
    lines.push('```')
    lines.push('')
    lines.push('</details>')
  }
  lines.push('')
  return lines.join('\n')
}
