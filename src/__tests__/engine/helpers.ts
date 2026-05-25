import type { EngineUnitInput, Combatant, EngineSkill, Team, Rank } from '@/engine'

export function eu(overrides: Partial<EngineUnitInput> = {}): EngineUnitInput {
  return {
    id: 'u',
    name: 'Unit',
    team: 'player',
    str: 10,
    def: 4,
    int: 0,
    spd: 10,
    maxHp: 50,
    hp: 50,
    preferredRank: 'front',
    meleeRange: 1.2,
    rangedRange: 0,
    skills: [],
    ...overrides,
  }
}

export function combatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'c',
    name: 'C',
    team: 'player' as Team,
    index: 0,
    str: 10,
    def: 4,
    int: 0,
    spd: 10,
    maxHp: 50,
    hp: 50,
    alive: true,
    pos: { x: 0.5, y: 0 },
    preferredRank: 'front' as Rank,
    meleeRange: 1.2,
    rangedRange: 0,
    skills: [],
    skillCooldowns: {},
    statuses: [],
    lockedTargetId: null,
    potionsLeft: 0,
    ...overrides,
  }
}

export function attackSkill(overrides: Partial<EngineSkill> = {}): EngineSkill {
  return {
    id: 'atk',
    name: 'Strike',
    type: 'attack',
    targeting: 'single_enemy',
    range: 1.5,
    aoeRadius: 0,
    cooldown: 3,
    channelTime: 0,
    damageFormula: 'str * 2',
    healFormula: '',
    slot: 'primary',
    ...overrides,
  }
}

export function healSkill(overrides: Partial<EngineSkill> = {}): EngineSkill {
  return {
    id: 'heal',
    name: 'Mend',
    type: 'heal',
    targeting: 'single_ally',
    range: 5,
    aoeRadius: 0,
    cooldown: 5,
    channelTime: 0,
    damageFormula: '',
    healFormula: 'int * 2',
    slot: 'primary',
    ...overrides,
  }
}
