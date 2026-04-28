import type { Unit, EquipmentItem, DerivedStats, SkillBonuses, EquipSlot } from '@/types'
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

  const ws     = unit.weaponSets[unit.activeWeaponSet]
  const allIds = [ws.mainHand, ws.offHand, unit.equipment.armor, unit.equipment.tool, unit.equipment.accessory]

  let weaponAtk = 0, weaponMagicAtk = 0, armorDef = 0, magicArmorDef = 0, range = 0
  let baseAps: number = 0.8   // unarmed default
  let primaryDamageType: 'physical' | 'magic' = 'physical'

  if (ws.mainHand) {
    const mh = allEquipment.find((e) => e.id === ws.mainHand)
    if (mh) {
      baseAps = mh.stats.baseAps ?? 1.0
      if (mh.stats.specialAttack) primaryDamageType = 'magic'
    }
  }

  for (const id of allIds) {
    if (!id) continue
    const item = allEquipment.find((e) => e.id === id)
    if (!item) continue
    weaponAtk      += item.stats.attack         ?? 0
    weaponMagicAtk += item.stats.specialAttack  ?? 0
    armorDef       += item.stats.defense        ?? 0
    magicArmorDef  += item.stats.specialDefense ?? 0
    if ((item.stats.range ?? 0) > range) range = item.stats.range!
  }

  const abilityAtk      = str + Math.floor(str / 10) ** 2
  const abilityMagicAtk = int + (Math.floor(int / 7) ** 2 + Math.floor(int / 5) ** 2) / 2
  const aps = Math.max(0.1, baseAps * (1 + agi / 100) * (1 + dex / 500))

  return {
    attack:              Math.max(1, weaponAtk      + abilityAtk      + (sb.attack      ?? 0)),
    magicAttack:         Math.max(1, weaponMagicAtk + abilityMagicAtk + (sb.magicAttack ?? 0)),
    aps,
    armorDefense:        Math.max(0, armorDef     + (sb.defense      ?? 0)),
    abilityDefense:      Math.max(0, con),
    magicArmorDefense:   Math.max(0, magicArmorDef + (sb.magicDefense ?? 0)),
    abilityMagicDefense: Math.max(0, int),
    accuracy:            Math.max(1, dex + unit.level + (sb.accuracy ?? 0)),
    dodge:               Math.max(0, agi           + (sb.dodge        ?? 0)),
    primaryDamageType,
    range,
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
