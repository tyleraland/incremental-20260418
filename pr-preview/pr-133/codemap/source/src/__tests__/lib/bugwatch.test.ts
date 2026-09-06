// §bugwatch: the live bug detectors — a stuck hero (not moving/fighting outside town
// with enemies present) and state invariants (negative stock, HP over max, an
// over-capacity pack). Pure functions; no engine mutation.
import { describe, it, expect } from 'vitest'
import { detectStuck, detectInvariants, STUCK_ROUNDS, type StuckEntry } from '@/lib/bugwatch'
import type { BattleState, Combatant } from '@/engine'
import { WEIGHT_LIMIT } from '@/proto/economy'
import { useGameStore } from '@/stores/useGameStore'
import { makeUnit, resetStore, tick } from '../helpers'

// A minimal combatant with just the fields the detector reads.
const combatant = (o: Partial<Combatant> & { id: string; team: Combatant['team'] }): Combatant => ({
  hp: 100, alive: true, pos: { x: 1, y: 1 }, moveOrder: null, lastDamageRound: -1e9, name: o.id,
  ...o,
} as Combatant)

const battle = (round: number, combatants: Combatant[], peaceful = false): BattleState =>
  ({ round, combatants, peaceful } as BattleState)

const hero = (over: Partial<Combatant> = {}) => combatant({ id: 'h1', team: 'player', name: 'Hero', ...over })
const foe = () => combatant({ id: 'm1', team: 'enemy', name: 'Slime' })

describe('detectStuck', () => {
  // Step the same battle N times with the hero pinned at one spot (never fighting),
  // feeding the watch state forward, and report the round it finally flags.
  const snap = () => 'BSNAP.test'   // stub the serializer — we test detection, not serialization
  const runPinned = (rounds: number, opts: { peaceful?: boolean; enemies?: boolean; heroOver?: Partial<Combatant> } = {}) => {
    let watch: Record<string, StuckEntry> = {}
    let fired = false
    for (let r = 0; r < rounds; r++) {
      const combatants = [hero(opts.heroOver), ...(opts.enemies === false ? [] : [foe()])]
      const res = detectStuck({ field: battle(r, combatants, opts.peaceful) }, watch, snap)
      watch = res.next
      if (res.bugs.length > 0) fired = true
    }
    return fired
  }

  it('flags a hero that has not moved or fought for STUCK_ROUNDS with enemies present', () => {
    expect(runPinned(STUCK_ROUNDS + 2)).toBe(true)
  })

  it('does not flag before STUCK_ROUNDS elapse', () => {
    expect(runPinned(STUCK_ROUNDS - 1)).toBe(false)
  })

  it('never flags inside a peaceful town', () => {
    expect(runPinned(STUCK_ROUNDS + 5, { peaceful: true })).toBe(false)
  })

  it('never flags when there are no living enemies to fight', () => {
    expect(runPinned(STUCK_ROUNDS + 5, { enemies: false })).toBe(false)
  })

  it('does not flag a hero that is actively fighting in place (recent damage)', () => {
    // lastDamageRound tracks the current round each step → always "engaged recently".
    let watch: Record<string, StuckEntry> = {}
    let fired = false
    for (let r = 0; r < STUCK_ROUNDS + 5; r++) {
      const res = detectStuck({ field: battle(r, [hero({ lastDamageRound: r }), foe()]) }, watch, snap)
      watch = res.next
      if (res.bugs.length > 0) fired = true
    }
    expect(fired).toBe(false)
  })

  it('resets idle time when the hero moves', () => {
    let watch: Record<string, StuckEntry> = {}
    let fired = false
    for (let r = 0; r < STUCK_ROUNDS + 5; r++) {
      const h = hero({ pos: { x: r % 3, y: 1 } })   // jiggles between 3 cells → never idle long
      const res = detectStuck({ field: battle(r, [h, foe()]) }, watch, snap)
      watch = res.next
      if (res.bugs.length > 0) fired = true
    }
    expect(fired).toBe(false)
  })

  it('does not accumulate idle time on an off-screen battle whose round is frozen', () => {
    // Same round every tick (battle not stepped) → the hero must never read as idle.
    let watch: Record<string, StuckEntry> = {}
    let fired = false
    for (let t = 0; t < STUCK_ROUNDS + 20; t++) {
      const res = detectStuck({ field: battle(3, [hero(), foe()]) }, watch, snap)  // round pinned at 3
      watch = res.next
      if (res.bugs.length > 0) fired = true
    }
    expect(fired).toBe(false)
  })

  it('banks a stuck bug only once per incident (not every round after)', () => {
    let watch: Record<string, StuckEntry> = {}
    let count = 0
    for (let r = 0; r < STUCK_ROUNDS + 10; r++) {
      const res = detectStuck({ field: battle(r, [hero(), foe()]) }, watch, snap)
      watch = res.next
      count += res.bugs.length
    }
    expect(count).toBe(1)
  })
})

describe('detectInvariants', () => {
  it('flags a negative stash quantity', () => {
    const v = detectInvariants([], [], [{ id: 'drop-x', name: 'X', quantity: -3 }], {})
    expect(v.map((x) => x.bug.kind)).toContain('negative-item')
  })

  it('flags HP over maxHp', () => {
    const u = makeUnit({ id: 'u1', health: 99999 })
    const v = detectInvariants([u], [], [], {})
    expect(v.map((x) => x.bug.kind)).toContain('hp-over-max')
  })

  it('flags an over-capacity loot pack', () => {
    const v = detectInvariants([], [], [], { u1: { 'drop-golem-core': Math.ceil(WEIGHT_LIMIT / 80) + 5 } })
    expect(v.map((x) => x.bug.kind)).toContain('overweight-pack')
  })

  it('flags a negative pack quantity', () => {
    const v = detectInvariants([], [], [], { u1: { 'drop-slime-gel': -1 } })
    expect(v.map((x) => x.bug.kind)).toContain('negative-pack')
  })

  it('is clean for healthy state', () => {
    const u = makeUnit({ id: 'u1', health: 50 })
    expect(detectInvariants([u], [], [{ id: 'm-gold', name: 'Gold', quantity: 100 }], { u1: { 'drop-slime-gel': 3 } })).toEqual([])
  })
})

// The live tick runs the detectors, banks new incidents into `bugReports`, and a
// store subscribe persists them to their own localStorage key.
describe('bug watch — live tick wiring', () => {
  it('banks a broken invariant on the tick and persists it', () => {
    localStorage.removeItem('bugReports')
    resetStore({
      ticks: 9,   // → newTicks 10, a multiple of INVARIANT_EVERY_TICKS, so invariants run
      miscItems: [{ id: 'drop-boar-hide', name: 'Hide', quantity: -2 }],   // an impossible negative stock
    })
    tick()

    const reports = useGameStore.getState().bugReports
    expect(reports.length).toBe(1)
    expect(reports[0].kind).toBe('negative-item')
    // Persisted to its own key (survives reload), not the game save envelope.
    expect(JSON.parse(localStorage.getItem('bugReports')!)[0].kind).toBe('negative-item')
  })

  it('banks the same persistent invariant only once, not every check', () => {
    resetStore({ ticks: 0, miscItems: [{ id: 'drop-boar-hide', name: 'Hide', quantity: -2 }] })
    for (let i = 0; i < 25; i++) tick()   // crosses INVARIANT_EVERY_TICKS twice
    expect(useGameStore.getState().bugReports.filter((r) => r.kind === 'negative-item').length).toBe(1)
  })
})
