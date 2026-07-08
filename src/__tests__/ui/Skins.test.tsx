// Battlefield skin seam: the store's `battleSkin` swaps the token body (circle ↔
// paper) at runtime without touching the chip contract — the per-token `title`
// stays the stable handle either way (Lod.test relies on it), and the paper body
// is pure render (no engine/store reads). Also pins the boot resolution order.
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useGameStore } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'
import { createBattle, addCombatant, type BattleState } from '@/engine'
import { bootBattleSkin, BODY_RENDER_PROBE, TOKEN_SKINS } from '@/render/skins'
import { eu } from '../engine/helpers'
import type { Location } from '@/types'

const LOC: Location = {
  id: 'L1', region: 'world', name: 'Field', description: '', traits: [],
  monsterIds: ['x'], familiarityMax: 100, connections: [], openWorld: true, openWorldSize: 80,
}

function openBattle(): BattleState {
  const b = createBattle({ playerUnits: [], enemyUnits: [], mode: 'open', cols: 80, rows: 80 })
  addCombatant(b, eu({ id: 'h1', name: 'Hero', team: 'player', visionRange: 10 }), 'player', undefined, { x: 40, y: 40 })
  addCombatant(b, eu({ id: 'e1', name: 'Foe', team: 'enemy' }), 'enemy', undefined, { x: 42, y: 40 })
  b.events = []
  return b
}

function show(b: BattleState) {
  useGameStore.setState({ units: [], equipment: [], locations: [LOC], battles: { L1: b } })
  return render(<BattleView locationId="L1" />)
}

beforeEach(() => {
  cleanup()
  localStorage.removeItem('battle-skin')
  useGameStore.setState({ battleSkin: 'circle' })
})

describe('battlefield skins', () => {
  it('battleSkin=circle renders classic debug bodies, with the chip title handle', () => {
    useGameStore.setState({ battleSkin: 'circle' })
    const { container, getByTitle } = show(openBattle())
    expect(container.querySelectorAll('[data-skin="circle"]').length).toBe(2)
    expect(getByTitle(/Hero —/)).toBeTruthy()   // title rides the chip wrapper
    expect(container.querySelector('[data-skin="paper"]')).toBeNull()
  })

  it('battleSkin=paper swaps every token body, keeping the title handle', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const { container, getByTitle } = show(openBattle())
    const bodies = container.querySelectorAll('[data-skin="paper"]')
    expect(bodies.length).toBe(2)
    expect(getByTitle(/Hero —/)).toBeTruthy()
    expect(container.querySelector('[data-skin="circle"]')).toBeNull()
    // the paper skin carries facing in the body — the separate FacingNub is gone,
    // and the body brings its own vector shapes
    expect(bodies[0].querySelector('svg')).toBeTruthy()
  })

  // The memo contract, end-to-end: a store-tick re-render where nothing visual
  // changed must reconcile ZERO body subtrees. This is the perf property that
  // keeps rich skins at fps parity (combatants mutate in place, so the caller
  // must feed the memo'd bodies stable primitives — quantized facing/dims, no
  // hp-bearing title). If this fails, someone reintroduced prop churn.
  it('memo: an unchanged battle re-render reconciles zero token bodies', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const b = openBattle()
    show(b)
    const before = BODY_RENDER_PROBE.count
    expect(before).toBeGreaterThan(0)                    // mount rendered the bodies
    // simulate the tick's re-render: new battle identity, same in-place combatants
    act(() => useGameStore.setState({ battles: { L1: { ...b, round: b.round + 1 } } }))
    expect(BODY_RENDER_PROBE.count).toBe(before)
  })

  it('memo: a real visual change re-renders only the changed body', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const b = openBattle()
    show(b)
    const before = BODY_RENDER_PROBE.count
    b.combatants[0].facing = { x: 1, y: 0 }              // hero turns east (was north)
    act(() => useGameStore.setState({ battles: { L1: { ...b, round: b.round + 1 } } }))
    expect(BODY_RENDER_PROBE.count).toBe(before + 1)     // hero body only, not the foe's
  })

  // Body LOD: the far/dense-zoom body collapses the stacked parts into one
  // merged silhouette (2 paths). Per-token node count is what drives style-recalc
  // across a big mob, so this must stay a big reduction (the dense-mob perf win).
  it('simple (far-LOD) body renders far fewer paths than the full body', () => {
    const Paper = TOKEN_SKINS.paper
    const dims = { width: '32px', height: '32px', fontSize: '13px' }
    const paths = (simple: boolean) => {
      const { container, unmount } = render(
        <Paper glyph="" tone="enemy" bodyShape="canine" alive selected={false} facingDeg={0} creature simple={simple} dims={dims} />,
      )
      const n = container.querySelectorAll('svg path').length
      unmount()
      return n
    }
    const full = paths(false), simple = paths(true)
    expect(simple).toBeLessThanOrEqual(2)          // merged base + lit
    expect(full).toBeGreaterThan(simple * 3)        // the full wolf is many plates+accents
  })

  // The idle (breathe/sway) seam: the same data-* contract as atk/walk. The
  // body statically tags its idle parts; BattleChip flips `animate-idle` on the
  // wrapper only while a detail-LOD token is alive + still — a class swap that
  // never touches the memo'd body, and a no-op at far-LOD (the merged body
  // carries no data-idle nodes).
  it('idle parts: the thiefBug body emits data-idle groups at full detail, none at far-LOD', () => {
    const Paper = TOKEN_SKINS.paper
    const dims = { width: '32px', height: '32px', fontSize: '13px' }
    const { container, unmount } = render(
      <Paper glyph="" tone="enemy" bodyShape="thiefBug" alive selected={false} facingDeg={0} creature dims={dims} />,
    )
    expect(container.querySelectorAll('[data-idle="breathe"]').length).toBe(2)   // abdomen plate + wing seam
    expect(container.querySelectorAll('[data-idle="sway"]').length).toBe(1)      // both antennae, one scissoring part
    unmount()
    const { container: far } = render(
      <Paper glyph="" tone="enemy" bodyShape="thiefBug" alive selected={false} facingDeg={0} creature simple dims={dims} />,
    )
    expect(far.querySelectorAll('[data-idle]').length).toBe(0)
    expect(far.querySelectorAll('svg path').length).toBeLessThanOrEqual(2)       // merged base + lit
  })

  it('idle gating: a still detail-LOD token carries animate-idle; a moving one swaps to animate-walk', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const b = openBattle()
    const { container } = show(b)
    expect(container.querySelectorAll('.animate-idle').length).toBe(2)
    b.combatants[0].moving = true
    act(() => useGameStore.setState({ battles: { L1: { ...b, round: b.round + 1 } } }))
    expect(container.querySelectorAll('.animate-idle').length).toBe(1)
    expect(container.querySelectorAll('.animate-walk').length).toBe(1)
  })

  it('bootBattleSkin: localStorage > default, garbage ignored', () => {
    expect(bootBattleSkin()).toBe('paper')
    localStorage.setItem('battle-skin', 'circle')
    expect(bootBattleSkin()).toBe('circle')
    localStorage.setItem('battle-skin', 'sprite-sheet-3000')
    expect(bootBattleSkin()).toBe('paper')
  })
})
