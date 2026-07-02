import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { CONSUMABLE_REGISTRY } from '@/data/consumables'
import { MERCHANT_REGISTRY, merchantLocation, buyPriceFor } from '@/data/merchants'
import type { Location, Unit } from '@/types'
import { useProtoStore } from './protoStore'
import { heroCarried, packFullEnough, GOLD_ID, WEIGHT_LIMIT } from './economy'
import { useExpeditionStore, freshHero, type HeroExpedition } from './expeditionStore'
import {
  isHuntable, isCity, nearestCity, categorize, supplyState, suppliesDry, type Loadout,
} from './expedition'

// How long a returned hero parks in town (depositing loot + restocking) before
// redeploying to where they were hunting. Instant deploy for now — open-world land
// routing replaces the teleport later (gated on the store's deployMode lever).
export const TOWN_RESUPPLY_TICKS = TICKS_PER_SECOND * 10

// Restock a hero's MERCHANT-sourced supplies while they're standing in `cityId`:
// buy each shortfall (loadout target − carried − in-stash) from a merchant at this
// town that stocks it, paying gold, into the guild stash. The game tick's in-town
// pack reconcile then withdraws from the stash into the hero's pack toward target.
// (Storage-sourced supplies are served by the stash alone — no purchase.)
export function buyMerchantSupplies(unit: Unit, cityId: string, loadout: Loadout): void {
  const ticks = useGameStore.getState().ticks
  for (const [itemId, entry] of Object.entries(loadout)) {
    if (!entry.merchant || entry.qty <= 0 || !(itemId in CONSUMABLE_REGISTRY)) continue
    const carried = unit.pack?.find((p) => p.itemId === itemId)?.count ?? 0
    const inStash = useGameStore.getState().miscItems.find((m) => m.id === itemId)?.quantity ?? 0
    let need = entry.qty - carried - inStash
    if (need <= 0) continue
    for (const m of Object.values(MERCHANT_REGISTRY)) {
      if (need <= 0) break
      if (merchantLocation(m, ticks) !== cityId) continue
      const stock = m.stock.find((s) => s.id === itemId)
      if (!stock) continue
      const price = buyPriceFor(m, stock.price, unit)
      const gold = useGameStore.getState().miscItems.find((x) => x.id === GOLD_ID)?.quantity ?? 0
      const buy = Math.min(need, Math.floor(gold / Math.max(1, price)))
      if (buy <= 0) continue
      useGameStore.getState().grantMiscItem(GOLD_ID, -buy * price)
      useGameStore.getState().grantMiscItem(itemId, buy)
      need -= buy
    }
  }
}

type Drop = { itemId: string; qty: number }
type Member = { u: Unit; he: HeroExpedition }

// Hand pooled loot to the accepters, always topping up the least-full first so the
// party fills evenly (the "share the burden" behaviour). Fill is total carry (loot
// pack + carried consumables). Items with no accepter / no room are left behind.
function distribute(pool: Drop[], accepters: Member[]) {
  const proto = useProtoStore.getState()
  for (const item of pool) {
    let best: Member | null = null
    let bestFill = Infinity
    for (const m of accepters) {
      const w = heroCarried(useProtoStore.getState().packs[m.u.id], m.u.pack)
      if (w < WEIGHT_LIMIT && w < bestFill) { bestFill = w; best = m }
    }
    if (!best) break
    proto.simulateHunt(best.u.id, [item])
  }
}


// The town a returning hero heads to: their chosen `returnTown`, else the nearest
// city to where they were hunting.
function returnTownFor(he: HeroExpedition, fromId: string | null, locations: Location[]): Location | null {
  if (he.returnTown) { const t = locations.find((l) => l.id === he.returnTown); if (t) return t }
  return nearestCity(fromId, locations)
}

