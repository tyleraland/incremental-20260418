// Palette contract (asset-pipeline step 2, BACKLOG → Graphics): everything the
// paper language draws resolves to a NAMED ROLE in src/render/palette.ts — no
// rogue hex at a point of use — and nothing anywhere uses an SVG/CSS filter or
// gradient (each forces extra compositing; flat fills are the look AND the
// perf model). Palette discipline is the single biggest polish lever; this
// test makes it un-regressable, for hand-written assets and imported/generated
// ones (scripts/import-svg.mjs) alike.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PAPER_PALETTE, PAPER_TONE } from '@/render/palette'
import { TERRAIN_PROPS } from '@/render/props'
import { terrainSvg, type TerrainProps } from '@/render/terrain'
import { generateMap, specBarriers } from '@/mapgen'
import { FIELD_RECIPE } from '@/mapgen/recipes/field'
import { CITY_RECIPE } from '@/mapgen/recipes/city'
import { TOKEN_SKINS } from '@/render/skins'
import type { Biome, BodyShape, Weapon } from '@/render/appearance'

const ROLE_VALUES = new Set<string>(Object.values(PAPER_PALETTE))
const TONE_VALUES = new Set<string>(Object.values(PAPER_TONE).flatMap((t) => [t.top, t.base, t.outline, t.text]))
const BIOMES: Biome[] = ['grass', 'stone', 'plaza']

// Every fill='…'/stroke='…' literal in an emitted svg string.
const paints = (svg: string): string[] =>
  [...svg.matchAll(/(?:fill|stroke)='([^']*)'/g)].map((m) => m[1])

describe('palette contract', () => {
  it('prop asset data references only palette roles', () => {
    for (const biome of BIOMES) {
      for (const def of TERRAIN_PROPS[biome]) {
        for (const p of def.paths) {
          if (p.fill) expect(PAPER_PALETTE[p.fill], `${biome}/${def.id} fill`).toBeTruthy()
          if (p.stroke) expect(PAPER_PALETTE[p.stroke], `${biome}/${def.id} stroke`).toBeTruthy()
          expect(p.fill || p.stroke, `${biome}/${def.id}: a path must paint something`).toBeTruthy()
        }
      }
    }
  })

  it('the emitted terrain uses only palette colors, no filters/gradients', () => {
    for (const biome of BIOMES) {
      const props: TerrainProps = {
        biome, cols: 40, rows: 40, seed: 7, rim: true,
        barriers: [
          { x: 8, y: 8, w: 4, h: 3 }, { x: 11, y: 9.5, w: 3, h: 3 },
          { x: 30, y: 12, w: 3, h: 2, kind: 'cliff' },
        ],
      }
      const svg = terrainSvg(props)
      for (const c of paints(svg)) {
        expect(ROLE_VALUES.has(c) || c === 'none', `terrain ${biome}: rogue paint '${c}'`).toBe(true)
      }
      expect(svg).not.toMatch(/filter|[gG]radient/)
      // url(…) refs are allowed ONLY as the wall/rim clip paths
      expect(svg.replace(/clip-path='url\(#(?:w\d+|rim)\)'/g, '')).not.toContain('url(')
    }
  })

  it('spec-driven terrain (§mapgen surface/scatter) also emits only palette colors', () => {
    const res = generateMap(FIELD_RECIPE, { recipe: 'field', seed: 5, size: 48, themes: ['plains', 'water'] })
    const svg = terrainSvg({
      biome: 'grass', cols: res.spec.cols, rows: res.spec.rows,
      barriers: specBarriers(res.spec), seed: 5, rim: true, spec: res.spec,
    })
    for (const c of paints(svg)) {
      expect(ROLE_VALUES.has(c) || c === 'none', `spec terrain: rogue paint '${c}'`).toBe(true)
    }
    expect(svg).not.toMatch(/filter|[gG]radient/)
  })

  it('spec-driven CITY terrain (buildings + paving) also emits only palette colors', () => {
    const res = generateMap(CITY_RECIPE, { recipe: 'city', seed: 'prontera-city', size: 50, themes: ['city'], maxBarriers: 40 })
    expect(res.spec.collision.some((c) => c.material === 'cut-stone' || c.material === 'wood')).toBe(true)
    const svg = terrainSvg({
      biome: 'plaza', cols: res.spec.cols, rows: res.spec.rows,
      barriers: specBarriers(res.spec), seed: 9, rim: true, spec: res.spec,
    })
    for (const c of paints(svg)) {
      expect(ROLE_VALUES.has(c) || c === 'none', `city terrain: rogue paint '${c}'`).toBe(true)
    }
    expect(svg).not.toMatch(/filter|[gG]radient/)
    // buildings + paving are pure <path> markup — no clip refs beyond wall/rim
    expect(svg.replace(/clip-path='url\(#(?:w\d+|rim)\)'/g, '')).not.toContain('url(')
  })

  it('paper token bodies use only palette + tone colors, no filters/gradients', () => {
    const Paper = TOKEN_SKINS.paper
    const dims = { width: '56px', height: '56px', fontSize: '22px' }
    const shapes: BodyShape[] = ['humanoid', 'blob', 'beast', 'flyer', 'snail', 'serpent', 'canine', 'fearrow', 'crampRat']
    const weapons: (Weapon | undefined)[] = ['sword', 'bow', 'staff', 'dagger', undefined]
    const cases = [
      ...shapes.map((s) => ({ bodyShape: s, weapon: undefined, alive: true })),
      ...weapons.map((w) => ({ bodyShape: 'humanoid' as const, weapon: w, alive: true })),
      { bodyShape: 'humanoid' as const, weapon: 'sword' as const, alive: false },
    ]
    for (const c of cases) {
      const { container, unmount } = render(
        <Paper glyph="X" tone="player" bodyShape={c.bodyShape} weapon={c.weapon} alive={c.alive} selected={false} facingDeg={0} dims={dims} />,
      )
      expect(container.querySelector('linearGradient, radialGradient, filter')).toBeNull()
      for (const el of container.querySelectorAll('svg, svg *')) {
        expect(el.getAttribute('style') ?? '').not.toContain('filter')
        for (const attr of ['fill', 'stroke'] as const) {
          const v = el.getAttribute(attr)
          if (v == null || v === 'none') continue
          expect(
            ROLE_VALUES.has(v) || TONE_VALUES.has(v),
            `paper body ${c.bodyShape}/${c.weapon}: rogue ${attr} '${v}'`,
          ).toBe(true)
        }
      }
      unmount()
    }
  })
})
