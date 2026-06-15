import { describe, it, expect } from 'vitest'
import {
  optimizeArmy, optimizeHero, optimizeColumn, withLoadout, heroMight, DOCTRINES, resolveDoctrine,
  slotOptions, quality,
} from '@/lib/loadout'
import { INITIAL_UNITS } from '@/data/units'
import { INITIAL_EQUIPMENT } from '@/data/equipment'
import type { Unit } from '@/types'

const eq = INITIAL_EQUIPMENT
const units = INITIAL_UNITS

describe('loadout optimizer', () => {
  it('improves (never worsens) a hero\'s Might', () => {
    const u = units.find((x) => x.class === 'Fighter')!
    const plan = optimizeHero(u, units, eq, DOCTRINES.vanguard)
    const after = heroMight(withLoadout(u, plan.loadout), eq)
    expect(after).toBeGreaterThanOrEqual(heroMight(u, eq))
  })

  it('army allocation never hands one item to two heroes', () => {
    const plans = optimizeArmy(units, eq, (u) => resolveDoctrine('auto', u))
    const seen = new Map<string, string>()
    for (const [unitId, plan] of Object.entries(plans)) {
      for (const slot of ['mainHand', 'offHand', 'armor', 'accessory'] as const) {
        const id = plan.loadout[slot]
        if (!id) continue
        expect(seen.has(id), `${id} double-assigned (${seen.get(id)} & ${unitId})`).toBe(false)
        seen.set(id, unitId)
      }
    }
  })

  it('respects class/level restrictions', () => {
    const mage = units.find((x) => x.class === 'Mage')!
    const plan = optimizeHero(mage, units, eq, DOCTRINES.arcanist)
    for (const slot of ['mainHand', 'offHand'] as const) {
      const id = plan.loadout[slot]
      if (!id) continue
      const item = eq.find((e) => e.id === id)!
      if (item.requiredClasses) expect(item.requiredClasses).toContain('Mage')
    }
  })

  it('a 2H main hand leaves the off hand empty', () => {
    const ranger = units.find((x) => x.class === 'Ranger')!  // bow is 2H
    const plan = optimizeHero(ranger, units, eq, DOCTRINES.skirmisher)
    const main = plan.loadout.mainHand ? eq.find((e) => e.id === plan.loadout.mainHand)! : null
    if (main?.category === 'weapon-2h') expect(plan.loadout.offHand).toBeNull()
  })

  it('slotOptions excludes gear bound to other heroes', () => {
    // Bind the iron sword to a different hero, then it shouldn't be offered.
    const [a, b] = units
    const a2: Unit = { ...a, weaponSets: [{ mainHand: 'eq-sword', offHand: null }, a.weaponSets[1]], activeWeaponSet: 0 }
    const opts = slotOptions(b, 'mainHand', [a2, b], eq, DOCTRINES.vanguard)
    expect(opts.find((o) => o.id === 'eq-sword')).toBeUndefined()
  })

  it('per-column auto-fill never double-assigns within the column', () => {
    const picks = optimizeColumn('armor', units, eq, (u) => resolveDoctrine('auto', u))
    const ids = Object.values(picks)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(eq.find((e) => e.id === id)!.category).toBe('armor')
  })

  it('army optimize honours a locked hero (no plan entry, keeps gear)', () => {
    const locked = units[0]
    const plans = optimizeArmy(units, eq, (u) => resolveDoctrine('auto', u), (u) => u.id === locked.id)
    expect(plans[locked.id]).toBeUndefined()
  })

  it('quality tiers span the catalog', () => {
    const tiers = new Set(eq.map((e) => quality(e).id))
    expect(tiers.size).toBeGreaterThan(2)
  })
})
