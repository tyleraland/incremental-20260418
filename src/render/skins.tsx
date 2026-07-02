import { memo, type CSSProperties, type ReactNode } from 'react'
import type { Tone, BodyShape, Weapon, Biome } from '@/render/appearance'

// ── Battlefield skins ────────────────────────────────────────────────────────
//
// The render-only seam for restyling the battlefield: a skin = one token-body
// component (how a combatant is drawn inside its chip box) + one arena entry
// (ground/grid treatment). Everything else — camera, compositor glide, LOD,
// floats, tactics — is skin-agnostic and untouched by a swap.
//
// Contract (keep these or the restyle stops being a one-file change):
//   • A body receives ONLY `TokenBodyProps` (fed by the appearance resolver +
//     chipDims). It never reads the store or engine types, so Preview chips and
//     live chips share it, and a new look can't grow gameplay tendrils.
//   • The body fills the `dims` box and marks its root `data-skin`. The hover
//     `title` (name — hp) lives on the CHIP wrapper, not the body: it changes on
//     every hp tick, and on the body it would defeat the memo below for any
//     token under fire.
//   • Bodies must stay compositor-cheap: flat fills only — no CSS `filter` /
//     SVG filters / per-token gradients (each forces extra compositing work and
//     the whole point is 50+ tokens gliding at 60fps). Shadows are offset flat
//     shapes, "3D" is a two-tone fill, exactly like Unexplored's paper cutouts.
//   • Keep the element count per body LEAN. React reconcile + style/layout of
//     the token subtrees is the measured render cost at 50+ entities (engine is
//     ~1%): every extra div/svg child is multiplied by the mob.
//   • Skins are picked at runtime (store `battleSkin`; Time→Debug or ?skin=…),
//     so looks can be A/B'd live on the same battle.
//
// 'circle' is the classic debug token; 'paper' is the first art-directed skin:
// procedural flat-vector "paper cutout" tokens (no image assets — crisp at any
// zoom, nothing to license, restyle = edit the shapes/palette below).

export type BattleSkin = 'circle' | 'paper'
export const BATTLE_SKIN_IDS: BattleSkin[] = ['circle', 'paper']

// Resolve the boot skin: URL ?skin=… (also persists, like ?mode=) > localStorage
// > circle. Ephemeral-UI tier — never part of the save string.
export function bootBattleSkin(): BattleSkin {
  const valid = (v: string | null): v is BattleSkin => v === 'circle' || v === 'paper'
  try {
    const q = new URLSearchParams(window.location.search).get('skin')
    if (valid(q)) { localStorage.setItem('battle-skin', q); return q }
    const saved = localStorage.getItem('battle-skin')
    if (valid(saved)) return saved
  } catch { /* SSR/tests without window */ }
  return 'circle'
}

// Bodies are `memo`'d, and combatants MUTATE IN PLACE each round — so a body may
// receive ONLY primitives (or objects compared field-by-field in BODY_PROPS_EQUAL
// that the caller builds fresh). Passing a live engine object (e.g. `c.facing`)
// would compare equal-by-reference forever and freeze the token's visuals.
export interface TokenBodyProps {
  glyph: string        // class icon / NPC icon / initials (from the appearance resolver)
  tone: Tone           // team color family; 'casting' carries the amber cast signal
  bodyShape: BodyShape // silhouette family (resolver-picked; a skin NEVER keys off ids)
  tint?: string        // element accent (rim/outline); ignored while casting
  weapon?: Weapon      // class handheld; absent → the skin's generic pointer
  alive: boolean
  selected: boolean
  // Facing as a SCREEN angle in degrees (0° = pointing right; caller applies the
  // world→screen y-flip and quantizes — see BattleChip). null = no facing shown
  // (neutrals, KO).
  facingDeg: number | null
  dims: { width: string; height: string; fontSize: string }   // chipDims box
}

