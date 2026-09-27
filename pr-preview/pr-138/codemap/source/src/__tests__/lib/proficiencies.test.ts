// getProficiencyTags — the §F party-composition derive (class → abstract tags;
// the game side of mapgen's lock-and-key seam). Distinct from
// Unit.proficiencies (weapon training labels).

import { describe, it, expect } from 'vitest'
import { getProficiencyTags, partyProficiencyTags, CLASS_PROFICIENCY_TAGS } from '@/lib/proficiencies'
import { PROFICIENCY_TAGS } from '@/mapgen'

describe('proficiency tags derive', () => {
  it('every class kit uses only vocabulary tags; a Novice contributes nothing', () => {
    for (const [cls, tags] of Object.entries(CLASS_PROFICIENCY_TAGS)) {
      expect(tags.length, `${cls} must open something`).toBeGreaterThan(0)
      for (const t of tags) expect(PROFICIENCY_TAGS).toContain(t)
    }
    expect(getProficiencyTags({ class: null })).toEqual([])
    expect(getProficiencyTags({ class: 'Rogue' })).toEqual(['disarm', 'perception'])
  })

  it('party union is deduped and sorted in vocabulary order (stable cache keys)', () => {
    const party = [{ class: 'Ranger' }, { class: 'Rogue' }, { class: 'Ranger' }]
    expect(partyProficiencyTags(party)).toEqual(['perception', 'disarm', 'mobility'])
    expect(partyProficiencyTags([])).toEqual([])
  })

  it('no single class opens every gateable lock (composition matters)', () => {
    for (const tags of Object.values(CLASS_PROFICIENCY_TAGS)) {
      expect(tags.length).toBeLessThan(PROFICIENCY_TAGS.length / 2)
    }
  })
})
