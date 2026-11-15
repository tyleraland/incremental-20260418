// M4 directives — the game-side seams (tactical-coordination.md §3.5): the
// persisted party slot (worldCodec, beside partyTactics), the store chokepoint
// with curated gating (setPartyDirective, mirroring learnSkill), the unlock
// predicate itself, and the monster seam (a MonsterDef.directive carrier sets
// its team's directive when it spawns).
import { describe, it, expect } from 'vitest'
import { useGameStore, spawnMonsterAt } from '@/stores/useGameStore'
import { worldCodec } from '@/save/worldCodec'
import { isDirectiveUnlocked, DIRECTIVE_UNLOCK_LEVEL } from '@/lib/unlocks'
import { createBattle, DEFAULT_DIRECTIVE_ID } from '@/engine'
import { makeUnit, resetStore } from '../helpers'

describe('worldCodec: the party directive slot', () => {
  it('round-trips partyDirective beside partyTactics', () => {
    expect(worldCodec.roundTrip({ partyDirective: 'protect' }).partyDirective).toBe('protect')
  })

  it('legacy saves (no field) load as the default Skirmish', () => {
    const legacy = worldCodec.deserialize({ ticks: 5, partyTactics: [], progressionMode: 'sandbox', savedAt: Date.now() } as never)
    expect(legacy.partyDirective).toBe(DEFAULT_DIRECTIVE_ID)
    expect(worldCodec.empty().partyDirective).toBe(DEFAULT_DIRECTIVE_ID)
  })
})

describe('store: setPartyDirective (curated chokepoint)', () => {
  it('sandbox: any registry directive; unknown ids rejected', () => {
    resetStore({ progressionMode: 'sandbox', partyDirective: DEFAULT_DIRECTIVE_ID })
    const { setPartyDirective } = useGameStore.getState()
    setPartyDirective('not-a-directive')
    expect(useGameStore.getState().partyDirective).toBe(DEFAULT_DIRECTIVE_ID)
    setPartyDirective('assassinate')
    expect(useGameStore.getState().partyDirective).toBe('assassinate')
  })

  it('curated: locked until a hero reaches the directive level; skirmish always open', () => {
    resetStore({ progressionMode: 'curated', partyDirective: DEFAULT_DIRECTIVE_ID, units: [makeUnit({ id: 'u1', level: 2 })] })
    const { setPartyDirective } = useGameStore.getState()
    setPartyDirective('assassinate')   // needs level 9 — rejected
    expect(useGameStore.getState().partyDirective).toBe(DEFAULT_DIRECTIVE_ID)

    resetStore({ progressionMode: 'curated', partyDirective: DEFAULT_DIRECTIVE_ID, units: [makeUnit({ id: 'u1', level: DIRECTIVE_UNLOCK_LEVEL['assassinate'] })] })
    useGameStore.getState().setPartyDirective('assassinate')
    expect(useGameStore.getState().partyDirective).toBe('assassinate')
    useGameStore.getState().setPartyDirective('skirmish')
    expect(useGameStore.getState().partyDirective).toBe('skirmish')
  })
})

describe('unlocks: isDirectiveUnlocked', () => {
  const lowbies = [{ level: 1 }, { level: 3 }]
  it('sandbox is fully open; curated gates on the best hero level', () => {
    expect(isDirectiveUnlocked('sandbox', 'assassinate', lowbies)).toBe(true)
    expect(isDirectiveUnlocked('curated', 'skirmish', lowbies)).toBe(true)
    expect(isDirectiveUnlocked('curated', 'hold-the-line', lowbies)).toBe(false)
    expect(isDirectiveUnlocked('curated', 'hold-the-line', [{ level: DIRECTIVE_UNLOCK_LEVEL['hold-the-line'] }])).toBe(true)
    // Unknown ids stay locked in curated (safe default for future directives).
    expect(isDirectiveUnlocked('curated', 'mystery-directive', [{ level: 99 }])).toBe(false)
  })
})

describe('monster seam: a MonsterDef.directive carrier sets its team directive', () => {
  it('spawning the Elite Rogue brings Assassinate to the enemy team; plain monsters bring nothing', () => {
    const battle = createBattle({ playerUnits: [], enemyUnits: [], mode: 'open', cols: 40, rows: 40 })
    spawnMonsterAt(battle, 'slime', { x: 10, y: 10 })
    expect(battle.directives).toBeUndefined()
    spawnMonsterAt(battle, 'elite-rogue', { x: 12, y: 10 })
    expect(battle.directives?.enemy).toBe('assassinate')
    // First carrier wins — another carrier can't overwrite a held directive.
    spawnMonsterAt(battle, 'elite-rogue', { x: 14, y: 10 })
    expect(battle.directives?.enemy).toBe('assassinate')
  })
})