// BattleChip re-renders every round (combatants mutate in place, so it can't be
// memo'd itself) — but a token that didn't visibly change shouldn't re-reconcile
// its body subtree. With the paper skin ~7 elements per token, this memo is the
// difference between reconciling ~7×N elements per round and only the changed
// tokens'. It only bites because the caller keeps the props stable: quantized
// facing/dims, no live objects, no hp-bearing strings (see chipDims/facingDeg).
const BODY_PROPS_EQUAL = (a: TokenBodyProps, b: TokenBodyProps) =>
  a.glyph === b.glyph && a.tone === b.tone && a.tint === b.tint &&
  a.bodyShape === b.bodyShape && a.weapon === b.weapon &&
  a.alive === b.alive && a.selected === b.selected && a.facingDeg === b.facingDeg &&
  a.dims.width === b.dims.width && a.dims.fontSize === b.dims.fontSize

// True when the skin's body itself shows facing (so BattleChip drops the
// separate FacingNub — the paper token's blade IS the facing indicator).
export const SKIN_CARRIES_FACING: Record<BattleSkin, boolean> = { circle: false, paper: true }

// Render-count probe: every ACTUAL body render bumps this (a memo hit doesn't).
// Skins.test.tsx asserts the whole contract end-to-end with it — a re-render of
// an unchanged battle must reconcile ZERO body subtrees, so any regression that
// defeats the memo (a live object prop, an hp-bearing string, unquantized dims/
// facing churn) fails a unit test instead of resurfacing as a mystery fps drop.
// One increment per render — negligible in production.
export const BODY_RENDER_PROBE = { count: 0 }

// ── Circle skin (the classic token) ─────────────────────────────────────────

// Per-tone base classes for the circle skin. An element `tint` (when present)
// overrides the border color + adds a faint glow on top of these — except while
// casting, whose amber ring takes priority as the cast signal.
const TONE_CLASS: Record<Tone, string> = {
  casting: 'bg-blue-950 border-amber-300 ring-2 ring-amber-400/60 text-amber-100',
  player:  'bg-blue-900 border-blue-300/80 text-blue-50',
  neutral: 'bg-amber-900/80 border-amber-300/70 text-amber-50',
  enemy:   'bg-red-900  border-red-300/80  text-red-50',
}

const CircleBody = memo(function CircleBody({ glyph, tone, tint: rawTint, alive, selected, dims }: TokenBodyProps) {
  BODY_RENDER_PROBE.count++
  const tint = tone !== 'casting' ? rawTint : undefined
  return (
    <div
      data-skin="circle"
      style={{ ...dims, ...(tint ? { borderColor: tint, boxShadow: `0 0 6px ${tint}` } : null) }}
      className={[
        'rounded-full border-2 shadow-md flex items-center justify-center font-bold leading-none select-none transition-opacity',
        TONE_CLASS[tone],
        selected ? 'ring-2 ring-emerald-300' : '',
        alive ? '' : 'opacity-25 grayscale',
      ].join(' ')}
    >
      {alive ? glyph : '✕'}
    </div>
  )
}, BODY_PROPS_EQUAL)

// ── Paper skin (flat-vector cutout tokens) ──────────────────────────────────

// Two-tone flat palette per tone: `top` is the cutout's lit face, `base` shows
// as a darker rim along the bottom-right (the same path drawn twice, the top
// copy nudged up-left) — the pseudo-3D read without a single gradient/filter.
const PAPER_TONE: Record<Tone, { top: string; base: string; outline: string; text: string }> = {
  player:  { top: '#5577dd', base: '#2e4187', outline: '#141d42', text: '#eef3ff' },
  casting: { top: '#5577dd', base: '#2e4187', outline: '#fbbf24', text: '#fef3c7' },
  enemy:   { top: '#cc5244', base: '#79281f', outline: '#3c110b', text: '#ffedea' },
  neutral: { top: '#c99a4c', base: '#77571f', outline: '#3c2b0d', text: '#fdf4dd' },
}

