import type { EngineUnitInput, Vec2 } from '@/engine'

// ── Town NPCs ────────────────────────────────────────────────────────────────--
//
// An NPC is a stationary, non-combatant townsperson a hero may cross paths with
// while milling about a city (a peaceful open-world field). They join the battle
// on the `'neutral'` team, so nobody attacks them and they never attack — they
// just stand where they spawn. Some NPCs are tied to a Market merchant (their
// shop) and/or a location quest; that wiring lives in `merchants.ts` /
// `protoStore.ts` and is referenced here only by id for fiction/colour.

export interface NpcDef {
  id: string
  name: string
  icon: string             // glyph shown on the battlefield token (and roster blurbs)
  blurb: string
  locationId: string       // the (open-world) city this NPC stands in
  pos: Vec2                // where on that city's field they stand (NPCs are stationary)
  merchantId?: string      // their shop in the Market (MERCHANT_REGISTRY), if any
}

// Arnold and Paul keep shop side-by-side on Prontera's plaza (the flagstone
// market square at the field centre, kept clear of buildings by the city recipe),
// a few cells apart so a hero forming up passes both. Coordinates are for the
// PRONTERA_SIZE field (see locations.ts): centre ≈ (25, 25), flanking the well.
export const NPC_REGISTRY: Record<string, NpcDef> = {
  'arnold-armorsmith': {
    id: 'arnold-armorsmith', name: 'Arnold the Armorsmith', icon: '🛡️',
    blurb: 'A burly smith hammering plate at his stall. Always after fresh hides.',
    locationId: 'prontera-city', pos: { x: 22, y: 25 }, merchantId: 'arnold-armorsmith',
  },
  'paul-weaponsmith': {
    id: 'paul-weaponsmith', name: 'Paul the Weaponsmith', icon: '⚔️',
    blurb: 'A wiry bladesmith at the next stall over. Pays for fangs and talons.',
    locationId: 'prontera-city', pos: { x: 28, y: 25 }, merchantId: 'paul-weaponsmith',
  },
}

export function npcsAt(locationId: string): NpcDef[] {
  return Object.values(NPC_REGISTRY).filter((n) => n.locationId === locationId)
}

// A harmless, stationary combatant input for an NPC. Stats are nominal — an NPC
// is never targeted (neutral team is excluded from every enemy query) and never
// takes a turn, so only its id/name/hp/position actually matter; the rest are
// safe defaults so makeCombatant has everything it reads. `team` is overridden to
// 'neutral' by addCombatant at the call site.
export function npcToEngineInput(npc: NpcDef): EngineUnitInput {
  return {
    id: npc.id, name: npc.name, team: 'neutral',
    str: 0, def: 0, int: 0, spd: 0, magicDef: 0,
    maxHp: 100, hp: 100,
    preferredRank: 'front',
    meleeRange: 0, rangedRange: 0, moveSpeed: 0,
    skills: [],
  }
}
