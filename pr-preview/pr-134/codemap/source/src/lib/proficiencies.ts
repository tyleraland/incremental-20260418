// §F proficiency tags — the party-composition derive (idea catalog: "a derive
// alongside getDerivedStats / getUnitTraits; a small abstract tag set; switch
// on tags, never class ids").
//
// getProficiencyTags is the game side of the mapgen lock-and-key seam: the tags
// a unit contributes to composition gates. Computed at read time, never stored
// (the derived-stats pattern). NOTE: `Unit.proficiencies` is a DIFFERENT thing
// (weapon/armor training labels like 'Swords' — see data/traits.ts); these are
// the abstract §F puzzle tags from the mapgen vocabulary.
//
// Extension points, in the order they'll likely land (keep the union here, in
// ONE place, so gates never reach into skills/equipment themselves):
//   1. class (today): the baseline kit below.
//   2. learned skills: e.g. a Cloak-line skill granting 'perception', a holy
//      skill granting 'light' — map skillId → tags here when wanted.
//   3. equipment: e.g. a lantern accessory granting 'light', lockpicks
//      granting 'disarm' (unit.proficiencies already carries 'Lockpicks').
//   4. traits/quests: story-granted tags.

import { PROFICIENCY_TAGS, type ProficiencyTag } from '@/mapgen'

// The baseline class kits. Deliberate first-guess balance (see
// src/mapgen/CLAUDE.md → phase 4 open questions): every class opens
// SOMETHING, no class opens everything, 'perception' is the most shared.
export const CLASS_PROFICIENCY_TAGS: Record<string, ProficiencyTag[]> = {
  Fighter: ['might'],
  Rogue:   ['disarm', 'perception'],
  Mage:    ['arcane', 'lore'],
  Cleric:  ['holy', 'light'],
  Ranger:  ['perception', 'mobility'],
}

export function getProficiencyTags(unit: { class: string | null }): ProficiencyTag[] {
  return unit.class ? CLASS_PROFICIENCY_TAGS[unit.class] ?? [] : []
}

// The union a deployed party brings to a map's composition gates — sorted so
// the same kit always produces the same generation params (cache keys,
// deterministic variants).
export function partyProficiencyTags(units: { class: string | null }[]): ProficiencyTag[] {
  const set = new Set<ProficiencyTag>()
  for (const u of units) for (const t of getProficiencyTags(u)) set.add(t)
  return PROFICIENCY_TAGS.filter((t) => set.has(t))
}
