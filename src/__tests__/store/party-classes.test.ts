// The starting party: one hero per class (Fighter doubled) with role-correct
// deploy shapes — the mage/archer fight at range, melee (incl. the rod-swinging
// cleric) close in, the knight is the sturdiest front-liner.
import { describe, it, expect } from 'vitest'
import { INITIAL_UNITS } from '@/data/units'
import { INITIAL_EQUIPMENT } from '@/data/equipment'
import { getDerivedStats } from '@/lib/stats'
import { unitToEngineInput } from '@/engine'

const byId = (id: string) => INITIAL_UNITS.find((u) => u.id === id)!
const ds = (id: string) => getDerivedStats(byId(id), INITIAL_EQUIPMENT)
const engine = (id: string) => unitToEngineInput(byId(id), ds(id), 'player')

// The classed heroes (Fighter … Rogue) vs. the unclassed Novice recruits the
// city class-change quests act on (`class: null`, rendered as "Novice").
const CLASSED = INITIAL_UNITS.filter((u) => u.class !== null)
const NOVICES = INITIAL_UNITS.filter((u) => u.class === null)

describe('starting party classes', () => {
  it('covers all five classes among the classed starters', () => {
    expect(new Set(CLASSED.map((u) => u.class))).toEqual(
      new Set(['Fighter', 'Ranger', 'Mage', 'Cleric', 'Rogue']),
    )
  })

  it('ships unclassed Novices for the city class-change quests', () => {
    expect(NOVICES.length).toBeGreaterThan(0)
    // At least one Novice is level 2+, so a class change is available out of the
    // box (the paths gate on a level-2 Novice — see classQuestStatus).
    expect(NOVICES.some((u) => u.level >= 2)).toBe(true)
  })

  it('gives each classed hero a deep, usable kit (equipped skills + tactics)', () => {
    for (const u of CLASSED) {
      const skills = u.actionSlots.filter((s) => s?.kind === 'skill').length
      expect(skills).toBeGreaterThanOrEqual(2)
      expect(u.tactics.length).toBeGreaterThanOrEqual(2)
      // Combined kit is deep — some stat-skills (Shield Wall, Last Stand) live in
      // the action bar and bring their own behaviour, so count both.
      expect(skills + u.tactics.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('deploys the mage and archer at range, melee (incl. the rod cleric) up front', () => {
    for (const id of ['u2', 'u3']) expect(engine(id).rangedRange).toBeGreaterThan(0)        // Ranger/Mage
    for (const id of ['u1', 'u4', 'u5', 'u6']) expect(engine(id).rangedRange).toBe(0)        // Fighters/Cleric (melee rod)/Rogue
  })

  it('makes the knight the sturdiest front-liner', () => {
    expect(ds('u5').maxHp).toBeGreaterThan(ds('u1').maxHp)  // Davan (CON 8) > Aldric (CON 7)
  })
})
