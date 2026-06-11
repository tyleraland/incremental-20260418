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
    id: 'u1', name: 'Aldric Thorne', level: 1, exp: 0, expToNext: 10, age: 24, health: 95, recoveryTicksLeft: 0, isResting: false,
    class: 'Fighter', proficiencies: ['Swords', 'Heavy Armor'], locationId: null,
    abilities: { strength: 9, agility: 5, dexterity: 4, constitution: 7, intelligence: 2 },
    abilityPoints: 20, skillPoints: 1,
    learnedSkills: { 'sword-mastery-1h': 1, 'sword-mastery-2h': 1, 'bash': 1, 'hammer-fall': 1, 'boost-agility': 1, 'last-stand': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-greatsword', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-chainmail', sideboard1: null, sideboard2: null, accessory: null },
    // Last Stand is now a skill (it buffs stats); it brings its own "use near
    // death" tactic, so the manual slots are pure behaviour.
    actionSlots: bar('bash', 'hammer-fall', 'boost-agility', 'last-stand'),
    tactics: [t('opportunist'), t('charger'), t('tank-buster')],
  },
  // ── Ranger (kiting archer) ──────────────────────────────────────────────────
  {
    id: 'u2', name: 'Mira Ashdown', level: 1, exp: 0, expToNext: 10, age: 19, health: 90, recoveryTicksLeft: 0, isResting: false,
    class: 'Ranger', proficiencies: ['Bows'], locationId: 'prontera-field-1',
    abilities: { strength: 6, agility: 7, dexterity: 8, constitution: 4, intelligence: 3 },
    abilityPoints: 15, skillPoints: 1,
    learnedSkills: { 'keen-eyes': 1, 'eagle-eyes': 1, 'arrow-shower': 1, 'ankle-snare': 1, 'poison': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-bow', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('arrow-shower', 'ankle-snare', 'poison'),
    tactics: [t('focus-casters'), t('opportunist'), t('retreater'), t('kiter')],
  },
  // ── Mage (burst nuker) ──────────────────────────────────────────────────────
  {
    id: 'u3', name: 'Theron Vance', level: 1, exp: 0, expToNext: 10, age: 31, health: 82, recoveryTicksLeft: 0, isResting: false,
    class: 'Mage', proficiencies: ['Staves', 'Wands'], locationId: 'prontera-city',
    abilities: { strength: 3, agility: 5, dexterity: 6, constitution: 4, intelligence: 9 },
    abilityPoints: 25, skillPoints: 2,
    learnedSkills: { 'arcane-knowledge': 1, 'fire-bolt': 1, 'fireball': 1, 'lightning-bolt': 1, 'frost-bolt': 1, 'freeze': 1, 'firewall': 1, 'lightning-storm': 1, 'dispel': 1, 'evasion': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-staff', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: null, sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('fire-bolt', 'fireball', 'lightning-bolt', 'lightning-storm', 'firewall', 'freeze'),
    // Storm Caller is inherited from the AoE skills (Lightning Storm / Firewall),
    // so it isn't equipped manually here — see SKILL_TACTICS. Evasion (dodge) is a
    // passive skill now, not a tactic. Exploit Weakness fits a mage juggling elements.
    tactics: [t('retreater'), t('wary-caster'), t('exploit-weakness')],
  },
  // ── Cleric (back-line healer / support) ─────────────────────────────────────
  {
    id: 'u4', name: 'Sera Holloway', level: 1, exp: 0, expToNext: 10, age: 16, health: 80, recoveryTicksLeft: 0, isResting: false,
    class: 'Cleric', proficiencies: ['Rods'], locationId: null,
    abilities: { strength: 3, agility: 4, dexterity: 5, constitution: 5, intelligence: 8 },
    abilityPoints: 30, skillPoints: 1,
    learnedSkills: { 'arcane-knowledge': 1, 'heal': 1, 'aoe-heal': 1, 'boost-agility': 1, 'bless': 1, 'molasses': 1, 'dispel': 1, 'sight': 1, 'evasion': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-rod', offHand: 'eq-shield-wood' }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('boost-agility', 'bless', 'heal', 'aoe-heal', 'molasses', 'dispel'),
    tactics: [t('chain-1-2'), t('kiter')],
  },
  // ── Fighter (defensive knight / tank) ───────────────────────────────────────
  {
    id: 'u5', name: 'Davan Cobble', level: 1, exp: 0, expToNext: 10, age: 28, health: 67, recoveryTicksLeft: 0, isResting: false,
    class: 'Fighter', proficiencies: ['Swords', 'Heavy Armor'], locationId: null,
    abilities: { strength: 6, agility: 4, dexterity: 4, constitution: 8, intelligence: 2 },
    abilityPoints: 18, skillPoints: 1,
    // The party's dedicated tank: Defensive Stance (high threat to hold aggro) +
    // Toughness (damage cut) as passive skills, and Taunt on the bar to peel mobs
    // off the back line. See the §threat model and the Threat Trial showcase.
    learnedSkills: { 'sword-mastery-1h': 1, 'bash': 1, 'hammer-fall': 1, 'shield-wall': 1, 'defensive-stance': 1, 'toughness': 1, 'taunt': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-sword', offHand: 'eq-shield-iron' }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-chainmail', sideboard1: null, sideboard2: null, accessory: null },
    // Shield Wall is now a skill (it buffs DEF); it brings its own "use when under
    // attack" tactic, so the manual slots stay pure behaviour.
    actionSlots: bar('taunt', 'bash', 'hammer-fall', 'shield-wall'),
    tactics: [t('guardian'), t('counterattacker')],
  },
  // ── Rogue (stealth assassin) ────────────────────────────────────────────────
  {
    id: 'u6', name: 'Lyra Briar', level: 1, exp: 0, expToNext: 10, age: 35, health: 90, recoveryTicksLeft: 0, isResting: false,
    class: 'Rogue', proficiencies: ['Daggers', 'Lockpicks'], locationId: 'geffen-field-1',
    abilities: { strength: 6, agility: 9, dexterity: 8, constitution: 5, intelligence: 5 },
    abilityPoints: 22, skillPoints: 3,
    learnedSkills: { 'keen-eyes': 1, 'cloak': 1, 'back-stab': 1, 'arrow-shower': 1, 'ankle-snare': 1, 'sight': 1, 'poison': 1 },
    travelPath: null,
    weaponSets: [{ mainHand: 'eq-knife', offHand: null }, { mainHand: null, offHand: null }],
    activeWeaponSet: 0,
    equipment: { armor: 'eq-leather', sideboard1: null, sideboard2: null, accessory: null },
    actionSlots: bar('cloak', 'back-stab', 'arrow-shower', 'ankle-snare', 'sight', 'poison'),
    // Ambusher is inherited from Cloak (and Storm Caller from Arrow Shower), so
    // the manual slots go to targeting/retreat — see SKILL_TACTICS.
    tactics: [t('focus-casters'), t('opportunist'), t('retreater')],
  },
]
