// New caster / ambush tactics in isolation (spec §5): Storm Caller (aim AoE at
// the densest cluster), Wary Caster (back off further after repeated interrupts),
// Ambusher (stalk a flank while cloaked).
import { describe, it, expect } from 'vitest'
import {
  TACTIC_REGISTRY, buildStatus, kiteDistanceFor,
  type BattleState, type Combatant,
} from '@/engine'
import { combatant, attackSkill } from './helpers'

const stateOf = (combatants: Combatant[]) => ({ combatants } as unknown as BattleState)
const aoeSkill = () => attackSkill({ id: 'blast', targeting: 'aoe_enemy', aoeRadius: 2 })

describe('Storm Caller (targeting)', () => {
  const tactic = TACTIC_REGISTRY['storm-caller'].targeting!

  it('aims at the centre of the densest enemy cluster', () => {
    const self = combatant({ id: 'p', pos: { x: 0.5, y: 0 }, skills: [aoeSkill()] })
    // A tight trio plus a loner; the caster is far away (safe to channel).
    const c0 = combatant({ id: 'c0', team: 'enemy', pos: { x: 8, y: 8 } })
    const c1 = combatant({ id: 'c1', team: 'enemy', pos: { x: 8.5, y: 8 } })
    const c2 = combatant({ id: 'c2', team: 'enemy', pos: { x: 8, y: 8.5 } })
    const lone = combatant({ id: 'z9', team: 'enemy', pos: { x: 1, y: 12 } })
    const id = tactic(self, stateOf([self, c0, c1, c2, lone]), 1)
    expect(['c0', 'c1', 'c2']).toContain(id)   // the cluster, never the loner
  })

  it('settles for a 2-foe cluster only when safely out of reach', () => {
    const pair = (selfPos: { x: number; y: number }) => {
      const self = combatant({ id: 'p', pos: selfPos, skills: [aoeSkill()] })
      const a = combatant({ id: 'a', team: 'enemy', pos: { x: 8, y: 8 } })
      const b = combatant({ id: 'b', team: 'enemy', pos: { x: 8.6, y: 8 } })
      return { self, st: stateOf([self, a, b]) }
    }
    // Far away → safe → a pair is worth the cast.
    const safe = pair({ x: 0.5, y: 0 })
    expect(['a', 'b']).toContain(tactic(safe.self, safe.st, 1))
    // Right on top of them → not safe → hold out for a fatter cluster (null).
    const danger = pair({ x: 8.2, y: 7.5 })
    expect(tactic(danger.self, danger.st, 1)).toBeNull()
  })

  it('does nothing for a unit with no AoE skill', () => {
    const self = combatant({ id: 'p', pos: { x: 0.5, y: 0 }, skills: [attackSkill()] })   // single-target only
    const c0 = combatant({ id: 'c0', team: 'enemy', pos: { x: 8, y: 8 } })
    const c1 = combatant({ id: 'c1', team: 'enemy', pos: { x: 8.5, y: 8 } })
    expect(tactic(self, stateOf([self, c0, c1]), 1)).toBeNull()
  })
})

describe('Wary Caster (movement)', () => {
  const tactic = TACTIC_REGISTRY['wary-caster'].movement!

  it('stays put (defers to default kiting) until it has actually been interrupted', () => {
    const self = combatant({ id: 'p', rangedRange: 6, interruptedCount: 0 })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 6 } })
    expect(tactic(self, stateOf([self, foe]), 1)).toBeNull()
  })

  it('backs off further from the threat the more it has been interrupted', () => {
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 6 } })
    const gapAt = (count: number) => {
      const self = combatant({ id: 'p', rangedRange: 6, interruptedCount: count })
      return tactic(self, stateOf([self, foe]), 1)!.desiredRange!
    }
    const base = kiteDistanceFor(combatant({ id: 'p', rangedRange: 6 }), foe)
    expect(gapAt(1)).toBeGreaterThan(base)          // wider than a calm kite
    expect(gapAt(3)).toBeGreaterThan(gapAt(1))      // and wider still after more denials
  })

  it('does not apply to a pure melee unit', () => {
    const self = combatant({ id: 'p', rangedRange: 0, str: 20, int: 0, interruptedCount: 2 })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 0.5, y: 6 } })
    expect(tactic(self, stateOf([self, foe]), 1)).toBeNull()
  })
})

describe('Ambusher (movement)', () => {
  const tactic = TACTIC_REGISTRY['ambusher'].movement!

  it('steers toward a flank only while cloaked and holding a target', () => {
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 2.5, y: 8 } })
    const cloaked = combatant({ id: 'p', pos: { x: 2.5, y: 1 }, lockedTargetId: 'e', statuses: [buildStatus('stealthed', 'p')!] })
    const plan = tactic(cloaked, stateOf([cloaked, foe]), 1)
    expect(plan?.toPoint).toBeDefined()

    const seen = combatant({ id: 'p', pos: { x: 2.5, y: 1 }, lockedTargetId: 'e' })   // revealed → normal movement
    expect(tactic(seen, stateOf([seen, foe]), 1)).toBeNull()

    const noTarget = combatant({ id: 'p', pos: { x: 2.5, y: 1 }, statuses: [buildStatus('stealthed', 'p')!] })
    expect(tactic(noTarget, stateOf([noTarget, foe]), 1)).toBeNull()
  })
})
