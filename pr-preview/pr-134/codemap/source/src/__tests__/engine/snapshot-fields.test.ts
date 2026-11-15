// The Combatant serialization CONTRACT. Snapshots persist combatants by
// spreading the object (combatantToSnap → JSON), which works only while every
// field is JSON-safe and nothing but the known strip list (tactics / trace /
// lastResolution — rebuilt on load) is dropped. That held by convention; this
// test makes it a checked invariant:
//
//   • every field on a FULLY-POPULATED combatant survives the round-trip
//     (key-for-key, deep-equal) — a field the snapshot silently drops fails
//     loudly here instead of as a subtle replay divergence months later;
//   • no field carries a function, NaN, or Infinity (JSON would mangle them);
//     visionRange is the one blessed Infinity (deserialize special-cases it).
//
// WHEN ADDING A COMBATANT FIELD: set it to a non-default value in `populate`
// below, or the round-trip check can't exercise it.
import { describe, it, expect } from 'vitest'
import { createBattle, issueMoveOrder, serializeBattle, deserializeBattle, buildEngineSkill, buildStatus, type BattleState, type Combatant } from '@/engine'
import { eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const STRIPPED = new Set(['tactics', 'trace', 'lastResolution'])   // rebuilt on load, by design

// Give every optional / AI-memory field a non-default value so the round-trip
// actually exercises it.
function populate(b: BattleState, c: Combatant): void {
  c.hp = 33
  c.statuses = [buildStatus('poisoned', 'x')!]
  c.skillCooldowns = { 'fire-bolt': 3 }
  c.tacticCooldowns = { counterattacker: 2 }
  c.tacticsUsed = ['retreater']
  c.chargeUsed = true
  c.attacksReceived = 4
  c.lastHitById = 'e'
  c.lastDamageRound = 5
  c.channel = { skillId: 'fire-bolt', targetId: 'e', roundsLeft: 2 }
  c.interruptedCount = 1
  c.lastCastSkillId = 'fire-bolt'
  c.lastCastTargetId = 'e'
  c.lastCastRound = 4
  c.lockedTargetId = 'e'
  c.threat = { e: 12 }
  c.wanderTarget = { x: 3, y: 4 }
  c.wanderDwell = 2
  c.escapeDir = { x: 0, y: -1 }
  issueMoveOrder(b, c.id, { x: 10, y: 10 }, 'avoid')
  c.avoidBest = 7.5
  c.avoidStuck = 3
  c.avoidPlowUntil = 4
  c.avoidSide = -1
  c.travelClearing = true
  c.pack = { 'red-potion': 2 }
  c.consumableSpecs = [{ itemId: 'red-potion', threshold: 0.5, effect: 'heal', healAmount: 20 }]
  c.moveAbilities = [{ kind: 'teleport', range: 8, cooldown: 25, needsLoS: true }]
  c.moveAbilityCds = { teleport: 7 }
  c.posture = 'wary'
  c.ownerId = 'someone'
  c.leashRange = 6
  c.summonTtl = 12
  c.summonTag = 'companion'
  c.provoked = false
}

// Keys whose value is undefined vanish in JSON — that's equivalent to absent,
// so normalize both sides the same way before comparing.
const definedKeys = (o: object) =>
  Object.entries(o).filter(([, v]) => v !== undefined).map(([k]) => k).sort()

describe('Combatant serialization contract', () => {
  const build = () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', skills: [buildEngineSkill('fire-bolt', 1)!], tactics: [{ id: 'kiter', rank: 1 }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 30, rows: 30,
    })
    populate(b, find(b, 'a'))
    return b
  }

  it('every populated field survives the round-trip (except the strip list)', () => {
    const b = build()
    const orig = find(b, 'a')
    const clone = find(deserializeBattle(serializeBattle(b)), 'a')
    const expectKeys = definedKeys(orig).filter((k) => !STRIPPED.has(k))
    for (const k of expectKeys) {
      expect(clone, `field '${k}' was dropped by the snapshot`).toHaveProperty(k)
      expect((clone as unknown as Record<string, unknown>)[k], `field '${k}' diverged across the round-trip`)
        .toEqual((orig as unknown as Record<string, unknown>)[k])
    }
    // And nothing EXTRA appears (a deserialize default leaking a new key is fine
    // only if makeCombatant also sets it — i.e. it exists on a fresh combatant).
    for (const k of definedKeys(clone)) {
      if (k === 'tactics' || k === 'trace' || k === 'lastResolution') continue
      expect(expectKeys, `unexpected field '${k}' appeared on the clone`).toContain(k)
    }
  })

  it('no field is a function / NaN / Infinity (visionRange excepted)', () => {
    const orig = find(build(), 'a')
    const offenders: string[] = []
    const scan = (v: unknown, path: string): void => {
      if (typeof v === 'function') offenders.push(`${path} (function)`)
      else if (typeof v === 'number' && !Number.isFinite(v)) {
        if (path !== 'visionRange') offenders.push(`${path} (${v})`)
      } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`))
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, path ? `${path}.${k}` : k)
    }
    for (const [k, v] of Object.entries(orig)) {
      if (STRIPPED.has(k)) continue   // tactics carry functions by design; they travel as refs
      scan(v, k)
    }
    expect(offenders, 'JSON-unsafe values found on Combatant — the snapshot would mangle these').toEqual([])
  })
})
