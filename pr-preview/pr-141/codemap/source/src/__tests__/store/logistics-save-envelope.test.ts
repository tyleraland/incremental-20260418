// §logistics graduated into the main save envelope: carried packs + expedition
// plans now round-trip through the whole-game exportSave/importSave string (the
// `logisticsCodec` slice), and a missing slice restores clean defaults. This is
// the export/import-durability acceptance for the pack/loadout persistence move.
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/useGameStore'
import { saveGame, loadGame } from '@/lib/save'
import { ALL_CODECS } from '@/save'
import { logisticsCodec } from '@/save/logisticsCodec'
import { makeUnit, resetStore } from '../helpers'

const g = () => useGameStore.getState()

beforeEach(() => {
  resetStore({ units: [makeUnit({ id: 'u1' })] })
  useGameStore.setState({ expeditions: {}, packs: {}, packsSeeded: false, expeditionReturnMode: 'individual' })
})

describe('logistics survives the whole-game save envelope', () => {
  it('exportSave → importSave restores packs + plan (fresh runtime)', () => {
    g().simulateHunt('u1', [{ itemId: 'drop-boar-hide', qty: 4 }])
    g().addExpeditionSupply('u1', 'potion-hp')
    g().setExpeditionSupplyQty('u1', 'potion-hp', 20)
    g().commitExpeditionStep('u1', { suppliesLeft: 0.2, status: 'returning', locationId: 'boar-meadow' })
    useGameStore.setState({ packsSeeded: true })

    const saved = saveGame(g(), ALL_CODECS)
    // Wipe the live state, then load the envelope back.
    useGameStore.setState({ packs: {}, packsSeeded: false, expeditions: {}, expeditionReturnMode: 'individual' })
    useGameStore.setState(loadGame(saved, ALL_CODECS))

    expect(g().packs['u1']['drop-boar-hide']).toBe(4)
    expect(g().packsSeeded).toBe(true)
    expect(g().expeditions['u1'].loadout['potion-hp'].qty).toBe(20)
    // Runtime is re-established by the driver, not persisted.
    expect(g().expeditions['u1'].suppliesLeft).toBe(1)
    expect(g().expeditions['u1'].status).toBe('hunting')
    expect(g().expeditions['u1'].locationId).toBeNull()
  })

  it('a save with no logistics slice restores empty defaults', () => {
    // Build an envelope from every codec EXCEPT logistics, then load with the full set.
    const others = ALL_CODECS.filter((c) => c.key !== logisticsCodec.key)
    g().simulateHunt('u1', [{ itemId: 'drop-boar-hide', qty: 9 }])
    const saved = saveGame(g(), others)
    const restored = loadGame(saved, ALL_CODECS)
    expect(restored.packs).toEqual({})
    expect(restored.packsSeeded).toBe(false)
    expect(restored.expeditions).toEqual({})
    expect(restored.expeditionReturnMode).toBe('individual')
  })
})
