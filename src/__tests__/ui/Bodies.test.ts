// The BODY CONTRACT — the "rules, not taste" gate for PAPER_BODIES entries
// (mirrors what Props.test/Palette.test do for props/paints). Every rule here
// is a failure mode that is INVISIBLE until a body renders wrong in play:
//   • plate winding — the far-LOD merge + KO crumple concatenate every plate's
//     path into one silhouette; a counter-wound plate punches a HOLE in the
//     merged body (fill-rule nonzero cancels opposite windings).
//   • part budget — every path multiplies across 50+ gliding tokens.
//   • walk phases — a body with only one gait phase shuffles like a pogo stick.
//   • idle budget — each idle part holds a compositor layer promoted for the
//     token's whole resting life (see the idle notes in src/render/CLAUDE.md).
//   • paint names — a typo'd accent fill silently renders as the base tone.
// Plus the animation PERF contract: every keyframe in index.css must stay
// compositor-only (transform/opacity) — the property that keeps 50 tokens
// gliding at 60fps — and the data-* part rules may only start animations.
import { describe, it, expect } from 'vitest'
// @ts-expect-error node builtin — the app tsconfig carries no @types/node, but
// vitest runs on node ( `?raw` css imports come back empty through its css
// pipeline, so reading the file is the reliable way to lint index.css ).
import { readFileSync } from 'node:fs'
import { PAPER_BODIES, type BodyPart } from '@/render/skins'
import { PAPER_PALETTE } from '@/render/palette'
import { BODY_SHAPES } from '@/render/appearance'

// ── tiny absolute-path reader: on-curve points of each subpath ──
// Bodies are authored with absolute M/L/C/Q/A/Z only (lowercase arcs `a` appear
// in eye-dot accents). For winding we only need the ON-CURVE points in order.
function subpaths(d: string): { points: [number, number][] }[] {
  const toks = d.match(/[MLCQAZmlcqaz]|-?\d*\.?\d+/g) ?? []
  const out: { points: [number, number][] }[] = []
  let cur: [number, number][] = []
  let i = 0
  const num = () => Number(toks[i++])
  while (i < toks.length) {
    const t = toks[i++]
    switch (t) {
      case 'M': if (cur.length) out.push({ points: cur }); cur = [[num(), num()]]; break
      case 'L': cur.push([num(), num()]); break
      case 'C': i += 4; cur.push([num(), num()]); break
      case 'Q': i += 2; cur.push([num(), num()]); break
      case 'A': i += 5; cur.push([num(), num()]); break
      case 'a': { i += 5; const [px, py] = cur[cur.length - 1] ?? [0, 0]; cur.push([px + num(), py + num()]); break }
      case 'Z': case 'z': break
      default: throw new Error(`unsupported path command '${t}' — author bodies with absolute M/L/C/Q/A/Z`)
    }
  }
  if (cur.length) out.push({ points: cur })
  return out
}

// Shoelace signed area over the on-curve points: sign = winding direction.
function windingSign(points: [number, number][]): number {
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.sign(a)
}

const TONE_FIELDS = ['base', 'top', 'outline', 'text']
const isPlate = (p: BodyPart) => (p.kind ?? 'plate') === 'plate'

describe('body contract (PAPER_BODIES)', () => {
  for (const shape of BODY_SHAPES) {
    const parts = PAPER_BODIES[shape]
    describe(shape, () => {
      it('stays within the part budget and has a plate silhouette', () => {
        expect(parts.length).toBeLessThanOrEqual(14)
        expect(parts.filter(isPlate).length).toBeGreaterThanOrEqual(1)
      })

      it('every path parses; coordinates stay near the 100-box', () => {
        for (const p of parts) {
          for (const sp of subpaths(p.d)) {
            for (const [x, y] of sp.points) {
              expect(x).toBeGreaterThanOrEqual(-15)
              expect(x).toBeLessThanOrEqual(125)
              expect(y).toBeGreaterThanOrEqual(-15)
              expect(y).toBeLessThanOrEqual(125)
            }
          }
        }
      })

      it('plates are single-subpath and all wind the same way (far-LOD merge / KO)', () => {
        const signs = parts.filter(isPlate).map((p) => {
          const sps = subpaths(p.d)
          expect(sps.length).toBe(1)
          return windingSign(sps[0].points)
        })
        expect(new Set(signs).size).toBe(1)
      })

      it('walk phases come in pairs; idle parts stay within budget; paints exist', () => {
        const walks = new Set(parts.map((p) => p.walk).filter(Boolean))
        if (walks.size > 0) expect([...walks].sort()).toEqual([1, 2])
        expect(parts.filter((p) => p.idle).length).toBeLessThanOrEqual(3)
        for (const p of parts) {
          if (p.fill) expect(TONE_FIELDS.includes(p.fill) || p.fill in PAPER_PALETTE).toBe(true)
        }
      })
    })
  }
})

// ── animation perf contract (index.css) ──
const css: string = readFileSync('src/index.css', 'utf8')   // vitest cwd = repo root

function keyframeBlocks(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const re = /@keyframes\s+([\w-]+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 1
    let i = re.lastIndex
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    out.push({ name: m[1], body: src.slice(re.lastIndex, i - 1) })
  }
  return out
}

describe('animation perf contract (index.css)', () => {
  it('every keyframe animates ONLY transform/opacity (compositor-cheap)', () => {
    const blocks = keyframeBlocks(css)
    expect(blocks.length).toBeGreaterThan(10)   // sanity: the parser found them
    for (const { name, body } of blocks) {
      const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1])
      for (const prop of props) {
        expect(['transform', 'opacity'], `@keyframes ${name} animates '${prop}'`).toContain(prop)
      }
    }
  })

  it('data-* part rules only start animations (never paint/layout properties)', () => {
    const rules = [...css.matchAll(/^[^\n@]*\[data-(?:idle|walk|atk)[^\n]*\{([^}]*)\}/gm)]
    expect(rules.length).toBeGreaterThan(3)
    for (const r of rules) {
      const props = [...r[1].matchAll(/([\w-]+)\s*:/g)].map((p) => p[1])
      for (const prop of props) {
        expect(
          prop === 'animation' || prop.startsWith('animation-') || prop === 'transform-box' || prop === 'transform-origin',
          `data-* rule sets '${prop}'`,
        ).toBe(true)
      }
    }
  })
})
