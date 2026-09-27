// Intel mask — imperfect information (tactical-coordination.md §3.7, §8
// "Independent"). The engine never LEARNS; it only carries what the host stamps.
// This suite pins the engine-side contract:
//   • knownView semantics — absent ⇒ fully known (the legacy/omniscient fast
//     path), fully-revealed ⇒ the real combatant, present-but-empty ⇒ priors;
//     and the WeakMap cache is memo-safe (a fresh intel object self-invalidates).
//   • estimateDamageVs reads the target through the mask — a first fight against
//     an unknown armor element misjudges the matchup, and REVEALING it sharpens
//     to (and is byte-identical with) the omniscient number.
//   • the masked capability (knownCapability) prices an unrevealed KIT as a bare
//     basic attacker.
//   • snapshots carry serialization-time knowledge; a battle with NO intel
//     anywhere serializes byte-identical to a pre-intel token (the back-compat
//     invariant), and setCombatantIntel(undefined) restores omniscience exactly.
import { describe, it, expect } from 'vitest'
import {
  estimateDamageVs, knownView, computeCapability, createBattle, serializeBattle,
  deserializeBattle, setCombatantIntel, type EngineUnitInput, type IntelMask,
} from '@/engine'
import { combatant, attackSkill, eu } from './helpers'

const FULL: IntelMask = { armor: true, dodge: true, kit: true }

describe('knownView — the knowledge choke point', () => {
  it('absent intel ⇒ returns the combatant itself (omniscient fast path)', () => {
    const c = combatant({ armorElement: 'fire', dodgePeriod: 4, skills: [attackSkill()] })
    expect(knownView(c)).toBe(c)
  })

  it('fully-revealed intel ⇒ returns the combatant itself (no masking to do)', () => {
    const c = combatant({ armorElement: 'fire', dodgePeriod: 4, skills: [attackSkill()], intel: { ...FULL } })
    expect(knownView(c)).toBe(c)
  })

  it('present-but-empty intel ⇒ a prototype view with priors, live stats read through', () => {
    const c = combatant({ str: 17, armorElement: 'fire', dodgePeriod: 4, skills: [attackSkill()], intel: {} })
    const v = knownView(c)
    expect(v).not.toBe(c)
    expect(v.armorElement).toBe('neutral')   // unrevealed → prior
    expect(v.dodgePeriod).toBe(null)         // unrevealed → never dodges
    expect(v.skills).toEqual([])             // unrevealed → bare kit
    expect(v.str).toBe(17)                   // non-maskable stat reads live through the prototype
  })

  it('reveals fields individually', () => {
    const c = combatant({ armorElement: 'fire', dodgePeriod: 4, skills: [attackSkill()], intel: { armor: true } })
    const v = knownView(c)
    expect(v.armorElement).toBe('fire')      // revealed → true value
    expect(v.dodgePeriod).toBe(null)         // still masked
    expect(v.skills).toEqual([])             // still masked
  })

  it('is memo-safe: same intel object caches, a fresh object self-invalidates', () => {
    const c = combatant({ armorElement: 'fire', intel: {} })
    const first = knownView(c)
    expect(knownView(c)).toBe(first)         // cache hit for the same (combatant, intel)
    c.intel = { armor: true }                // host installs a fresh object
    const second = knownView(c)
    expect(second).not.toBe(first)           // stale view discarded
    expect(second.armorElement).toBe('fire')
  })
})

describe('estimateDamageVs — first contact misjudges, reveal sharpens', () => {
  // A fire attacker vs WATER armor is resisted (0.75×); an unknown armor prices
  // as neutral (1×), so the party over-values the hit until it learns.
  const caster = () => combatant({ id: 'a', str: 20, attackElement: 'fire' })
  const skill = attackSkill({ damageFormula: 'str * 1', element: 'fire' })

  it('absent intel === fully-revealed intel === omniscient truth', () => {
    const omniscient = estimateDamageVs(caster(), combatant({ id: 't', def: 4, armorElement: 'water' }), skill)
    const revealed = estimateDamageVs(caster(), combatant({ id: 't', def: 4, armorElement: 'water', intel: { ...FULL } }), skill)
    expect(revealed).toBe(omniscient)
  })

  it('present-but-empty intel misprices (neutral prior beats the true resist)', () => {
    const truth = estimateDamageVs(caster(), combatant({ id: 't', def: 4, armorElement: 'water' }), skill)
    const masked = estimateDamageVs(caster(), combatant({ id: 't', def: 4, armorElement: 'water', intel: {} }), skill)
    expect(masked).toBeGreaterThan(truth)    // thinks the fire hit lands full; reality resists it
  })

  it('revealing the armor field alone collapses the estimate onto truth', () => {
    const truth = estimateDamageVs(caster(), combatant({ id: 't', def: 4, armorElement: 'water' }), skill)
    const learned = estimateDamageVs(caster(), combatant({ id: 't', def: 4, armorElement: 'water', intel: { armor: true } }), skill)
    expect(learned).toBe(truth)
  })
})

