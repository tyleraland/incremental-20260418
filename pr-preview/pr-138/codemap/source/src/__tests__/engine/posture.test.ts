// §posture (movement-action-coupling.md §levers): the player's behavior dial —
// one id, a row of policy weights (engine/tuning.ts POSTURES) that every
// plan-layer scorer reads. bold = damage first, steady = shipped defaults,
// wary = safety first. Absent posture ≡ 'steady' ≡ pre-posture behavior.
import { describe, it, expect } from 'vitest'
import {
  POSTURES, postureOf, scoreCandidate, corridorExposure, relinkCombatant,
  createBattle, advanceRound, issueMoveOrder, serializeBattle, deserializeBattle, distance,
  type BattleState, type Combatant,
} from '@/engine'
import { combatant, attackSkill, eu } from './helpers'

const stateOf = (combatants: Combatant[]) => ({ combatants, barriers: [] } as unknown as BattleState)
const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

describe('the POSTURES table', () => {
  it('rows are ordered bold → steady → wary on every column', () => {
    expect(POSTURES.bold.exposureW).toBeLessThan(POSTURES.steady.exposureW)
    expect(POSTURES.steady.exposureW).toBeLessThan(POSTURES.wary.exposureW)
    expect(POSTURES.bold.travelBudget).toBeGreaterThan(POSTURES.steady.travelBudget)
    expect(POSTURES.steady.travelBudget).toBeGreaterThan(POSTURES.wary.travelBudget)
    expect(POSTURES.bold.blinkGain).toBeGreaterThan(POSTURES.steady.blinkGain)
    expect(POSTURES.steady.blinkGain).toBeGreaterThan(POSTURES.wary.blinkGain)
  })
  it('absent posture reads as steady (legacy snapshots, unset units)', () => {
    expect(postureOf(combatant({ id: 'x' }))).toBe(POSTURES.steady)
    expect(postureOf(combatant({ id: 'x', posture: 'wary' }))).toBe(POSTURES.wary)
  })
})

describe('posture in candidate scoring', () => {
  it('bold ignores an exposed firing spot that wary refuses', () => {
    const bolt = attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })
    const mk = (posture?: Combatant['posture']) =>
      combatant({ id: 'm', int: 20, str: 2, pos: { x: 10, y: 10 }, skills: [{ ...bolt }], lockedTargetId: 'e', posture })
    const foe = combatant({ id: 'e', team: 'enemy', pos: { x: 10, y: 16 }, moveSpeed: 0 })
    const flanker = combatant({ id: 'f', team: 'enemy', str: 30, rangedRange: 4, moveSpeed: 0, pos: { x: 4, y: 11 } })
    const spot = { pos: { x: 7, y: 11 }, kind: 'close' as const }   // fires on 'e', inside the flanker's reach
    const scoreAs = (p?: Combatant['posture']) => {
      const me = mk(p)
      return scoreCandidate(stateOf([me, foe, flanker]), me, spot, foe, 5.5)
    }
    expect(scoreAs('bold')).toBeGreaterThan(scoreAs('steady'))   // exposure costs bold nothing
    expect(scoreAs('steady')).toBeGreaterThan(scoreAs('wary'))   // and wary the most
    expect(scoreAs(undefined)).toBe(scoreAs('steady'))           // default ≡ steady
  })
})

describe('posture in travel pricing (the toll-ring gradient)', () => {
  // One ring, one HP pool — the posture alone flips plow vs clear-first.
  const gauntlet = (posture: Combatant['posture'], heroHp: number) => {
    const dest = { x: 22, y: 20 }
    const foes = [110, 140, 170, 200, 230].map((deg) => {
      const a = (deg * Math.PI) / 180
      return { x: dest.x + 5 * Math.cos(a), y: dest.y + 5 * Math.sin(a) }
    })
    const b = createBattle({
      playerUnits: [eu({ id: 'a', team: 'player', visionRange: 20, moveSpeed: 0.9, str: 30, maxHp: heroHp, hp: heroHp, posture })],
      enemyUnits: foes.map((_, i) => eu({ id: `e${i}`, team: 'enemy', moveSpeed: 0, str: 12, rangedRange: 4, maxHp: 9999, hp: 9999 })),
      mode: 'open', cols: 40, rows: 40,
    })
    find(b, 'a').pos = { x: 4, y: 20 }
    foes.forEach((p, i) => { find(b, `e${i}`).pos = p })
    // Price the corridor once, from the start line, to calibrate expectations.
    const cost = corridorExposure(b, find(b, 'a'), dest, 0.9)
    issueMoveOrder(b, 'a', dest, 'avoid')
    let sawClearing = false, arrived = false
    for (let r = 0; r < 200 && !arrived; r++) {
      advanceRound(b)
      if (find(b, 'a').travelClearing) sawClearing = true
      if (distance(find(b, 'a').pos, dest) < 0.8) arrived = true
    }
    return { sawClearing, cost }
  }

  it('the same corridor is forced by bold and cleared by wary', () => {
    // Calibrate HP so the price sits between the wary and bold budgets.
    const probe = gauntlet('steady', 10_000)   // huge budget → never clears; we just want `cost`
    expect(probe.sawClearing).toBe(false)
    const hp = Math.round(probe.cost / ((POSTURES.bold.travelBudget + POSTURES.wary.travelBudget) / 2))
    expect(gauntlet('bold', hp).sawClearing).toBe(false)   // budget covers it — plow through
    expect(gauntlet('wary', hp).sawClearing).toBe(true)    // too rich for wary — fight it down first
  })
})

describe('posture plumbing', () => {
  it('rides the snapshot and defaults absent on legacy units', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', posture: 'wary' })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 20, rows: 20,
    })
    const clone = deserializeBattle(serializeBattle(b))
    expect(find(clone, 'a').posture).toBe('wary')
    expect(find(clone, 'e').posture).toBeUndefined()
  })

  it('relinkCombatant picks up a posture (and moveAbilities) edit mid-battle', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a' })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 20, rows: 20,
    })
    const c = find(b, 'a')
    expect(c.posture).toBeUndefined()
    relinkCombatant(c, eu({ id: 'a', posture: 'bold', moveAbilities: [{ kind: 'teleport', range: 8, cooldown: 25, needsLoS: true }] }))
    expect(c.posture).toBe('bold')
    expect(c.moveAbilities).toHaveLength(1)
  })
})
