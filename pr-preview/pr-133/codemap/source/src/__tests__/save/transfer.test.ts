// Whole-game export/import + the battlefield-scoped repro token, driven through
// the live store (the way the Time-tab UI and the BattleView ⎘-state button do).
import { describe, expect, it, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { exportSave, importSave, exportBattle } from '@/save'
import { createBattle, advanceRound, deserializeBattle, buildEngineSkill, type BattleState } from '@/engine'
import { makeUnit, resetStore } from '../helpers'
import { eu } from '../engine/helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

beforeEach(() => resetStore())

describe('whole-game export / import', () => {
  it('exports a v1: string and re-imports it into a fresh store', () => {
    resetStore({
      units: [makeUnit({ id: 'u1', name: 'Ada', locationId: 'beach-1', health: 77 })],
      monsterDefeated: { slime: 9 },
      ticks: 123,
    })
    const str = exportSave()
    expect(str).toMatch(/^v1:/)

    resetStore({ units: [], monsterDefeated: {}, ticks: 0 })
    expect(importSave(str)).toBe(true)
    const s = useGameStore.getState()
    expect(s.units.find((u) => u.id === 'u1')?.health).toBe(77)
    expect(s.monsterDefeated.slime).toBe(9)
    expect(s.ticks).toBe(123)
  })

  it('carries live battles across an export/import', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'mage', name: 'Mage', int: 30, rangedRange: 6, skills: [buildEngineSkill('fire-bolt', 1)!] })],
      enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 80, hp: 80 })],
      mode: 'open', cols: 30, rows: 30,
    })
    find(b, 'mage').pos = { x: 6, y: 6 }
    find(b, 'slime#0').pos = { x: 18, y: 18 }
    for (let r = 0; r < 4; r++) advanceRound(b)
    resetStore({ battles: { 'beach-1': b } })

    const str = exportSave()
    resetStore({ battles: {} })
    importSave(str)
    const reloaded = useGameStore.getState().battles['beach-1']
    expect(reloaded).toBeDefined()
    expect(reloaded.round).toBe(b.round)
    expect(find(reloaded, 'mage').pos).toEqual(find(b, 'mage').pos)
  })

  it('importSave returns false on garbage and leaves the store untouched', () => {
    resetStore({ ticks: 55 })
    expect(importSave('not a save')).toBe(false)
    expect(useGameStore.getState().ticks).toBe(55)
  })
})

describe('battlefield-scoped repro token', () => {
  it('exportBattle returns that location\'s battle, deserializable on its own', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'fighter', name: 'Fighter', str: 20 })],
      enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 50, hp: 50 })],
    })
    find(b, 'fighter').pos = { x: 7, y: 5 }
    advanceRound(b)
    resetStore({ battles: { L: b } })

    const token = exportBattle('L')!
    expect(token.startsWith('BSNAP.')).toBe(true)
    const reloaded = deserializeBattle(token)
    expect(find(reloaded, 'fighter').pos).toEqual(find(b, 'fighter').pos)
    expect(find(reloaded, 'slime#0').hp).toBe(find(b, 'slime#0').hp)
  })

  it('exportBattle returns null when no battle is running there', () => {
    resetStore({ battles: {} })
    expect(exportBattle('nowhere')).toBeNull()
  })
})