// §logistics — the global driver. Mounted once (ProtoApp); each game tick it
// advances every deployed hero's run, with party loot/supply sharing folded in.
export function useExpeditionDriver() {
  const ticks = useGameStore((s) => s.ticks)
  const last = useRef(ticks)

  useEffect(() => {
    const dt = Math.min(2, Math.max(0, (ticks - last.current) / TICKS_PER_SECOND))
    last.current = ticks
    if (dt <= 0) return

    const g = useGameStore.getState()
    const proto = useProtoStore.getState()
    const exp = useExpeditionStore.getState()
    const locById = new Map(g.locations.map((l) => [l.id, l]))
    const groupReturnLocs = new Set<string>()
    const groups = new Map<string, Member[]>()

    // §loot: drain the REAL kill drops the game tick credited to each hero
    // (replaces the old wall-clock loot mock). Applied to hunting members in
    // phase 2c; anything credited to a hero who isn't a current hunter (rare —
    // credited a kill the same tick they left) is mailed to the stash below so
    // no drop is silently lost.
    const foundLoot = g.takePendingPackLoot()
    const appliedLoot = new Set<string>()

    // Phase 0: any hero standing in a city auto-deposits their field loot into the
    // guild stash (heroes deposit on return to town — no manual button) and restocks
    // any MERCHANT-sourced supplies (bought into the stash; the game tick then
    // withdraws them into the pack). Consumables reconcile to the loadout in the tick.
    for (const u of g.units) {
      if (!u.locationId) continue
      const loc = locById.get(u.locationId)
      if (!loc || !isCity(loc)) continue
      const lootPack = proto.packs[u.id]
      if (lootPack && Object.keys(lootPack).length > 0) proto.depositPack(u.id)
      exp.ensure(u.id)
      const he = useExpeditionStore.getState().heroes[u.id]
      if (he) buyMerchantSupplies(u, loc.id, he.loadout)
    }

    // Phase R: resupply trips. A hero flagged 'returning' is whisked to a town
    // (instant deploy now; land routing later, gated on deployMode), parks
    // TOWN_RESUPPLY_TICKS to deposit loot + restock supplies (handled by phase 0 +
    // the game tick's in-town pack reconcile), then redeploys to the hunt anchor.
    for (const u of g.units) {
      const he = exp.heroes[u.id]
      if (!he || he.status !== 'returning') continue

      if (g.deployMode !== 'instant') {
        // Open-world travel: the hero physically WALKS home through the portal
        // graph and back, instead of teleporting. routeUnitTo sets a multi-hop
        // travelPath; the core tick loop walks them map→map (and deposits their
        // pack via phase 0 once they reach the city). We just drive the legs.
        const loc = u.locationId ? locById.get(u.locationId) : null
        const walking = (u.travelPath?.length ?? 0) > 0
        if (he.resupplyUntil == null) {
          // Outbound leg → the logistics town.
          if (walking) continue                                   // still on the road
          if (loc && isCity(loc)) {
            // Arrived: park to deposit (phase 0) + restock, then head back.
            exp.commitStep(u.id, { resupplyUntil: g.ticks + TOWN_RESUPPLY_TICKS })
          } else {
            // Start the trip: remember the hunt anchor, route to the town on foot.
            const from = he.locationId ?? (loc && isHuntable(loc) ? u.locationId : null)
            const town = returnTownFor(he, from, g.locations)
            if (!town || !from) { exp.commitStep(u.id, { status: 'hunting', resupplyUntil: undefined }); continue }
            exp.commitStep(u.id, { status: 'returning', locationId: from })
            g.routeUnitTo(u.id, town.id)
          }
        } else if (g.ticks >= he.resupplyUntil) {
          // Resupply done → walk back to where they were hunting.
          if (walking) continue
          if (u.locationId === he.locationId) {
            exp.commitStep(u.id, { status: 'hunting', suppliesLeft: 1, resupplyUntil: undefined })
          } else {
            g.routeUnitTo(u.id, he.locationId!)
          }
        }
        continue
      }

      const loc = u.locationId ? locById.get(u.locationId) : null
      // Player manually redeployed mid-trip → abandon the resupply trip and let
      // phase 1's fresh-run detection take over.
      if (he.resupplyUntil != null && loc && isHuntable(loc) && u.locationId !== he.locationId) {
        exp.commitStep(u.id, { status: 'hunting', resupplyUntil: undefined })
        continue
      }
      if (he.resupplyUntil == null) {
        // Start the trip: capture the hunt anchor, instant-deploy to the town.
        const from = he.locationId ?? (loc && isHuntable(loc) ? u.locationId : null)
        const town = returnTownFor(he, from, g.locations)
        if (!town || !from) { exp.commitStep(u.id, { status: 'hunting', resupplyUntil: undefined }); continue }
        g.assignUnits([u.id], town.id)
        exp.commitStep(u.id, { status: 'returning', resupplyUntil: g.ticks + TOWN_RESUPPLY_TICKS, locationId: from })
      } else if (g.ticks >= he.resupplyUntil) {
        // Trip's done: redeploy to where they were hunting, full supplies, hunting.
        g.assignUnits([u.id], he.locationId!)
        exp.commitStep(u.id, { status: 'hunting', suppliesLeft: 1, resupplyUntil: undefined })
      }
    }

    // Phase 1: classify each deployed hero; collect the active hunters per location.
    for (const u of g.units) {
      if (!u.locationId) continue
      const loc = locById.get(u.locationId)
      if (!loc || !isHuntable(loc)) continue
      // A hero in transit (walking a travelPath to/from town) is just passing
      // THROUGH this map — never a hunter here. Without this guard a routing hero
      // standing on an intermediate field gets classified as a fresh-run hunter
      // (and can be swept into that field's party / group-return), then "starts
      // hunting where it was ditched". Phase R / the tick loop own travellers.
      if ((u.travelPath?.length ?? 0) > 0) continue
      // Hydrate from persisted pack carry-targets on first sight, so a reloaded
      // hero keeps its configured supplies loadout instead of the default (the
      // loadout itself isn't in the save — Unit.pack targets are; see ensure()).
      exp.ensure(u.id)
      const he = useExpeditionStore.getState().heroes[u.id] ?? freshHero({ locationId: u.locationId })

      if (he.status === 'returning') continue   // phase R owns returning heroes
      if (he.locationId !== u.locationId) {   // (re)deployed → fresh run
        exp.commitStep(u.id, { suppliesLeft: 1, status: 'hunting', locationId: u.locationId })
        continue
      }
      const arr = groups.get(u.locationId) ?? []
      arr.push({ u, he })
      groups.set(u.locationId, arr)
    }

    // Phase 2: per-location group — supplies, loot into packs, returns.
    for (const [locId, members] of groups) {
      // 2a. supplies = real loadout usage (carried consumables ÷ configured total),
      // NOT a timer — they only drop as the engine spends potions in combat.
      const newSup: Record<string, number> = {}
      const supSt: Record<string, { total: number; remaining: number }> = {}
      for (const { u, he } of members) {
        const st = supplyState(u.pack, he.loadout)
        newSup[u.id] = st.fraction
        supSt[u.id] = st
      }

      // 2c. real kill loot → packs. Each hero's drops are the REAL rolls the game
      // tick credited to them this interval (foundLoot), batched with the kills —
      // not a wall-clock trickle. Filter to the categories the hero keeps (drops
      // of unwanted categories are left behind), then sharers pool for the party
      // while others load their own pack (capacity-gated inside simulateHunt).
      const pool: Drop[] = []
      for (const { u, he } of members) {
        const found = foundLoot[u.id]
        if (!found) continue
        appliedLoot.add(u.id)
        const drops: Drop[] = Object.entries(found)
          .filter(([id]) => he.lootCats.includes(categorize(id)))
          .map(([itemId, qty]) => ({ itemId, qty }))
        if (drops.length === 0) continue
        if (he.shareLoot) pool.push(...drops)
        else proto.simulateHunt(u.id, drops)
      }
      // 2d. hand the pooled loot to accepters, least-full first
      distribute(pool, members.filter((m) => m.he.acceptLoot))

      // 2e. commit supplies + evaluate the return conditions
      for (const { u, he } of members) {
        // "Full" = at/above 90% capacity (a flat rule), so a pack that saturates a
        // few units short of the cap still heads home instead of hunting forever.
        const full = packFullEnough(useProtoStore.getState().packs[u.id], u.pack)
        // Dry = supplies run out, per the hero's any/all mode (one supply vs every one).
        const dry = supSt[u.id].total > 0 && suppliesDry(u.pack, he.loadout, he.supplyMode)
        const triggered = (he.returnOn.includes('pack-full') && full) || (he.returnOn.includes('supplies-out') && dry)
        if (triggered) {
          // Flag the return; phase R next tick whisks them to town and back.
          exp.commitStep(u.id, { suppliesLeft: newSup[u.id], status: 'returning', locationId: u.locationId })
          if (exp.returnMode === 'group') groupReturnLocs.add(locId)
        } else {
          exp.commitStep(u.id, { suppliesLeft: newSup[u.id], status: 'hunting', locationId: u.locationId })
        }
      }
    }

    // Phase 3: group return — one trigger sends that location's whole party home.
    if (groupReturnLocs.size > 0) {
      for (const u of g.units) {
        if (!u.locationId || !groupReturnLocs.has(u.locationId)) continue
        if ((u.travelPath?.length ?? 0) > 0) continue   // just passing through — not part of this party
        const he = useExpeditionStore.getState().heroes[u.id]
        if (he && he.status !== 'returning') exp.commitStep(u.id, { status: 'returning', locationId: u.locationId })
      }
    }

    // §loot safety net: any credited drops NOT applied to a hunting member above
    // (a hero who left the field the same tick they scored a kill) mail to the
    // stash so nothing is silently lost.
    for (const [uid, items] of Object.entries(foundLoot)) {
      if (appliedLoot.has(uid)) continue
      for (const [id, q] of Object.entries(items)) g.grantMiscItem(id, q)
    }
  }, [ticks])
}
