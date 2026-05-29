import type { Unit, ActionSlotEntry } from '@/types'
import { ACTION_SLOT_COUNT } from '@/types'

const t = (id: string, rank = 1) => ({ id, rank })
// Build an action bar from a list of skill ids (pads to ACTION_SLOT_COUNT).
const bar = (...skillIds: string[]): (ActionSlotEntry | null)[] => {
  const slots: (ActionSlotEntry | null)[] = skillIds.map((id) => ({ kind: 'skill' as const, id }))
  while (slots.length < ACTION_SLOT_COUNT) slots.push(null)
  return slots
}

// One hero per class (Fighter doubled — offensive bruiser vs. defensive knight)
// so the party covers tank / bruiser / archer / mage / healer / assassin. Class
// trees aren't built yet, so each kit (abilities, gear, learned skills, tactics)
// is just hand-set here to give every role a deep set of options to play with.
export const INITIAL_UNITS: Unit[] = [
  // ── Fighter (offensive 2H bruiser) ──────────────────────────────────────────
  {
    id: 'u1', name: 'Aldric Thorne', level: 3, exp: 245, expToNext: 312, age: 24, health: 95, recoveryTicksLeft: 0, isResting: false,
    class: 'Fighter', proficiencies: ['Swords', 'Heavy Armor'], locationId: null,
    abilities: { strength: 9, agility: 5, dexterity: 4, constitution: 7, intelligence: 2 },
    abilityPoints: 20, skillPoints: 1,
    learnedSkills: { 'sword-mastery-1h': 3, 'sword-mastery-2h': 2, 'bash': 3, 'hammer-fall': 2, 'boost-agility': 2 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-greatsword', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-chainmail', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('bash', 'hammer-fall', 'boost-agility'),
    tactics: [t('opportunist'), t('charger'), t('last-stand'), t('tank-buster')],
  },
  // ── Ranger (kiting archer) ──────────────────────────────────────────────────
  {
    id: 'u2', name: 'Mira Ashdown', level: 4, exp: 80, expToNext: 420, age: 19, health: 90, recoveryTicksLeft: 0, isResting: false,
    class: 'Ranger', proficiencies: ['Bows'], locationId: 'prontera-field-1',
    abilities: { strength: 6, agility: 7, dexterity: 8, constitution: 4, intelligence: 3 },
    abilityPoints: 15, skillPoints: 1,
    learnedSkills: { 'keen-eyes': 3, 'eagle-eyes': 2, 'arrow-shower': 3, 'ankle-snare': 2, 'poison': 2 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-bow', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('arrow-shower', 'ankle-snare', 'poison'),
    tactics: [t('focus-casters'), t('opportunist'), t('retreater'), t('kiter')],
  },
  // ── Mage (burst nuker) ──────────────────────────────────────────────────────
  {
    id: 'u3', name: 'Theron Vance', level: 4, exp: 420, expToNext: 520, age: 31, health: 82, recoveryTicksLeft: 0, isResting: false,
    class: 'Mage', proficiencies: ['Staves', 'Wands'], locationId: 'prontera-city',
    abilities: { strength: 3, agility: 5, dexterity: 6, constitution: 4, intelligence: 9 },
    abilityPoints: 25, skillPoints: 2,
    learnedSkills: { 'arcane-knowledge': 3, 'fire-bolt': 3, 'lightning-bolt': 2, 'frost-bolt': 2, 'freeze': 2, 'firewall': 1, 'lightning-storm': 1, 'dispel': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-staff', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('freeze', 'lightning-bolt', 'fire-bolt', 'lightning-storm', 'firewall', 'dispel'),
    tactics: [t('storm-caller'), t('retreater'), t('wary-caster'), t('nimble')],
  },
  // ── Cleric (back-line healer / support) ─────────────────────────────────────
  {
    id: 'u4', name: 'Sera Holloway', level: 3, exp: 20, expToNext: 312, age: 16, health: 80, recoveryTicksLeft: 0, isResting: false,
    class: 'Cleric', proficiencies: ['Rods'], locationId: null,
    abilities: { strength: 3, agility: 4, dexterity: 5, constitution: 5, intelligence: 8 },
    abilityPoints: 30, skillPoints: 1,
    learnedSkills: { 'arcane-knowledge': 2, 'heal': 3, 'aoe-heal': 2, 'boost-agility': 3, 'dispel': 1, 'sight': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-rod', offHand: 'eq-shield-wood' }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('heal', 'aoe-heal', 'boost-agility', 'dispel', 'sight'),
    tactics: [t('retreater'), t('kiter'), t('nimble')],
  },
  // ── Fighter (defensive knight / tank) ───────────────────────────────────────
  {
    id: 'u5', name: 'Davan Cobble', level: 2, exp: 120, expToNext: 180, age: 28, health: 67, recoveryTicksLeft: 0, isResting: false,
    class: 'Fighter', proficiencies: ['Swords', 'Heavy Armor'], locationId: null,
    abilities: { strength: 6, agility: 4, dexterity: 4, constitution: 8, intelligence: 2 },
    abilityPoints: 18, skillPoints: 1,
    learnedSkills: { 'sword-mastery-1h': 3, 'bash': 3, 'hammer-fall': 2 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-sword', offHand: 'eq-shield-iron' }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-chainmail', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('bash', 'hammer-fall'),
    tactics: [t('threatening-presence'), t('shield-wall'), t('guardian'), t('counterattacker')],
  },
  // ── Rogue (stealth assassin) ────────────────────────────────────────────────
  {
    id: 'u6', name: 'Lyra Briar', level: 5, exp: 750, expToNext: 800, age: 35, health: 90, recoveryTicksLeft: 0, isResting: false,
    class: 'Rogue', proficiencies: ['Daggers', 'Lockpicks'], locationId: 'geffen-field-1',
    abilities: { strength: 6, agility: 9, dexterity: 8, constitution: 5, intelligence: 5 },
    abilityPoints: 22, skillPoints: 3,
    learnedSkills: { 'keen-eyes': 5, 'cloak': 1, 'back-stab': 3, 'arrow-shower': 2, 'ankle-snare': 1, 'sight': 1, 'poison': 2 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-knife', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('cloak', 'back-stab', 'arrow-shower', 'ankle-snare', 'sight', 'poison'),
    tactics: [t('focus-casters'), t('opportunist'), t('retreater'), t('ambusher')],
  },
]