// Silhouette paths (100×100 box), one per BodyShape — regular enough to read as
// unit tokens, wonky enough to feel hand-cut rather than geometric. Each is one
// path drawn twice (base + lit top copy nudged up-left) for the filter-free
// two-tone read, so a new family costs zero extra elements.
const PAPER_BODY_PATHS: Record<BodyShape, string> = {
  // the original rounded cutout — heroes, NPCs, tool-users
  humanoid: 'M50 6 C72 7 90 20 92 42 C94 65 74 90 50 94 C27 91 6 65 8 42 C10 20 29 8 50 6 Z',
  // squat droopy puddle — slimes, sacs, rooted things
  blob:     'M50 26 C70 27 87 41 89 58 C91 76 73 88 49 88 C25 88 9 75 12 57 C15 39 31 25 50 26 Z',
  // round body with two flared ear points — wolves, boars, crabs, lizards
  beast:    'M34 20 L23 2 L44 13 C48 11 52 11 56 13 L77 2 L66 20 C80 27 89 40 88 56 C86 77 70 90 50 91 C30 90 14 77 12 56 C11 40 20 27 34 20 Z',
  // two raised wing lobes over a hanging body — harpies, bats, ghosts
  flyer:    'M50 32 C55 21 67 12 90 15 C88 36 74 50 60 53 L61 74 C57 86 43 86 39 74 L40 53 C26 50 12 36 10 15 C33 12 45 21 50 32 Z',
}

// Facing-layer shapes (drawn under the body, rotated to facingDeg, so only the
// business end shows). Heroes carry their class weapon; a weaponless humanoid
// keeps the classic blade; creatures get a short claw wedge instead of marching
// around with a sword. Static JSX — each costs 1–2 flat primitives.
const WEAPON_SHAPES: Record<Weapon | 'claw', ReactNode> = {
  sword: <polygon points="55,45 85,42 112,50 85,58 55,55" fill="#cdd5de" stroke="#2b3138" strokeWidth="3" />,
  dagger: <polygon points="58,46.5 82,45 101,50 82,55 58,53.5" fill="#cdd5de" stroke="#2b3138" strokeWidth="3" />,
  bow: (
    <>
      <path d="M74 22 C102 34 102 66 74 78" fill="none" stroke="#a8703d" strokeWidth="6" />
      <line x1="74" y1="22" x2="74" y2="78" stroke="#e8e3d2" strokeWidth="2.5" />
    </>
  ),
  staff: (
    <>
      <line x1="52" y1="50" x2="96" y2="50" stroke="#8a5a2b" strokeWidth="6" />
      <circle cx="99" cy="50" r="8" fill="#e8e3d2" stroke="#2b3138" strokeWidth="3" />
    </>
  ),
  claw: <polygon points="58,44.5 90,50 58,55.5" fill="#e8e3d2" stroke="#2b3138" strokeWidth="3" />,
}

// One SVG per token: shadow ellipse, facing weapon (a rotated group under the
// body, so only the tip shows — a held weapon), then the two-tone body. Merged
// into a single <svg> to keep the per-token element count down (see contract).
const PaperBody = memo(function PaperBody({ glyph, tone, bodyShape, tint, weapon, alive, selected, facingDeg, dims }: TokenBodyProps) {
  BODY_RENDER_PROBE.count++
  const p = PAPER_TONE[tone]
  const outline = tone !== 'casting' && tint ? tint : p.outline
  const body = PAPER_BODY_PATHS[bodyShape]
  // Facing rotation snaps per round like the circle skin's FacingNub — no
  // rotate transition (359°→1° would spin the long way around).
  const angle = alive ? facingDeg : null
  return (
    <div
      data-skin="paper"
      style={{ width: dims.width, height: dims.height }}
      className={`relative flex items-center justify-center select-none transition-opacity ${alive ? '' : 'opacity-25 grayscale'}`}
    >
      {selected && <div className="absolute -inset-1 rounded-full ring-2 ring-emerald-300 pointer-events-none" />}
      {tone === 'casting' && <div className="absolute -inset-1 rounded-full ring-2 ring-amber-400/70 animate-pulse pointer-events-none" />}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }} aria-hidden>
        {/* ground-contact shadow: an offset flat ellipse, NOT filter:drop-shadow */}
        <ellipse cx="54" cy="55" rx="46" ry="45" fill="rgb(0 0 0 / 0.35)" />
        {angle != null && (
          <g transform={`rotate(${angle} 50 50)`}>
            {WEAPON_SHAPES[weapon ?? (bodyShape === 'humanoid' ? 'sword' : 'claw')]}
          </g>
        )}
        <path d={body} fill={p.base} stroke={outline} strokeWidth="5" />
        <path d={body} fill={p.top} transform="translate(-3 -4) translate(50 50) scale(0.94) translate(-50 -50)" />
      </svg>
      <span className="relative font-bold leading-none" style={{ fontSize: dims.fontSize, color: p.text }}>
        {alive ? glyph : '✕'}
      </span>
    </div>
  )
}, BODY_PROPS_EQUAL)

