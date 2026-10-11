// Live battles + item sockets survive a whole-game save round-trip, and the
// battlefield-repro token composes out of the same machinery.
import { describe, expect, it } from 'vitest'
import { saveGame, loadGame } from '@/lib/save'
import { battlesCodec, socketsCodec, ALL_CODECS } from '@/save'
import { createBattle, advanceRound, buildEngineSkill, type BattleState } from '@/engine'
import { eu } from '../engine/helpers'
import type { GameState } from '@/stores/useGameStore'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

function liveBattle(): BattleState {
  const b = createBattle({
    playerUnits: [eu({ id: 'mage', name: 'Mage', int: 30, rangedRange: 6, skills: [buildEngineSkill('fire-bolt', 1)!], tactics: [{ id: 'kiter', rank: 1 }] })],
    enemyUnits: [eu({ id: 'slime#0', name: 'Slime', team: 'enemy', maxHp: 80, hp: 80 })],
    mode: 'open', cols: 30, rows: 30,
  })
  find(b, 'mage').pos = { x: 5, y: 5 }
  find(b, 'slime#0').pos = { x: 18, y: 18 }
  for (let r = 0; r < 4; r++) advanceRound(b)
  return b
}

describe('battlesCodec', () => {
  it('round-trips in-progress battles, cooldowns, and spawn timers', () => {
    const battle = liveBattle()
    const state = {
      battles: { 'beach-1': battle },
      battleCooldown: { 'prontera-city': 7 },
      monsterSpawnTimers: { 'beach-1': 22 },
    } as unknown as GameState

    const restored = loadGame(saveGame(state, [battlesCodec]), [battlesCodec])
    const reloaded = restored.battles!['beach-1']
    expect(reloaded).toBeDefined()
    expect(reloaded.round).toBe(battle.round)
    expect(reloaded.mode).toBe('open')
    expect(find(reloaded, 'mage').pos).toEqual(find(battle, 'mage').pos)
    expect(find(reloaded, 'slime#0').hp).toBe(find(battle, 'slime#0').hp)
    expect(restored.battleCooldown).toEqual({ 'prontera-city': 7 })
    expect(restored.monsterSpawnTimers).toEqual({ 'beach-1': 22 })
  })

  it('a reloaded battle keeps stepping deterministically', () => {
    const battle = liveBattle()
    const state = { battles: { L: battle } } as unknown as GameState
    const reloaded = loadGame(saveGame(state, [battlesCodec]), [battlesCodec]).battles!['L']
    // Advance the original and the reloaded copy the same number of rounds.
    for (let r = 0; r < 15; r++) { advanceRound(battle); advanceRound(reloaded) }
    expect(find(reloaded, 'slime#0').hp).toBe(find(battle, 'slime#0').hp)
    expect(find(reloaded, 'mage').pos).toEqual(find(battle, 'mage').pos)
  })

  it('drops an unparseable battle token instead of failing the whole load', () => {
    // Hand-craft a save whose battles slice has a junk token.
    const str = saveGame({ battles: {}, battleCooldown: {}, monsterSpawnTimers: {} } as unknown as GameState, [battlesCodec])
    const env = JSON.parse(atob(str.slice(3)))
    env.slices.battles.d.battles = { L: 'BSNAP.not-valid' }
    const corrupted = `v1:${btoa(JSON.stringify(env))}`
    const restored = loadGame(corrupted, [battlesCodec])
    expect(restored.battles).toEqual({})   // bad battle skipped, load still succeeds
  })

  it('is part of the whole-game ALL_CODECS save', () => {
    const battle = liveBattle()
    const state = { battles: { L: battle }, itemSockets: { 'eq-1': ['card-a'] } } as unknown as GameState
    const restored = loadGame(saveGame(state, ALL_CODECS), ALL_CODECS)
    expect(restored.battles!['L']).toBeDefined()
    expect(restored.itemSockets).toEqual({ 'eq-1': ['card-a'] })   // sockets persisted too
  })
})

describe('socketsCodec', () => {
  it('round-trips itemSockets', () => {
    const state = { itemSockets: { 'eq-7': ['card-x', 'card-y'] } } as unknown as GameState
    const restored = loadGame(saveGame(state, [socketsCodec]), [socketsCodec])
    expect(restored.itemSockets).toEqual({ 'eq-7': ['card-x', 'card-y'] })
  })
})
