// The starting party: one hero per class (Fighter doubled) with role-correct
// deploy shapes — casters/archer fight at range, melee close in, the knight is
// the sturdiest front-liner.
import { describe, it, expect } from 'vitest'
import { INITIAL_UNITS } from '@/data/units'
import { INITIAL_EQUIPMENT } from '@/data/equipment'
import { getDerivedStats } from '@/lib/stats'
import { unitToEngineInput } from '@/engine'

const byId = (id: string) => INITIAL_UNITS.find((u) => u.id === id)!
const ds = (id: string) => getDerivedStats(byId(id), INITIAL_EQUIPMENT)
const engine = (id: string) => unitToEngineInput(byId(id), ds(id), 'player')

describe('starting party classes', () => {
  it('assigns every hero a class', () => {
    expect(INITIAL_UNITS.every((u) => u.class !== null)).toBe(true)
  })

  it('covers all five classes', () => {
    expect(new Set(INITIAL_UNITS.map((u) => u.class))).toEqual(
      new Set(['Fighter', 'Ranger', 'Mage', 'Cleric', 'Rogue']),
    )
  })

  it('gives each hero a deep, usable kit (equipped skills + tactics)', () => {
    for (const u of INITIAL_UNITS) {
      expect(u.actionSlots.filter((s) => s?.kind === 'skill').length).toBeGreaterThanOrEqual(2)
      expect(u.tactics.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('deploys casters and the archer at range, melee up front', () => {
    for (const id of ['u2', 'u3', 'u4']) expect(engine(id).rangedRange).toBeGreaterThan(0) // Ranger/Mage/Cleric
    for (const id of ['u1', 'u5', 'u6']) expect(engine(id).rangedRange).toBe(0)             // Fighters/Rogue
  })

  it('makes the knight the sturdiest front-liner', () => {
    expect(ds('u5').maxHp).toBeGreaterThan(ds('u1').maxHp)  // Davan (CON 8) > Aldric (CON 7)
  })
})
