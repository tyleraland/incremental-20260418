// Reload durability — the proto carry pack (protoStore.packs) and the configured
// expedition plans (expeditionStore.heroes) hydrate from their interim
// localStorage keys at module import, so a hero's in-flight loot and loadout
// survive a page reload. Uses vi.resetModules() to re-run each store's module-init
// hydration against pre-seeded localStorage (the real reload path).
import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => { localStorage.clear(); vi.resetModules() })

describe('proto persistence — hydration on reload', () => {
  it('protoStore hydrates packs (and packsSeeded) from localStorage at import', async () => {
    localStorage.setItem('protoPacks', JSON.stringify({ packs: { u1: { 'drop-boar-hide': 4 } }, packsSeeded: true }))
    const { useProtoStore } = await import('@/proto/protoStore')
    expect(useProtoStore.getState().packs.u1['drop-boar-hide']).toBe(4)
    expect(useProtoStore.getState().packsSeeded).toBe(true)
  })

  it('expeditionStore hydrates the plan (with fresh runtime) from localStorage at import', async () => {
    localStorage.setItem('protoExpeditions', JSON.stringify({
      heroes: {
        u1: {
          loadout: { 'potion-hp': { qty: 25, storage: true, merchant: false } },
          lootCats: ['material'], returnOn: ['pack-full'], supplyMode: 'all',
          shareLoot: false, acceptLoot: true, shareSupplies: false, acceptSupplies: true,
          returnTown: 'prontera-city',
        },
      },
      returnMode: 'group',
    }))
    const { useExpeditionStore } = await import('@/proto/expeditionStore')
    const h = useExpeditionStore.getState().heroes.u1
    // Configured plan is restored…
    expect(h.loadout['potion-hp'].qty).toBe(25)
    expect(h.returnTown).toBe('prontera-city')
    expect(h.supplyMode).toBe('all')
    expect(useExpeditionStore.getState().returnMode).toBe('group')
    // …while the per-tick runtime resets to fresh (the driver re-establishes it).
    expect(h.suppliesLeft).toBe(1)
    expect(h.status).toBe('hunting')
    expect(h.locationId).toBeNull()
  })
})
