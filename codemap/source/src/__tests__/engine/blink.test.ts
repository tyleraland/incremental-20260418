// M4 of movement-action-coupling.md: Blink — one movement capability, three
// seams. (1) Escape: a cornered retreat spends a ready teleport instead of
// shuffling in the pocket. (2) Pathing: steerAround/canReach with `caps` treat
// a teleport as an edge — cliffs (movement-only barriers) stop blocking.
// (3) Overworld: gated travel edges live in travelGraph tests. Deterministic
// like everything else in the engine.
import { describe, it, expect } from 'vitest'
import {
  createBattle, advanceRound, canReach, serializeBattle, deserializeBattle,
  distance, type BattleState, type Barrier, type MoveAbility,
} from '@/engine'
import { attackSkill, eu } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const BLINK: MoveAbility = { kind: 'teleport', range: 8, cooldown: 25, needsLoS: true }

describe('blink escape (cornered retreat)', () => {
  // A cliff pocket (movement blocks, sight doesn't — so a LoS-gated jump can
  // leave it): kiter mage backs into the dead end ahead of a melee chaser.
  const pocket = (moveAbilities: MoveAbility[]) => {
    const barriers: Barrier[] = [
      { x: 11, y: 21, w: 1, h: 8, kind: 'cliff' },   // left arm
      { x: 18, y: 21, w: 1, h: 8, kind: 'cliff' },   // right arm
      { x: 11, y: 28, w: 8, h: 1, kind: 'cliff' },   // back wall
    ]
    const b = createBattle({
      playerUnits: [eu({
        id: 'mage', int: 20, str: 2, rangedRange: 6, maxHp: 400, hp: 400, moveSpeed: 0.9,
        skills: [attackSkill({ id: 'bolt', range: 6, damageFormula: 'int * 1', cooldown: 1, channelTime: 0 })],
        tactics: [{ id: 'kiter', rank: 1 }],
        moveAbilities,
      })],
      enemyUnits: [eu({ id: 'brute', team: 'enemy', str: 8, maxHp: 9999, hp: 9999, moveSpeed: 1.1, meleeRange: 1.4 })],
      barriers, mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'mage').pos = { x: 15, y: 26 }    // deep in the pocket
    find(b, 'brute').pos = { x: 15, y: 16 }   // charging the mouth
    return b
  }

  it('a cornered kiter with Blink jumps out (and starts the cooldown)', () => {
    const b = pocket([{ ...BLINK }])
    let jumped = false
    let prev = { ...find(b, 'mage').pos }
    for (let r = 0; r < 60 && !jumped; r++) {
      advanceRound(b)
      const m = find(b, 'mage')
      if (distance(prev, m.pos) > BLINK.range * 0.6) jumped = true   // a walk step is ≤ ~1 cell — this is a teleport
      prev = { ...m.pos }
    }
    expect(jumped).toBe(true)
    expect(find(b, 'mage').moveAbilityCds['teleport']).toBeGreaterThan(0)
  })

  it('without the ability (or with it on cooldown) it stays walled in', () => {
    const walled = (abilities: MoveAbility[], cd: number) => {
      const b = pocket(abilities)
      if (abilities.length) find(b, 'mage').moveAbilityCds['teleport'] = cd
      let maxStep = 0
      let prev = { ...find(b, 'mage').pos }
      for (let r = 0; r < 30; r++) {
        advanceRound(b)
        const m = find(b, 'mage')
        maxStep = Math.max(maxStep, distance(prev, m.pos))
        prev = { ...m.pos }
      }
      return maxStep
    }
    expect(walled([], 0)).toBeLessThan(3)                     // no ability: only walk steps
    expect(walled([{ ...BLINK }], 999)).toBeLessThan(3)       // on cooldown: same
  })

  it('replays deterministically', () => {
    const runPositions = () => {
      const b = pocket([{ ...BLINK }])
      for (let r = 0; r < 40; r++) advanceRound(b)
      return b.combatants.map((c) => `${c.id}:${c.pos.x.toFixed(4)},${c.pos.y.toFixed(4)}`).join('|')
    }
    expect(runPositions()).toBe(runPositions())
  })
})

describe('capability-aware pathing (canReach with caps)', () => {
  // A moat splitting the map: unwalkable, but only 3 cells wide.
  const moat = (kind: 'cliff' | 'wall'): Barrier[] => [{ x: 14, y: 0, w: 2, h: 30, kind }]
  const from = { x: 5, y: 15 }
  const to = { x: 25, y: 15 }

  it('a cliff moat blocks walking but not a LoS-gated teleport', () => {
    expect(canReach(from, to, moat('cliff'))).toBe(false)
    expect(canReach(from, to, moat('cliff'), undefined, { teleport: { range: 8, needsLoS: true } })).toBe(true)
  })

  it('a WALL moat still blocks a LoS-gated teleport — but not a blind one', () => {
    expect(canReach(from, to, moat('wall'), undefined, { teleport: { range: 8, needsLoS: true } })).toBe(false)
    expect(canReach(from, to, moat('wall'), undefined, { teleport: { range: 8, needsLoS: false } })).toBe(true)
  })

  it('range is respected — a short teleport cannot bridge a wide gap', () => {
    const wide: Barrier[] = [{ x: 10, y: 0, w: 10, h: 30, kind: 'cliff' }]
    expect(canReach(from, { x: 27, y: 15 }, wide, undefined, { teleport: { range: 3, needsLoS: true } })).toBe(false)
    expect(canReach(from, { x: 27, y: 15 }, wide, undefined, { teleport: { range: 12, needsLoS: true } })).toBe(true)
  })
})

describe('moveAbilities snapshot fidelity', () => {
  it('abilities and cooldowns ride the BSNAP round-trip; legacy defaults are empty', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', moveAbilities: [{ ...BLINK }] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 20, rows: 20,
    })
    find(b, 'a').moveAbilityCds['teleport'] = 7
    const clone = deserializeBattle(serializeBattle(b))
    expect(find(clone, 'a').moveAbilities).toEqual([BLINK])
    expect(find(clone, 'a').moveAbilityCds['teleport']).toBe(7)
    expect(find(clone, 'e').moveAbilities).toEqual([])   // absent input → empty, engine-safe
  })
})
