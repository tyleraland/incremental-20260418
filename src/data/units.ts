import type { Unit, ActionSlotEntry } from '@/types'
import { ACTION_SLOT_COUNT } from '@/types'

const EMPTY_ACTION_SLOTS = Array<null>(ACTION_SLOT_COUNT).fill(null)
const t = (id: string, rank = 1) => ({ id, rank })
// Build an action bar from a list of skill ids (pads to ACTION_SLOT_COUNT).
const bar = (...skillIds: string[]): (ActionSlotEntry | null)[] => {
  const slots: (ActionSlotEntry | null)[] = skillIds.map((id) => ({ kind: 'skill' as const, id }))
  while (slots.length < ACTION_SLOT_COUNT) slots.push(null)
  return slots
}

export const INITIAL_UNITS: Unit[] = [
  {
    id: 'u1', name: 'Aldric Thorne', level: 3, exp: 245, expToNext: 312, age: 24, health: 95, recoveryTicksLeft: 0, isResting: false,
    class: 'Fighter', proficiencies: ['Swords', 'Heavy Armor'], locationId: null,
    abilities: { strength: 8, agility: 5, dexterity: 4, constitution: 7, intelligence: 2 },
    abilityPoints: 20, skillPoints: 1, learnedSkills: { 'sword-mastery-1h': 2, 'bash': 3, 'hammer-fall': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-sword-1h', offHand: 'eq-shield-wood' }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('bash', 'hammer-fall'),
    tactics: [t('tank-buster'), t('armored'), t('charger')],
  },
  {
    id: 'u2', name: 'Mira Ashdown', level: 2, exp: 80, expToNext: 180, age: 19, health: 90, recoveryTicksLeft: 0, isResting: false,
    class: null, proficiencies: ['Tools'], locationId: 'kings-forest',
    abilities: { strength: 4, agility: 5, dexterity: 6, constitution: 4, intelligence: 4 },
    abilityPoints: 15, skillPoints: 1, learnedSkills: {},
    travelPath: null,
    weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, sideboard1: 'eq-handaxe', sideboard2: null, accessory: null },
    actionSlots: [...EMPTY_ACTION_SLOTS],
    tactics: [t('charger')],
  },
  {
    id: 'u3', name: 'Theron Vance', level: 4, exp: 420, expToNext: 520, age: 31, health: 82, recoveryTicksLeft: 0, isResting: false,
    class: 'Mage', proficiencies: ['Staves', 'Wands'], locationId: 'mount-mjolnir',
    abilities: { strength: 3, agility: 5, dexterity: 6, constitution: 4, intelligence: 9 },
    abilityPoints: 25, skillPoints: 2, learnedSkills: { 'arcane-knowledge': 3, 'fire-bolt': 3, 'lightning-bolt': 2, 'heal': 3, 'firewall': 1, 'freeze': 2, 'dispel': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-staff', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('freeze', 'lightning-bolt', 'fire-bolt', 'heal', 'firewall', 'dispel'),
    tactics: [t('opportunist'), t('nimble')],
  },
  {
    id: 'u4', name: 'Sera Holloway', level: 1, exp: 20, expToNext: 100, age: 16, health: 80, recoveryTicksLeft: 0, isResting: false,
    class: null, proficiencies: [], locationId: null,
    abilities: { strength: 3, agility: 3, dexterity: 3, constitution: 3, intelligence: 3 },
    abilityPoints: 30, skillPoints: 1, learnedSkills: {},
    travelPath: null,
    weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: [...EMPTY_ACTION_SLOTS],
    tactics: [t('last-stand')],
  },
  {
    id: 'u5', name: 'Davan Cobble', level: 2, exp: 120, expToNext: 180, age: 28, health: 67, recoveryTicksLeft: 0, isResting: false,
    class: null, proficiencies: ['Tools', 'Mining'], locationId: null,
    abilities: { strength: 6, agility: 4, dexterity: 5, constitution: 6, intelligence: 3 },
    abilityPoints: 18, skillPoints: 1, learnedSkills: {},
    travelPath: null,
    weaponSets: [{ mainHand: null, offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, sideboard1: 'eq-pickaxe', sideboard2: null, accessory: null },
    actionSlots: [...EMPTY_ACTION_SLOTS],
    tactics: [t('armored'), t('counterattacker')],
  },
  {
    id: 'u6', name: 'Lyra Briar', level: 5, exp: 750, expToNext: 800, age: 35, health: 90, recoveryTicksLeft: 0, isResting: false,
    class: 'Rogue', proficiencies: ['Daggers', 'Lockpicks'], locationId: 'geffen-field-1',
    abilities: { strength: 6, agility: 9, dexterity: 8, constitution: 5, intelligence: 5 },
    abilityPoints: 22, skillPoints: 3, learnedSkills: { 'keen-eyes': 5, 'arrow-shower': 2, 'ankle-snare': 1, 'cloak': 1, 'back-stab': 3, 'sight': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-shortsword', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('cloak', 'back-stab', 'arrow-shower', 'ankle-snare', 'sight'),
    tactics: [t('opportunist'), t('nimble'), t('retreater')],
  },
]