export const TOKEN_SKINS: Record<BattleSkin, typeof CircleBody> = {
  circle: CircleBody,
  paper: PaperBody,
}

// ── Arena (ground) skins ─────────────────────────────────────────────────────

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

// Procedural grounds: ONE repeating 2×2-cell SVG pattern each (a data URI on
// the ground layer, so a 200×200 map costs zero per-cell DOM). Four quadrants
// in slightly different muted shades + a few accent marks — the "between 3D and
// tileset" floor read, no image assets. One tile per BIOME (grass field / stone
// dungeon / city plaza), picked by the location's traits via `biomeForLocation`.

// city plaza: the original warm-dark parquet — pavers + hairline seams.
const PAPER_TILE_PLAZA = svgUrl(
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>" +
  "<rect width='64' height='64' fill='#15130f'/>" +
  "<rect x='1' y='1' width='30' height='30' fill='#26221a'/>" +
  "<rect x='33' y='1' width='30' height='30' fill='#211e16'/>" +
  "<rect x='1' y='33' width='30' height='30' fill='#231f17'/>" +
  "<rect x='33' y='33' width='30' height='30' fill='#282419'/>" +
  "<path d='M1 11h30M1 21h30M33 43h30M33 53h30' stroke='#1c1913' stroke-width='1'/>" +
  "<path d='M43 1v30M53 1v30M11 33v30M21 33v30' stroke='#1c1913' stroke-width='1'/>" +
  '</svg>',
)

// open grass: mottled dark greens, soft quadrant patches + sparse tuft strokes.
const PAPER_TILE_GRASS = svgUrl(
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>" +
  "<rect width='64' height='64' fill='#161a10'/>" +
  "<rect x='0' y='0' width='32' height='32' fill='#1b2113'/>" +
  "<rect x='32' y='0' width='32' height='32' fill='#181d11'/>" +
  "<rect x='0' y='32' width='32' height='32' fill='#192012'/>" +
  "<rect x='32' y='32' width='32' height='32' fill='#1d2314'/>" +
  "<path d='M9 12l2-4M12 12l2-4M40 24l2-4M43 24l2-4M22 48l2-4M25 48l2-4M52 40l2-4M55 40l2-4' stroke='#2c351c' stroke-width='1.5' fill='none'/>" +
  "<circle cx='30' cy='20' r='1' fill='#242c17'/><circle cx='14' cy='40' r='1' fill='#242c17'/><circle cx='48' cy='54' r='1' fill='#242c17'/>" +
  '</svg>',
)

// stone dungeon: cool grey slabs, offset joints + a hairline crack.
const PAPER_TILE_STONE = svgUrl(
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>" +
  "<rect width='64' height='64' fill='#131518'/>" +
  "<rect x='1' y='1' width='30' height='30' fill='#22262b'/>" +
  "<rect x='33' y='1' width='30' height='30' fill='#1e2226'/>" +
  "<rect x='1' y='33' width='30' height='30' fill='#202429'/>" +
  "<rect x='33' y='33' width='30' height='30' fill='#242830'/>" +
  "<path d='M16 1v14M16 15h16M48 33v14M48 47h-15' stroke='#181b1f' stroke-width='1'/>" +
  "<path d='M8 44l6 5M52 12l-5 6' stroke='#181b1f' stroke-width='1' fill='none'/>" +
  '</svg>',
)

