// §track D — intensity-paced trickle spawns: mapgen makes the stage (NavNode
// .intensity, the per-node remoteness digest), the store populates it. The
// open-world trickle on a mapGen location rolls a few scatter candidates and
// picks among them weighted by intensityAt — remote ground fills in denser,
// the spawn's calm bank stays calmer. Monster identity/level untouched; spawn
// RNG stays Math.random (pinned here, per the store-test pattern).
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, intensityScatterPos } from '@/stores/useGameStore'
import type { MapSpec } from '@/mapgen'
import type { Location } from '@/types'
import { makeUnit, resetStore, tick } from '../helpers'

afterEach(() => vi.restoreAllMocks())

// Pin Math.random to a queue: intensityScatterPos draws 2 per candidate
// (scatterPos x,y — no barriers, so no retries) then 1 weighted-pick roll.
function pinRandom(seq: number[]) {
  const q = [...seq]
  vi.spyOn(Math, 'random').mockImplementation(() => (q.length ? q.shift()! : 0))
}

// A minimal published-intensity spec: a calm region (intensity 0) around the
// spawn corner, a hot region (intensity 1) in the far corner. size 60 → the
// scatterPos margin is 4, so x = 4 + roll·52.
function specWith(nodes: MapSpec['semantic']['nav']['nodes']): MapSpec {
  return {
    specVersion: 1, recipe: 'test', seed: 1, cols: 60, rows: 60,
    collision: [], scatter: [],
    surface: { cols: 60, rows: 60, cellsPerUnit: 1, grid: new Uint8Array(60 * 60) },
    semantic: {
      pois: [], locks: [], regionTags: [], name: null, premise: null,
      tactical: { openness: 1, barrierCount: 0, chokepoints: 0, longLanes: 0, coverClusters: 0 },
      nav: { nodes, edges: [] },
    },
  } as unknown as MapSpec
}
const PACED = specWith([
  { id: 'calm', at: { x: 10, y: 10 }, area: { x: 0, y: 0, w: 20, h: 20 }, intensity: 0 },
  { id: 'hot', at: { x: 50, y: 50 }, area: { x: 40, y: 40, w: 20, h: 20 }, intensity: 1 },
])
const FLAT = specWith([
  { id: 'calm', at: { x: 10, y: 10 }, area: { x: 0, y: 0, w: 20, h: 20 } },
  { id: 'hot', at: { x: 50, y: 50 }, area: { x: 40, y: 40, w: 20, h: 20 } },
])

// Candidate rolls: c1 → calm (9.2,9.2), c2 → hot (48.2,48.2), c3 → calm.
const CANDS = [0.1, 0.1, 0.85, 0.85, 0.05, 0.05]

describe('intensity-weighted trickle position (§track D)', () => {
  it('the SAME pick roll lands on the remote candidate only when intensity is published', () => {
    // weights with intensity: calm 1, hot 3, calm 1 (bias 2) → hot owns rolls
    // in [0.2, 0.8); flat weights give hot only [1/3, 2/3). Roll 0.25 splits them.
    pinRandom([...CANDS, 0.25])
    const paced = intensityScatterPos(PACED, 60, [])
    expect(paced.x).toBeCloseTo(48.2, 5)   // the hot-region candidate won

    pinRandom([...CANDS, 0.25])
    const flat = intensityScatterPos(FLAT, 60, [])
    expect(flat.x).toBeCloseTo(9.2, 5)     // no intensity → same roll stays on c1
  })

  it('mild weighting, not exclusion: a low roll still spawns on the calm bank', () => {
    pinRandom([...CANDS, 0.1])             // 0.1 · 5 = 0.5 < weight(c1)=1
    const p = intensityScatterPos(PACED, 60, [])
    expect(p.x).toBeCloseTo(9.2, 5)
  })

  it('a spec with no published intensity degrades to plain uniform scatter', () => {
    // rolls ≥ 2/3 pick c3 under flat weights — the untouched pre-track-D odds
    pinRandom([...CANDS, 0.7])
    const p = intensityScatterPos(FLAT, 60, [])
    expect(p.x).toBeCloseTo(6.6, 5)
  })
})

describe('mapGen open-world trickle end-to-end', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0))

  const GEN_LOC: Location = {
    id: 'gen-field', region: 'world', name: 'Gen Field',
    description: '', traits: ['plains', 'water'], monsterIds: ['slime'],
    familiarityMax: 100, connections: [],
    openWorld: true, openWorldCap: 3, openWorldSize: 64,
    mapGen: { recipe: 'field' },
  }

  it('stands up from the spec and fills to cap through the intensity path', () => {
    resetStore({
      locations: [GEN_LOC],
      units: [makeUnit({ id: 'u1', locationId: 'gen-field', health: 100 })],
    })
    tick()
    const b = useGameStore.getState().battles['gen-field']
    expect(b).toBeDefined()
    expect(b.cols).toBe(64)                // arena drawn from the baked spec
    expect(b.combatants.filter((c) => c.team === 'enemy').length).toBe(3)
  })
})
