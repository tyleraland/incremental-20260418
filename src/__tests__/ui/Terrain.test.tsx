// Organic terrain layer (render/terrain.tsx): deterministic per-location ground
// dressing behind the ArenaSkin.terrain hook. Pins the properties that keep it
// safe: seeded determinism (NO Math.random — screenshots/replays stable), the
// scatter's keep-clear guarantee (props never sit inside a collision rect), the
// wall blob merge, and the build memo (an unchanged battle re-render must not
// rebuild — the "static background ≈ free" cost model).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useGameStore } from '@/stores/useGameStore'
import { BattleView } from '@/components/BattleView'
import { createBattle, addCombatant, type BattleState } from '@/engine'
import { buildTerrainModel, PaperTerrain, terrainSvg, TERRAIN_BUILD_PROBE, type TerrainProps } from '@/render/terrain'
import { PAPER_PALETTE } from '@/render/palette'
import { generateMap, specBarriers, type MapSpec } from '@/mapgen'
import { FIELD_RECIPE } from '@/mapgen/recipes/field'
import { CITY_RECIPE } from '@/mapgen/recipes/city'
import { eu } from '../engine/helpers'
import type { Location } from '@/types'

const PROPS: TerrainProps = {
  biome: 'grass',
  cols: 40,
  rows: 40,
  barriers: [
    { x: 8, y: 8, w: 4, h: 3 },                    // lone wall
    { x: 20, y: 20, w: 4, h: 3 },                  // overlapping pair → one blob
    { x: 23, y: 21.5, w: 3, h: 3 },
    { x: 30, y: 10, w: 3, h: 2, kind: 'cliff' },
  ],
  seed: 12345,
  rim: true,
}

const LOC: Location = {
  id: 'L1', region: 'world', name: 'Field', description: '', traits: [],
  monsterIds: ['x'], familiarityMax: 100, connections: [], openWorld: true, openWorldSize: 80,
}

function openBattle(): BattleState {
  const b = createBattle({
    playerUnits: [], enemyUnits: [], mode: 'open', cols: 80, rows: 80,
    barriers: [{ x: 10, y: 10, w: 3, h: 3 }, { x: 60, y: 55, w: 4, h: 2, kind: 'cliff' }],
  })
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

describe('terrain model', () => {
  it('is deterministic per seed and uses no Math.random', () => {
    const rng = vi.spyOn(Math, 'random')
    const a = buildTerrainModel(PROPS)
    const b = buildTerrainModel({ ...PROPS })
    expect(rng).not.toHaveBeenCalled()
    rng.mockRestore()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const other = buildTerrainModel({ ...PROPS, seed: 999 })
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(a))
  })

  it('merges overlapping wall rects into one multi-subpath blob', () => {
    const m = buildTerrainModel(PROPS)
    expect(m.walls.length).toBe(2)                       // lone + merged pair
    expect(m.walls.filter((w) => w.multi).length).toBe(1)
    expect(m.cliffs.length).toBe(1)
    expect(m.rim).not.toBeNull()
    expect(buildTerrainModel({ ...PROPS, rim: false }).rim).toBeNull()
  })

  it('scatters props clear of collision rects and keep-clear boxes', () => {
    const avoid = [{ x: 2, y: 30, w: 3, h: 3 }]          // a "portal" box
    const m = buildTerrainModel({ ...PROPS, avoid })
    expect(m.props.length).toBeGreaterThan(10)
    for (const p of m.props) {
      const wx = p.x, wy = PROPS.rows - p.y              // model y is svg-flipped
      for (const r of [...PROPS.barriers, ...avoid]) {
        const inside = wx > r.x - 0.3 && wx < r.x + r.w + 0.3 && wy > r.y - 0.3 && wy < r.y + r.h + 0.3
        expect(inside).toBe(false)
      }
    }
  })

  it('bakes to ONE canvas layer (no live SVG DOM); the source svg is deterministic', () => {
    const a = render(<PaperTerrain {...PROPS} />)
    expect(a.container.querySelector('svg')).toBeNull()             // zero DOM cost in the animated layer
    expect(a.container.querySelector('canvas[data-terrain]')).toBeTruthy()  // rasterized bitmap layer
    // the vector source it rasterizes IS deterministic + non-trivial (raster
    // happens async off the real canvas; jsdom can't paint, so assert the source)
    const svg = terrainSvg({ ...PROPS })
    expect(svg).toBe(terrainSvg({ ...PROPS }))
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(20)
  })
})

