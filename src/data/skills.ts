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

  // ── Active skills (cast/use; do not give passive stat bonuses) ───────────────
  // Casting / cooldown / mana semantics: not yet implemented. These exist as
  // action-slot draggables only; combat automation will read them later.
  'fire-bolt': {
    id: 'fire-bolt', name: 'Fire Bolt', maxLevel: 10, type: 'active',
    description: (lv) => `Fire spell. ${lv}× M.ATK. Cast 1.5s fixed + 3.5s variable (DEX-reducible).`,
    requires: [],
    getBonuses: () => ({}),
  },
  'frost-bolt': {
    id: 'frost-bolt', name: 'Frost Bolt', maxLevel: 10, type: 'active',
    description: (lv) => `Water spell. ${lv}× M.ATK. Cast 1.5s fixed + 3.5s variable (DEX-reducible).`,
    requires: [],
    getBonuses: () => ({}),
  },
  'lightning-bolt': {
    id: 'lightning-bolt', name: 'Lightning Bolt', maxLevel: 10, type: 'active',
    description: (lv) => `Lightning spell. ${lv}× M.ATK. Cast 1.5s fixed + 3.5s variable (DEX-reducible).`,
    requires: [],
    getBonuses: () => ({}),
  },
  'bash': {
    id: 'bash', name: 'Bash', maxLevel: 10, type: 'active',
    description: (lv) => `Melee strike at ${100 + 30 * lv}% ATK.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'heal': {
    id: 'heal', name: 'Heal', maxLevel: 10, type: 'active',
    description: (lv) => `Restore an ally for ${(1.5 + 0.5 * (lv - 1)).toFixed(1)}× INT.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'aoe-heal': {
    id: 'aoe-heal', name: 'Sanctuary', maxLevel: 10, type: 'active',
    description: (lv) => `Heal all nearby allies for ${(1.0 + 0.3 * (lv - 1)).toFixed(1)}× INT.`,
    requires: [{ skillId: 'heal', minLevel: 1 }],
    getBonuses: () => ({}),
  },
  'boost-agility': {
    id: 'boost-agility', name: 'Boost Agility', maxLevel: 10, type: 'active',
    description: () => `Buff an ally's attack speed for several rounds.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'hammer-fall': {
    id: 'hammer-fall', name: 'Hammer Fall', maxLevel: 10, type: 'active',
    description: (lv) => `Smash an area for ${(0.8 + 0.2 * (lv - 1)).toFixed(1)}× ATK and stun.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'poison': {
    id: 'poison', name: 'Poison', maxLevel: 10, type: 'active',
    description: () => `Poison a foe — 4 damage per round for a few rounds.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'arrow-shower': {
    id: 'arrow-shower', name: 'Arrow Shower', maxLevel: 10, type: 'active',
    description: (lv) => `Volley an area for ${(0.7 + 0.15 * (lv - 1)).toFixed(2)}× ATK and knock foes back.`,
    requires: [{ skillId: 'keen-eyes', minLevel: 1 }],
    getBonuses: () => ({}),
  },
  'firewall': {
    id: 'firewall', name: 'Firewall', maxLevel: 10, type: 'active',
    description: (lv) => `Raise a wall of flame (${3 + lv}/round) and step back.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'ankle-snare': {
    id: 'ankle-snare', name: 'Ankle Snare', maxLevel: 10, type: 'active',
    description: () => `Root a foe in place, then retreat.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'freeze': {
    id: 'freeze', name: 'Freeze', maxLevel: 10, type: 'active',
    description: () => `Freeze a foe: it loses its turn and takes double damage.`,
    requires: [{ skillId: 'arcane-knowledge', minLevel: 1 }],
    getBonuses: () => ({}),
  },
  'dispel': {
    id: 'dispel', name: 'Dispel', maxLevel: 10, type: 'active',
    description: () => `Strip the beneficial buffs off a foe.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'cloak': {
    id: 'cloak', name: 'Cloak', maxLevel: 10, type: 'active',
    description: () => `Vanish — enemies can't target you until you strike.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'back-stab': {
    id: 'back-stab', name: 'Back Stab', maxLevel: 10, type: 'active',
    description: (lv) => `Strike for ${(1.0 + 0.2 * (lv - 1)).toFixed(1)}× ATK — far more from stealth.`,
    requires: [{ skillId: 'cloak', minLevel: 1 }],
    getBonuses: () => ({}),
  },
  'sight': {
    id: 'sight', name: 'Sight', maxLevel: 10, type: 'active',
    description: () => `Reveal hidden foes in an area.`,
    requires: [],
    getBonuses: () => ({}),
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
