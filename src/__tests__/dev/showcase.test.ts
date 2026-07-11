// Showcase battles (src/dev/showcaseBattles.ts) — the curated scenes behind the
// sandbox's Showcase source and the `?showcase=<id>` deep-links. Guard that each
// builds deterministically, survives the serialize→replay round-trip a shared
// link relies on, and actually exhibits the behaviour it advertises.
import { describe, it, expect } from 'vitest'
import { SHOWCASES, showcaseById } from '@/dev/showcaseBattles'
import { serializeBattle, deserializeBattle, advanceRound, distance, type BattleState } from '@/engine'

const find = (b: BattleState, id: string) => b.combatants.find((c) => c.id === id)!
const run = (b: BattleState, n: number) => { for (let i = 0; i < n; i++) advanceRound(b) }

describe('showcase catalog', () => {
  it('every entry builds and round-trips through a BSNAP (what a share link does)', () => {
    for (const sc of SHOWCASES) {
      const b = sc.build()
      expect(b.combatants.length, sc.id).toBeGreaterThan(0)
      const clone = deserializeBattle(serializeBattle(b))
      expect(clone.combatants.length, sc.id).toBe(b.combatants.length)
      // Deterministic: same build advanced N rounds matches its own replay.
      const a = sc.build(); const c = deserializeBattle(serializeBattle(sc.build()))
      run(a, 20); run(c, 20)
      expect(c.combatants.map((x) => `${x.id}:${x.pos.x.toFixed(3)},${x.pos.y.toFixed(3)}`))
        .toEqual(a.combatants.map((x) => `${x.id}:${x.pos.x.toFixed(3)},${x.pos.y.toFixed(3)}`))
    }
  })

  it('kite-anchor: melees the golem, ranges the sorcerer', () => {
    const b = showcaseById('kite-anchor')!.build()
    run(b, 40)   // the golem-mage frost-bolts (3-round channels) while closing, so give it time to reach Bash range
    // vs-golem closed to melee (bolts do nothing to magicDef 999); vs-mage held at range.
    expect(distance(find(b, 'vs-golem').pos, find(b, 'golem').pos)).toBeLessThan(2.5)
    expect(distance(find(b, 'vs-mage').pos, find(b, 'sorcerer').pos)).toBeGreaterThan(3)
  })

  it('blink-escape: the mage teleports out of the pocket', () => {
    const b = showcaseById('blink-escape')!.build()
    const start = { ...find(b, 'mage').pos }
    let blinked = false
    let prev = { ...start }
    for (let r = 0; r < 60 && !blinked; r++) {
      advanceRound(b)
      const m = find(b, 'mage')
      if (distance(prev, m.pos) > 4) blinked = true   // a walk step is ≤ ~1 cell
      prev = { ...m.pos }
    }
    expect(blinked).toBe(true)
    expect(find(b, 'mage').moveAbilityCds['teleport']).toBeGreaterThan(0)
  })

  it('moat-kite: the mage holds its side of the moat (never crosses)', () => {
    const b = showcaseById('moat-kite')!.build()
    let maxY = -Infinity
    for (let r = 0; r < 40; r++) { advanceRound(b); maxY = Math.max(maxY, find(b, 'mage').pos.y) }
    // The moat spans y 18..21; the mage starts below it (y 26) and must stay below.
    expect(find(b, 'mage').pos.y).toBeGreaterThan(21)
    // …and it actually fought (fired across the gap): at least one grunt took damage.
    expect(find(b, 'grunt-a').hp + find(b, 'grunt-b').hp).toBeLessThan(320)
  })

  it('posture-routes: wary clears-first where bold plows', () => {
    const b = showcaseById('posture-routes')!.build()
    let warySawClearing = false, boldSawClearing = false
    for (let r = 0; r < 120; r++) {
      advanceRound(b)
      if (find(b, 'wary').travelClearing) warySawClearing = true
      if (find(b, 'bold').travelClearing) boldSawClearing = true
    }
    expect(warySawClearing).toBe(true)    // wary stopped to fight the ring
    expect(boldSawClearing).toBe(false)   // bold plowed through
  })
})