describe('terrain consumes a MapSpec (§mapgen phase 2)', () => {
  // Deterministically pick a seed whose field actually has a lake, so the
  // water assertions are about behaviour, not seed luck.
  function lakeSpec(): MapSpec {
    for (let seed = 1; seed < 30; seed++) {
      const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 64, themes: ['plains', 'water'], maxBarriers: 16 })
      if (r.report.ok && r.spec.collision.some((c) => c.material === 'deep-water')) return r.spec
    }
    throw new Error('no lake seed found in 30 tries — hydrology regressed')
  }
  const spec = lakeSpec()
  const props: TerrainProps = {
    biome: 'grass', cols: spec.cols, rows: spec.rows,
    barriers: specBarriers(spec), seed: 777, rim: true, spec,
  }

  it('paints the surface plane as organic washes — water present, deterministic', () => {
    const rng = vi.spyOn(Math, 'random')
    const a = buildTerrainModel(props)
    const b = buildTerrainModel({ ...props })
    expect(rng).not.toHaveBeenCalled()
    rng.mockRestore()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const fills = a.surface.map((s) => s.fill)
    expect(fills).toContain(PAPER_PALETTE.waterShallow)
    expect(fills).toContain(PAPER_PALETTE.waterDeep)
  })

  it('deep-water collision rects do NOT paint as stone cliffs; other cliffs still do', () => {
    const m = buildTerrainModel(props)
    const nonWaterCliffs = spec.collision.filter((c) => c.kind === 'cliff' && c.material !== 'deep-water')
    expect(m.cliffs.length).toBe(nonWaterCliffs.length)
    // walls unaffected by the material filter (cluster-merged, so ≤ rect count)
    expect(m.walls.length).toBeGreaterThan(0)
  })

  it('the scatter plane replaces the random scatter and stays clear of collision', () => {
    const m = buildTerrainModel(props)
    expect(m.props.length).toBe(spec.scatter.length)
    for (const p of m.props) {
      const wx = p.x, wy = spec.rows - p.y
      for (const r of spec.collision) {
        const inside = wx > r.x && wx < r.x + r.w && wy > r.y && wy < r.y + r.h
        expect(inside, `prop at ${wx},${wy} inside ${JSON.stringify(r)}`).toBe(false)
      }
    }
  })

  it('bakes to ONE canvas layer; the source svg keys on the spec', () => {
    const { container } = render(<PaperTerrain {...props} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('canvas[data-terrain]')).toBeTruthy()
    // spec-less render of the same geometry differs (washes only exist with a spec)
    expect(terrainSvg({ ...props })).not.toBe(terrainSvg({ ...props, spec: undefined }))
  })
})

describe('terrain consumes a CITY MapSpec (§city buildings + paving)', () => {
  const spec = generateMap(CITY_RECIPE, { recipe: 'city', seed: 'prontera-city', size: 50, themes: ['city'], maxBarriers: 40 }).spec
  const props: TerrainProps = {
    biome: 'plaza', cols: spec.cols, rows: spec.rows,
    barriers: specBarriers(spec), seed: 9, rim: true, spec,
  }

  it('renders BUILT-material walls as buildings, not organic rock blobs', () => {
    const buildings = spec.collision.filter((c) => c.kind === 'wall' && (c.material === 'cut-stone' || c.material === 'wood'))
    expect(buildings.length).toBeGreaterThan(4)
    const m = buildTerrainModel(props)
    // every built wall becomes a building; none leak into the blob-wall layer
    expect(m.buildings.length).toBe(buildings.length)
    expect(m.walls.length).toBe(0)
    // paved streets + plaza produce a paving mosaic overlay
    expect(m.paving.length).toBeGreaterThan(0)
  })

  it('is deterministic (no Math.random) and keys the memo on the spec', () => {
    const rng = vi.spyOn(Math, 'random')
    const a = buildTerrainModel(props)
    const b = buildTerrainModel({ ...props })
    expect(rng).not.toHaveBeenCalled()
    rng.mockRestore()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const { container } = render(<PaperTerrain {...props} />)
    expect(container.querySelector('svg')).toBeNull()                       // still one baked layer
    expect(container.querySelector('canvas[data-terrain]')).toBeTruthy()
  })
})

describe('terrain in battle view', () => {
  it('paper skin renders the terrain layer and drops the rect barrier divs', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const { container } = show(openBattle())
    expect(container.querySelector('[data-terrain]')).toBeTruthy()
    // classic rect barriers replaced by the blob layer
    expect(container.querySelector('.bg-stone-700\\/70')).toBeNull()
  })

  it('circle skin keeps the classic rect barriers, no terrain layer', () => {
    const { container } = show(openBattle())
    expect(container.querySelector('[data-terrain]')).toBeNull()
    expect(container.querySelector('.bg-stone-700\\/70')).toBeTruthy()
  })

  it('memo: an unchanged battle re-render does not rebuild the terrain', () => {
    useGameStore.setState({ battleSkin: 'paper' })
    const b = openBattle()
    show(b)
    const before = TERRAIN_BUILD_PROBE.count
    expect(before).toBeGreaterThan(0)
    act(() => useGameStore.setState({ battles: { L1: { ...b, round: b.round + 1 } } }))
    expect(TERRAIN_BUILD_PROBE.count).toBe(before)
  })
})
