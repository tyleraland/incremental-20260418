import type { SkillDef, Unit } from '@/types'

export const SKILL_REGISTRY: Record<string, SkillDef> = {
  'sword-mastery-1h': {
    id: 'sword-mastery-1h', name: '1H Sword Mastery', maxLevel: 10,
    description: (lv) => `+${lv * 3} ATK when wielding a 1H sword`,
    requires: [],
    getBonuses: (lv) => ({ attack: lv * 3 }),
  },
  'sword-mastery-2h': {
    id: 'sword-mastery-2h', name: '2H Sword Mastery', maxLevel: 10,
    description: (lv) => `+${lv * 5} ATK when wielding a 2H sword`,
    requires: [{ skillId: 'sword-mastery-1h', minLevel: 1 }],
    getBonuses: (lv) => ({ attack: lv * 5 }),
  },
  'keen-eyes': {
    id: 'keen-eyes', name: 'Keen Eyes', maxLevel: 10,
    description: (lv) => `+${lv} DEX`,
    requires: [],
    getBonuses: (lv) => ({ dexterity: lv }),
  },
  'eagle-eyes': {
    id: 'eagle-eyes', name: 'Eagle Eyes', maxLevel: 10,
    description: (lv) => `+${lv} AGI`,
    requires: [{ skillId: 'keen-eyes', minLevel: 1 }],
    getBonuses: (lv) => ({ agility: lv }),
  },
  'arcane-knowledge': {
    id: 'arcane-knowledge', name: 'Arcane Knowledge', maxLevel: 10,
    description: (lv) => `+${lv} INT`,
    requires: [],
    getBonuses: (lv) => ({ intelligence: lv }),
  },
  'spellweaving': {
    id: 'spellweaving', name: 'Spellweaving', maxLevel: 10,
    description: (lv) => `+${lv * 4} M.ATK`,
    requires: [{ skillId: 'arcane-knowledge', minLevel: 1 }],
    getBonuses: (lv) => ({ magicAttack: lv * 4 }),
  },
}

export function getAvailableSkills(unit: Unit) {
  return Object.values(SKILL_REGISTRY).map((skill) => {
    const current    = unit.learnedSkills[skill.id] ?? 0
    const prereqsMet = skill.requires.every((r) => (unit.learnedSkills[r.skillId] ?? 0) >= r.minLevel)
    return { skill, current, prereqsMet, maxed: current >= skill.maxLevel }
  })
}

export function getLearnedSkills(unit: Unit) {
  return Object.values(SKILL_REGISTRY)
    .filter((s) => (unit.learnedSkills[s.id] ?? 0) >= 1)
    .map((skill) => ({ skill, current: unit.learnedSkills[skill.id]! }))
}
