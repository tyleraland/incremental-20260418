// TeamPlan v2 / objectives / capability plumbing (tactical-coordination.md M0).
// The contract: the new fields round-trip through the snapshot when set, and
// are ABSENT everywhere nothing sets them — so every pre-M0 token, and every
// token a live game produces today, stays byte-identical.
import { describe, it, expect } from 'vitest'
import { unzlibSync, strFromU8 } from 'fflate'
import {
  createBattle, advanceRound, serializeBattle, deserializeBattle,
  type BattleState, type Engagement, type Assignment,
} from '@/engine'
import { eu, attackSkill, healSkill } from './helpers'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!

// The raw JSON inside a token: `BSNAP.<base64(deflate(json))>.<guard>`.
const tokenJson = (token: string): string => {
  const body = token.split('.')[1]
  const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  return strFromU8(unzlibSync(bytes))
}

// M1 (tactical-coordination.md §8) makes the planner publish engagement/
// avoidTargetIds once a team has a visible enemy — these two are no longer in
// this "stays absent" set. assignments/corridor remain unpublished (M2/M3).
const STILL_ABSENT_KEYS = ['"assignments"', '"corridor"']

describe('TeamPlan v2 plumbing (M0)', () => {
  it('v2 plan fields + objectives survive the round-trip when set', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a' })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
    })
    advanceRound(b)   // planner fills plans
    const engagement: Engagement = { targetIds: ['e'], primaryId: 'e', anchor: { x: 3, y: 4 }, stance: 'hold', sinceRound: 1 }
    const assignments: Record<string, Assignment> = { a: { role: 'pull', targetId: 'e', to: { x: 2, y: 2 } } }
    b.plans.player = { ...b.plans.player!, engagement, assignments, avoidTargetIds: ['e2'], corridor: { x: 5, y: 6 } }
    b.objectives = { player: { kind: 'escort', unitId: 'a' } }

    const clone = deserializeBattle(serializeBattle(b))
    expect(clone.plans.player!.engagement).toEqual(engagement)
    expect(clone.plans.player!.assignments).toEqual(assignments)
    expect(clone.plans.player!.avoidTargetIds).toEqual(['e2'])
    expect(clone.plans.player!.corridor).toEqual({ x: 5, y: 6 })
    expect(clone.objectives).toEqual({ player: { kind: 'escort', unitId: 'a' } })
  })

  // M1 update (deliberate — see the file header on M0 vs M1): the planner now
  // publishes engagement + avoidTargetIds once a team has a visible enemy, so
  // this scenario (one hero, one visible mob, five live rounds in open world)
  // is exactly the case that SHOULD populate them. assignments/corridor are
  // still M2/M3 and stay absent.
  it('M1 populates engagement/avoidTargetIds once an enemy is visible; assignments/corridor stay absent', () => {
    const b = createBattle({
      playerUnits: [eu({ id: 'a', skills: [attackSkill()] })],
      enemyUnits: [eu({ id: 'e', team: 'enemy' })],
      mode: 'open', cols: 30, rows: 30,
    })
    for (let i = 0; i < 5; i++) advanceRound(b)
    expect(b.objectives).toBeUndefined()
    const plan = b.plans.player!
    expect(plan.engagement).toBeTruthy()
    expect(plan.engagement!.primaryId).toBe('e')
    expect(plan.avoidTargetIds).toEqual([])   // the only enemy in sight is the primary's own camp
    expect('assignments' in plan).toBe(false)
    expect('corridor' in plan).toBe(false)

    // Byte-identity proxy for the fields that are STILL unpublished this
    // milestone — the token carries neither of them.
    const json = tokenJson(serializeBattle(b))
    for (const key of STILL_ABSENT_KEYS) expect(json, `token leaked ${key}`).not.toContain(key)
    // …and a round-trip re-serializes to the same token (no new keys sneak in on load).
    const token = serializeBattle(b)
    expect(serializeBattle(deserializeBattle(token))).toBe(token)
  })

  it('capability is precomputed at spawn, rebuilt on load, and matches', () => {
    const b = createBattle({
      playerUnits: [eu({
        id: 'a', str: 10, maxHp: 60, hp: 60,
        skills: [attackSkill({ id: 'big', damageFormula: 'str * 3', cooldown: 2, range: 6 }), healSkill()],
      })],
      enemyUnits: [eu({ id: 'e', team: 'enemy', maxHp: 50, hp: 50, armorReduction: 0.4 })],
    })
    const a = find(b, 'a')
    expect(a.capability).toBeDefined()
    expect(a.capability!.sustainedDamage).toBe(15)   // str*3 = 30 over a 2-round cycle beats the basic (10)
    expect(a.capability!.toughness).toBe(60)         // maxHp × 1 (no armorReduction)
    expect(a.capability!.reach).toBe(6)              // the attack skill outranges the melee basic
    expect(a.capability!.hasHeal).toBe(true)
    const e = find(b, 'e')
    expect(e.capability!.toughness).toBe(30)         // 50 × (1 − 0.4)
    expect(e.capability!.hasHeal).toBe(false)

    const clone = deserializeBattle(serializeBattle(b))
    expect(find(clone, 'a').capability).toEqual(a.capability)
    expect(find(clone, 'e').capability).toEqual(e.capability)
  })
})