describe('knownCapability — an unrevealed kit prices as a bare attacker', () => {
  it('masks skill reach/sustain until the kit is revealed', () => {
    const withKit = combatant({ str: 10, skills: [attackSkill({ range: 8, damageFormula: 'str * 5' })] })
    const trueCap = computeCapability(withKit)
    const maskedCap = computeCapability(knownView(combatant({ str: 10, skills: [attackSkill({ range: 8, damageFormula: 'str * 5' })], intel: {} })))
    expect(maskedCap.reach).toBeLessThan(trueCap.reach)               // the 8-reach nuke is invisible
    expect(maskedCap.sustainedDamage).toBeLessThan(trueCap.sustainedDamage)
  })
})

const enemy = (over: Partial<EngineUnitInput> = {}): EngineUnitInput =>
  eu({ id: 'goblin', name: 'Goblin', team: 'enemy', skills: [], ...over })

describe('snapshots carry serialization-time knowledge', () => {
  it('a battle with NO intel serializes byte-identical to a pre-intel token', () => {
    const setup = { playerUnits: [eu({ id: 'hero' })], enemyUnits: [enemy()] }
    const clean = serializeBattle(createBattle(setup))

    // A battle that HELD intel then had it cleared must produce the same token —
    // absent intel = fully known, no residue in the snapshot.
    const b = createBattle({ playerUnits: [eu({ id: 'hero' })], enemyUnits: [enemy({ intel: {} })] })
    setCombatantIntel(b, 'goblin', undefined)
    expect(serializeBattle(b)).toBe(clean)
    expect(clean).not.toContain('intel')
  })

  it('a present mask round-trips through serialize → deserialize', () => {
    const b = createBattle({ playerUnits: [eu({ id: 'hero' })], enemyUnits: [enemy({ intel: { armor: true } })] })
    const g0 = b.combatants.find((c) => c.id === 'goblin')!
    expect(g0.intel).toEqual({ armor: true })
    expect(g0.knownCapability).toBeTruthy()      // derived beside capability

    const back = deserializeBattle(serializeBattle(b))
    const g1 = back.combatants.find((c) => c.id === 'goblin')!
    expect(g1.intel).toEqual({ armor: true })    // knowledge held at serialization time
    expect(g1.knownCapability).toBeTruthy()      // re-derived on load (never serialized)
  })

  it('a legacy token (no intel) deserializes to omniscient combatants', () => {
    const legacy = serializeBattle(createBattle({ playerUnits: [eu({ id: 'hero' })], enemyUnits: [enemy()] }))
    const back = deserializeBattle(legacy)
    const g = back.combatants.find((c) => c.id === 'goblin')!
    expect(g.intel).toBeUndefined()
    expect(g.knownCapability).toBeUndefined()
    expect(knownView(g)).toBe(g)
  })
})

describe('setCombatantIntel — the live host seam', () => {
  it('sets a fresh mask + masked capability, and undefined restores omniscience', () => {
    const b = createBattle({ playerUnits: [eu({ id: 'hero' })], enemyUnits: [enemy({ skills: [] })] })
    expect(setCombatantIntel(b, 'goblin', {})).toBe(true)
    const g = b.combatants.find((c) => c.id === 'goblin')!
    expect(g.intel).toEqual({})
    expect(g.knownCapability).toBeTruthy()

    setCombatantIntel(b, 'goblin', undefined)
    expect(g.intel).toBeUndefined()
    expect(g.knownCapability).toBeUndefined()
    expect(setCombatantIntel(b, 'nobody', {})).toBe(false)
  })
})
