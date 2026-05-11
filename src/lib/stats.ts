import type { Unit, EquipmentItem, DerivedStats, SkillBonuses, EquipSlot, Element } from '@/types'
import { SKILL_REGISTRY } from '@/data/skills'

function skillBonusTotal(unit: Unit): SkillBonuses {
  const b: SkillBonuses = {}
  for (const [id, lv] of Object.entries(unit.learnedSkills)) {
    if (!lv) continue
    const skill = SKILL_REGISTRY[id]; if (!skill) continue
    for (const [k, v] of Object.entries(skill.getBonuses(lv)) as [keyof SkillBonuses, number][])
      b[k] = (b[k] ?? 0) + v
  }
  return b
}

export function getDerivedStats(unit: Unit, allEquipment: EquipmentItem[]): DerivedStats {
  const sb  = skillBonusTotal(unit)
  const str = unit.abilities.strength     + (sb.strength     ?? 0)
  const agi = unit.abilities.agility      + (sb.agility      ?? 0)
  const dex = unit.abilities.dexterity    + (sb.dexterity    ?? 0)
  const con = unit.abilities.constitution + (sb.constitution ?? 0)
  const int = unit.abilities.intelligence + (sb.intelligence ?? 0)

  const eq = { atk: 0, def: 0, matk: 0, mdef: 0, range: 0 }
  const ws = unit.weaponSets[unit.activeWeaponSet]
  const weaponIds = [ws.mainHand, ws.offHand]
  // mainHand wins for both range and attack element (LIFO with offHand at the
  // bottom of the stack); later, temporary skill imbues will push on top.
  let attackElement: Element = 'neutral'
  let armorElement:  Element = 'neutral'
  for (const id of weaponIds) {
    if (!id) continue
    const item = allEquipment.find((e) => e.id === id); if (!item) continue
    eq.range = Math.max(eq.range, item.stats.range ?? 0)
    if (item.element) attackElement = item.element
  }
  const armorItem = unit.equipment.armor ? allEquipment.find((e) => e.id === unit.equipment.armor) : null
  if (armorItem?.element) armorElement = armorItem.element
  // Sideboard items are reserved but stat-inactive; don't sum them.
  const allIds = [...weaponIds, unit.equipment.armor, unit.equipment.accessory]
  for (const id of allIds) {
    if (!id) continue
    const item = allEquipment.find((e) => e.id === id); if (!item) continue
    eq.atk  += item.stats.attack         ?? 0
    eq.def  += item.stats.defense        ?? 0
    eq.matk += item.stats.specialAttack  ?? 0
    eq.mdef += item.stats.specialDefense ?? 0
  }

  return {
    attack:       Math.max(1, Math.floor(str * 2)               + eq.atk  + (sb.attack       ?? 0)),
    defense:      Math.max(1, Math.floor(con * 1.5)             + eq.def  + (sb.defense      ?? 0)),
    defenseEquip: eq.def,
    magicAttack:  Math.max(1, Math.floor(int * 2 + dex * 0.5)  + eq.matk + (sb.magicAttack  ?? 0)),
    magicDefense: Math.max(1, Math.floor(int * 0.5 + con)       + eq.mdef + (sb.magicDefense ?? 0)),
    attackSpeed:  Math.max(1, Math.floor(agi * 2)                          + (sb.attackSpeed  ?? 0)),
    accuracy:     Math.max(1, Math.floor(dex * 1.5 + agi * 0.5)           + (sb.accuracy     ?? 0)),
    dodge:        Math.max(1, Math.floor(agi * 2   + dex * 0.5)           + (sb.dodge        ?? 0)),
    maxHp:        Math.max(1, Math.floor(50 + con * 10)),
    moveSpeed:    Math.max(2, 10 + agi * 0.025 + (sb.moveSpeed ?? 0)), // ft/s; divide by TICKS_PER_SECOND in tick loop
    attackRange:  Math.max(5, (eq.range || 5) + (sb.attackRange ?? 0)), // feet; melee=5, bow=35
    attackElement,
    armorElement,
  }
}

export function abilityPointCost(current: number): number {
  return Math.floor((current - 1) / 10) + 1
}

// Returns the equipped item id for any slot, accounting for the weapon-set split.
export function getEquippedId(unit: Unit, slot: EquipSlot): string | null {
  if (slot === 'mainHand' || slot === 'offHand') return unit.weaponSets[unit.activeWeaponSet][slot]
  return unit.equipment[slot]
}

// Resting position on the 1D axis (feet from unit base) while not in combat.
// Melee (5 ft range) → 20 ft; bow (35 ft range) → 0 ft; linear in between.
// Also acts as a floor during combat so back-rank units hold their rank.
export function getFormationOffset(unit: Unit, equipment: EquipmentItem[]): number {
  const r = getDerivedStats(unit, equipment).attackRange
  return Math.max(0, Math.round(20 * (35 - r) / 30))
}
