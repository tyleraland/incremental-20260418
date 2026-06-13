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

  // ── Defensive / tank passives (was the Armored / Nimble / Threatening-Presence
  // tactics). They don't grant additive stats — they set engine combat mechanics
  // (see getDerivedStats → combatPassives), so getBonuses is empty. ───────────────
  'toughness': {
    id: 'toughness', name: 'Toughness', maxLevel: 10,
    description: (lv) => `Take ${Math.round(Math.min(0.5, 0.1 + 0.02 * (lv - 1)) * 100)}% less incoming damage.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'evasion': {
    id: 'evasion', name: 'Evasion', maxLevel: 10,
    description: (lv) => `Dodge every ${lv >= 5 ? 5 : 7}th incoming attack.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'defensive-stance': {
    id: 'defensive-stance', name: 'Defensive Stance', maxLevel: 10,
    description: (lv) => `Generate ${(3 + 0.5 * (lv - 1)).toFixed(1)}× threat — hold aggro so the party's squishies don't get hit.`,
    requires: [],
    getBonuses: () => ({}),
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
  'earth-bolt': {
    id: 'earth-bolt', name: 'Earth Bolt', maxLevel: 10, type: 'active',
    description: (lv) => `Earth spell. ${lv}× M.ATK. Cast 1.5s fixed + 3.5s variable (DEX-reducible).`,
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
  'shield-wall': {
    id: 'shield-wall', name: 'Shield Wall', maxLevel: 10, type: 'active',
    description: (lv) => `Turtle up: +${12 * lv} DEF for ~3s (you stop attacking while it holds). Auto-used only when under attack — 2+ foes on you, or one locked onto you.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'last-stand': {
    id: 'last-stand', name: 'Last Stand', maxLevel: 10, type: 'active',
    description: (lv) => `A near-death surge: +${8 * lv} attack power and +${4 * lv} speed for ~3s. Auto-used only below 20% HP with a foe still up.`,
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
  'bless': {
    id: 'bless', name: 'Bless', maxLevel: 10, type: 'active',
    description: (lv) => `Bless an ally: +${lv} attack, magic & speed and +${2 * lv} hit for ~10s. Up to 2 active; prefers the caster, then allies.`,
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
  'fireball': {
    id: 'fireball', name: 'Fireball', maxLevel: 10, type: 'active',
    description: (lv) => `Hurl a fireball that bursts on a foe for instant fire AoE (${(1.1 + 0.25 * (lv - 1)).toFixed(1)}× M.ATK to it and everything nearby). No lingering cloud — it can't be side-stepped like a ground hazard.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'firewall': {
    id: 'firewall', name: 'Firewall', maxLevel: 10, type: 'active',
    description: (lv) => `Raise a 3-wide wall of flame between you and a foe. Enemies bounce back and burn (${4 + lv}) each time they hit it — 5 bumps to break through. Allies pass. A kiting tool.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'lightning-storm': {
    id: 'lightning-storm', name: 'Lightning Storm', maxLevel: 10, type: 'active',
    description: () => `Conjure a storm cloud: 1 lightning/round to anything inside for ~10s. Very long cast — set it up before the fight comes to you.`,
    requires: [{ skillId: 'arcane-knowledge', minLevel: 2 }],
    getBonuses: () => ({}),
  },
  'molasses': {
    id: 'molasses', name: 'Molasses', maxLevel: 10, type: 'active',
    description: () => `A fast (2-round) AoE puddle that slows everything inside — half move speed, much slower to act (no damage). Defensive: drop it on a chaser to kite, or on the melee mauling your backline. Up to 3 at once; the slow doesn't stack.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'ankle-snare': {
    id: 'ankle-snare', name: 'Ankle Snare', maxLevel: 10, type: 'active',
    description: () => `Root a foe in place, then retreat.`,
    requires: [],
    getBonuses: () => ({}),
  },
  'taunt': {
    id: 'taunt', name: 'Taunt', maxLevel: 10, type: 'active',
    description: () => `Force an enemy to attack you for ~3s and vault to the top of its threat — peel it off your back line. Pairs with Defensive Stance.`,
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
    description: () => `Vanish for ~10s — enemies can't target you until you strike or get hit. Move at 75% while hidden. Only from safety: a foe in sight but >6 away and out of combat for a few rounds.`,
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
  // §minions: a passive that grants a permanent beast companion — a melee pet
  // that fights alongside you, scales with your level, and whose tactics you tune
  // on its own sub-tab (tank, dps, …). No stat bonus to the hero itself.
  'beast-companion': {
    id: 'beast-companion', name: 'Beast Companion', maxLevel: 1, type: 'passive',
    description: () => `Gain a loyal beast that fights at your side and levels with you. Customise its tactics on the Pet tab.`,
    requires: [],
    getBonuses: () => ({}),
  },
  // §minions: raise two skeletal warriors that guard and follow you on a short
  // leash, then crumble after ~12s (or when you fall). Two stand at once.
  'summon-skeletons': {
    id: 'summon-skeletons', name: 'Summon Skeletons', maxLevel: 5, type: 'active',
    description: (lv) => `Raise 2 skeletons (${24 + 6 * lv} HP) that body-block and follow you for ~12s. Up to 2 at once.`,
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