export interface ArenaSkin {
  surface?: CSSProperties                             // arena wrapper background
  // per-biome repeating pattern on the ground layer; the biome comes from the
  // location's traits (biomeForLocation). Missing biome/record → plain surface.
  grounds?: Partial<Record<Biome, { image: string; cellsPerTile: number }>>
  gridLine: string                                    // overlay grid hairline color
  // terrain restyle: inline styles for the barrier divs. Absent → the classic
  // stone/amber classes. Flat fills + zero-blur inset shadow only (the paper
  // cutout trick) — no filters, same as the token contract.
  barrierWall?: CSSProperties
  barrierCliff?: CSSProperties
  // one STATIC full-viewport overlay (a single compositor layer, like the
  // perimeter ring) for the lighting read; a CSS background value.
  vignette?: string
}

// ── Effect (FX) skins ────────────────────────────────────────────────────────
// The combat-feedback layer (attack arcs, hit flashes, ground zones, firewalls,
// portals) styled per skin, so an effects restyle stays a skins-file change —
// BattleView keeps the geometry/animation and reads the look from here. Paper
// speaks its own language: flat fills and borders only, no glow shadows, no
// gradients (the classic circle look keeps both, untouched). Class strings must
// stay LITERAL in this file so Tailwind's scanner sees them.
export interface FxSkin {
  arcPlayer: string     // attack-line stroke color (player side)
  arcEnemy: string
  hitRing: string       // struck-unit flash ring (animate-hit-flash rides along)
  zone: string          // persistent ground zone (Lightning Storm / Molasses / …)
  firewall: string      // firewall strip
  portal: string        // travel gateway
}

export const FX_SKINS: Record<BattleSkin, FxSkin> = {
  // circle: today's look verbatim (saturated strokes, gradient + glow accents).
  circle: {
    arcPlayer: 'rgb(96,165,250)',
    arcEnemy: 'rgb(248,113,113)',
    hitRing: 'border-2 border-white/70',
    zone: 'bg-orange-500/25 border border-orange-400/50',
    firewall: 'bg-gradient-to-b from-amber-300/70 via-orange-500/60 to-red-600/50 border border-amber-300/70 shadow-[0_0_10px_2px_rgba(251,146,60,0.6)]',
    portal: 'bg-fuchsia-500/30 border-2 border-fuchsia-300/80 shadow-[0_0_12px_3px_rgba(217,70,239,0.55)]',
  },
  // paper: muted ink strokes, cream flash ring, dashed hand-drawn zone circles,
  // solid two-tone fire and portal — all flat, nothing glows.
  paper: {
    arcPlayer: 'rgb(143 176 232 / 0.9)',
    arcEnemy: 'rgb(224 141 127 / 0.9)',
    hitRing: 'border-[3px] border-[#f3e9d4]/80',
    zone: 'bg-[#c97f3d]/20 border-2 border-dashed border-[#c97f3d]/60',
    firewall: 'bg-[#d8813c]/65 border-2 border-[#7c3212]/80',
    portal: 'bg-[#b96fd6]/25 border-2 border-[#e3b7f2]/80',
  },
}

export const ARENA_SKINS: Record<BattleSkin, ArenaSkin> = {
  // circle: today's look untouched — flat game-surface + faint white grid.
  circle: { gridLine: 'rgb(255 255 255 / 0.06)' },
  // paper: muted per-biome tiles; the patterns' own seams carry the tile read,
  // so the overlay grid drops to a whisper (still there for tactical alignment).
  paper: {
    surface: { backgroundColor: '#191713' },
    grounds: {
      grass: { image: PAPER_TILE_GRASS, cellsPerTile: 2 },
      stone: { image: PAPER_TILE_STONE, cellsPerTile: 2 },
      plaza: { image: PAPER_TILE_PLAZA, cellsPerTile: 2 },
    },
    gridLine: 'rgb(255 255 255 / 0.03)',
    barrierWall: {
      backgroundColor: '#3f3a31',
      border: '2px solid #14110c',
      boxShadow: 'inset -3px -4px 0 rgb(0 0 0 / 0.35)',   // offset flat face, not a blur
    },
    barrierCliff: {
      backgroundColor: 'rgb(74 54 35 / 0.4)',
      border: '2px dashed rgb(163 124 72 / 0.55)',
    },
    vignette: 'radial-gradient(120% 120% at 50% 45%, transparent 55%, rgb(0 0 0 / 0.42) 100%)',
  },
}
