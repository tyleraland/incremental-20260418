import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/useGameStore'
import { TICKS_PER_SECOND } from '@/lib/time'
import { MONSTER_REGISTRY } from '@/data/monsters'
import type { Location, Unit } from '@/types'
import { useProtoStore } from './protoStore'
import { heroFull, heroRoom, heroCarried, WEIGHT_LIMIT } from './economy'
import { useExpeditionStore, freshHero, type HeroExpedition } from './expeditionStore'
import {
  locationProfile, isHuntable, isCity, nearestCity, categorize, supplyState,
} from './expedition'
import { consumableDef } from '@/data/consumables'

// How long a returned hero parks in town (depositing loot + restocking) before
// redeploying to where they were hunting. Instant deploy for now — open-world land
// routing replaces the teleport later (gated on the store's deployMode lever).
const TOWN_RESUPPLY_TICKS = TICKS_PER_SECOND * 30

type Drop = { itemId: string; qty: number }
type Member = { u: Unit; he: HeroExpedition }

// One mock drop from the location's monster table, restricted to the categories
// the hero keeps. (proto — Math.random is fine; only the engine is deterministic.)
function oneDrop(loc: Location, he: HeroExpedition): Drop | null {
  const pool = loc.monsterIds.flatMap((mid) => MONSTER_REGISTRY[mid]?.drops ?? [])
  const ids = (pool.length ? pool.map((d) => d.itemId) : ['drop-slime-gel']).filter((id) => he.lootCats.includes(categorize(id)))
  if (ids.length === 0) return null
  return { itemId: ids[Math.floor(Math.random() * ids.length)], qty: 1 }
}

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
  const progress = useRef<Record<string, number>>({})

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

    // Phase 0: any hero standing in a city auto-deposits their field loot into the
    // guild stash (heroes deposit on return to town — no manual button). Consumables
    // (Unit.pack) reconcile to the loadout separately in the game tick.
    for (const u of g.units) {
      if (!u.locationId) continue
      const loc = locById.get(u.locationId)
      const lootPack = proto.packs[u.id]
      if (loc && isCity(loc) && lootPack && Object.keys(lootPack).length > 0) proto.depositPack(u.id)
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
            progress.current[u.id] = 0
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
        progress.current[u.id] = 0
      }
    }

    // Phase 1: classify each deployed hero; collect the active hunters per location.
    for (const u of g.units) {
      if (!u.locationId) continue
      const loc = locById.get(u.locationId)
      if (!loc || !isHuntable(loc)) continue
      const he = exp.heroes[u.id] ?? freshHero({ locationId: u.locationId })

      if (he.status === 'returning') continue   // phase R owns returning heroes
      if (he.locationId !== u.locationId) {   // (re)deployed → fresh run
        exp.commitStep(u.id, { suppliesLeft: 1, status: 'hunting', locationId: u.locationId })
        progress.current[u.id] = 0
        continue
      }
      // §logistics: make sure loadout heal items are actually used in the field, so
      // the pack (hence supplies) really depletes. Only writes a MISSING rule, so
      // this is a one-time fix per hero, not a per-tick store churn.
      for (const id of Object.keys(he.loadout)) {
        if (consumableDef(id)?.effect === 'heal' && !(u.consumableRules ?? []).some((r) => r.itemId === id)) {
          g.addConsumableRule(u.id, id, 0.3)
        }
      }
      const arr = groups.get(u.locationId) ?? []
      arr.push({ u, he })
      groups.set(u.locationId, arr)
    }

    // Phase 2: per-location group — supplies, loot generation + sharing, returns.
    for (const [locId, members] of groups) {
      const loc = locById.get(locId)!
      const profile = locationProfile(loc)

      // 2a. supplies = real loadout usage (carried consumables ÷ configured total),
      // NOT a timer — they only drop as the engine spends potions in combat.
      const newSup: Record<string, number> = {}
      const supSt: Record<string, { total: number; remaining: number }> = {}
      for (const { u, he } of members) {
        const st = supplyState(u.pack, he.loadout)
        newSup[u.id] = st.fraction
        supSt[u.id] = st
      }

      // 2c. generate loot: sharers pool it, others fill their own pack
      const pool: Drop[] = []
      for (const { u, he } of members) {
        progress.current[u.id] = (progress.current[u.id] ?? 0) + profile.lootItemsPerSec * dt
        const cap = he.shareLoot ? Infinity : heroRoom(useProtoStore.getState().packs[u.id], u.pack)
        const drops: Drop[] = []
        while (progress.current[u.id] >= 1 && drops.length < cap) {
          progress.current[u.id] -= 1
          const d = oneDrop(loc, he)
          if (d) drops.push(d)
        }
        if (drops.length === 0) continue
        if (he.shareLoot) pool.push(...drops)
        else proto.simulateHunt(u.id, drops)
      }
      // 2d. hand the pooled loot to accepters, least-full first
      distribute(pool, members.filter((m) => m.he.acceptLoot))

      // 2e. commit supplies + evaluate the return conditions
      for (const { u, he } of members) {
        const full = heroFull(useProtoStore.getState().packs[u.id], u.pack)
        const dry = supSt[u.id].total > 0 && supSt[u.id].remaining <= 0   // out of carried supplies
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
        const he = useExpeditionStore.getState().heroes[u.id]
        if (he && he.status !== 'returning') exp.commitStep(u.id, { status: 'returning', locationId: u.locationId })
      }
    }
  }, [ticks])
}
