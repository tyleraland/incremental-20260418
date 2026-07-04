import { memo, type CSSProperties, type ReactNode } from 'react'
import type { Tone, BodyShape, Weapon, Biome } from '@/render/appearance'
import { PAPER_TONE, PAPER_PALETTE as PAL } from '@/render/palette'
import { PaperTerrain, type TerrainProps } from '@/render/terrain'

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
  // In motion this round (engine `c.moving`): the paper skin leans a body plate
  // along the heading. A boolean edge, not a phase — flips only on start/stop,
  // so it can't defeat the memo per round. Optional: absent reads as idle.
  moving?: boolean
  // A monster (vs a hero/NPC). The paper skin draws creatures SILHOUETTE-ONLY —
  // no centered text label — so the layered body carries identity; the circle
  // debug skin keeps the initials either way. Heroes/NPCs (false) keep their
  // class/merchant icon. Absent reads as false.
  creature?: boolean
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
  a.moving === b.moving && a.creature === b.creature &&
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
// The two-tone tone palette (`PAPER_TONE`) and the terrain/prop roles live in
// `render/palette.ts` — the paper language's single color vocabulary.

// Layered silhouettes (100×100 box), an ordered STACK of parts per BodyShape —
// regular enough to read as unit tokens, wonky enough to feel hand-cut. Each
// creature is COMPOSED from several separate cutouts (tail, torso, mane, head,
// …) drawn back-to-front, exactly like the paper-cutout reference art: the
// silhouette carries the identity, not the text label.
// TOP-DOWN + DIRECTIONAL (the Unexplored read): authored FACING +x (nose
// right); the whole token rotates to facingDeg, so the shape telegraphs
// heading. Lit-copy nudges are composed OUTSIDE the rotation (screen space) —
// the language's one light direction survives any heading.
//
// A part is one of two kinds:
//   • `plate` (default) — a full two-tone cutout: dark base + outline, with the
//     SAME path nudged up-left as the lit face. Optionally casts a flat offset
//     shadow onto the parts below (`shadow: true`) — that shadow is what sells
//     "stacked sheets of paper". `c` is the plate's own lit-scale origin.
//   • `accent` — ONE flat fill, no lit copy / no outline unless asked (eyes,
//     teeth, a nose, a shell spiral). Cheap; the character detail on top.
// `lean` shifts a part along the local heading while MOVING (the wolf's head
// leads and its tail lags, the slime's core drags) — a static transform swap on
// the move/idle edge, never a running animation. Keep the part count lean: every
// path multiplies across 50+ gliding tokens (see the contract atop this file).
type PaperRole = keyof typeof PAL
interface BodyPart {
  d: string
  c?: [number, number]              // lit-scale origin (plates); defaults to box center
  lean?: number                     // +x shift along heading while moving (can be negative = lag)
  kind?: 'plate' | 'accent'         // default 'plate'
  fill?: 'base' | 'top' | 'outline' | 'text' | PaperRole  // accent paint (tone field or palette role)
  stroke?: boolean                  // accent: draw the tone outline around it
  shadow?: boolean                  // plate: cast a flat drop shadow onto lower parts
  // melee-attack motion (CSS-driven, off the memo'd body — see `data-atk` +
  // index.css): 'jab' snaps toward the target (heads/faces), 'trail' lags the
  // opposite way (tails). Absent = the part holds while the token lunges.
  atk?: 'jab' | 'trail'
}

const PAPER_BODIES: Record<BodyShape, BodyPart[]> = {
  // hero/NPC: round torso, head disc riding center-front; head leads on the
  // move (heading otherwise reads from the carried weapon)
  humanoid: [
    { d: 'M50 6 C72 7 90 20 92 42 C94 65 74 90 50 94 C27 91 6 65 8 42 C10 20 29 8 50 6 Z', c: [50, 50] },
    { d: 'M60 34 C70 35 76 41 76 50 C76 59 69 66 59 66 C50 66 44 59 44 50 C44 41 51 33 60 34 Z', c: [60, 50], lean: 4, shadow: true },
  ],
  // slime: wobbly puddle with a droplet wake, gel core riding it — the core
  // LAGS behind the heading while moving (inertia); two dark eyes ride the core
  // front so the blob reads as a creature, not a splash
  blob: [
    { d: 'M91 52 C92 61 84 71 73 75 C63 83 47 86 36 80 C24 83 12 75 14 63 C7 59 6 48 13 42 C9 35 12 27 20 26 C26 25 31 29 30 35 C36 27 48 23 58 26 C74 25 88 37 91 48 L91 52 Z', c: [50, 52] },
    { d: 'M50 34 C62 34 70 42 70 52 C70 62 60 69 48 69 C37 69 29 62 29 52 C29 42 38 34 50 34 Z', c: [50, 52], lean: -6, shadow: true },
    { d: 'M64 45 a3.4 3.4 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: -6 },
    { d: 'M64 59 a3.4 3.4 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: -6 },
  ],
  // generic quadruped: fat torso oval, smaller blunt eared head — boars,
  // crabs, lizards
  beast: [
    { d: 'M60 32 C48 26 34 26 24 32 C13 38 8 44 8 50 C8 56 13 62 24 68 C34 74 48 74 60 68 C67 63 70 57 70 50 C70 43 67 37 60 32 Z', c: [39, 50] },
    { d: 'M90 50 C90 44 86 39 79 37 C73 33 67 32 62 33 L56 23 L50 32 C45 34 42 41 42 50 C42 59 45 66 50 68 L56 77 L62 67 C67 68 73 67 79 63 C86 61 90 56 90 50 Z', c: [64, 50], lean: 5, shadow: true },
  ],
  // two swept wings (waisted at the hinge) under a slim fuselage with a beaked
  // head at the prow — harpies, bats; the body+head leads the wings on the move
  flyer: [
    { d: 'M54 44 C46 36 36 24 26 16 C16 8 6 12 8 22 C10 32 22 42 40 48 L40 52 C22 58 10 68 8 78 C6 88 16 92 26 84 C36 76 46 64 54 56 C56 52 56 48 54 44 Z', c: [30, 50] },
    { d: 'M90 50 C90 45 85 42 79 42 C72 38 62 36 50 37 L30 44 C25 45 22 47 22 50 C22 53 25 55 30 56 L50 63 C62 64 72 62 79 58 C85 58 90 55 90 50 Z', c: [55, 50], lean: 4, shadow: true },
    { d: 'M86 46 L100 50 L86 54 Z', kind: 'accent', fill: 'outline', lean: 4 },
    { d: 'M78 45 a2.3 2.3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4 },
    { d: 'M78 55 a2.3 2.3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4 },
  ],
  // foot slab + ball-tipped eyestalks under, spiral shell riding the back —
  // the foot STRETCHES forward from under the shell on the move; the shell
  // spiral is a flat accent on top
  snail: [
    { d: 'M74 42 C77 36 82 32 87 33 C93 34 94 41 89 43 C86 44 84 46 84 48 L84 52 C84 54 86 56 89 57 C94 59 93 66 87 67 C82 68 77 64 74 58 C70 62 63 65 56 66 L26 68 C16 68 9 61 9 51 C9 41 16 34 26 34 L56 34 C64 35 70 38 74 42 Z', c: [50, 50], lean: 6 },
    { d: 'M34 24 C49 24 60 35 60 50 C60 65 49 76 34 76 C19 76 8 65 8 50 C8 35 19 24 34 24 Z', c: [34, 50], shadow: true },
    { d: 'M34 40 C41 42 43 49 38 54 C31 60 20 55 20 46 C20 37 28 30 39 32', kind: 'accent', fill: 'outline', stroke: true },
  ],
  // tapered S-band under, bulbous head knob over — the head strikes forward on
  // the move, a forked tongue flicks past the snout, two eyes ride the head
  serpent: [
    { d: 'M76 56 C70 49 63 47 56 49 C48 52 44 60 38 66 C32 72 22 74 14 70 C8 67 5 60 10 57 C16 60 24 60 30 56 C36 52 40 44 48 38 C54 34 63 33 70 37 C76 41 79 49 76 56 Z', c: [42, 52] },
    { d: 'M77 41 C83 36 92 37 95 44 C98 51 94 59 86 60 C80 61 75 58 73 53 C71 48 72 44 77 41 Z', c: [84, 49], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M92 48 L100 48 L109 44 L102 49 L109 53 L100 50 L92 50 Z', kind: 'accent', fill: 'bloom', lean: 5, atk: 'jab' },
    { d: 'M88 43 a2.2 2.2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 5, atk: 'jab' },
    { d: 'M88 54 a2.2 2.2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 5, atk: 'jab' },
  ],
  // WOLF (canines: wolves, hounds, foxes) — the reference read is a SPIKY MANE
  // ruff behind a snarling eared head, over a tapered torso with a bushy tail.
  // Five stacked cutouts back→front: tail plume (lags on the move) · torso with
  // leg bumps · jagged mane ruff · eared head (leads) · a nose accent.
  canine: [
    { d: 'M31 50 C25 40 15 35 7 37 C-1 39 0 47 7 49 C-1 51 0 60 8 62 C16 64 26 60 31 50 Z', c: [15, 50], lean: -8, atk: 'trail' },
    { d: 'M64 50 C64 41 58 34 49 33 C47 26 41 26 39 33 C34 33 29 36 26 41 C23 43 21 47 22 50 C21 53 23 57 26 59 C29 64 34 67 39 67 C41 74 47 74 49 67 C58 66 64 59 64 50 Z', c: [42, 50] },
    { d: 'M78 50 L67 45 L73 34 L61 40 L60 27 L52 39 L45 31 L45 43 L34 41 L43 50 L34 59 L45 57 L45 69 L52 61 L60 73 L61 60 L73 66 L67 55 L78 50 Z', c: [55, 50], lean: 1 },
    { d: 'M95 50 C95 46 91 43 86 43 C81 38 75 36 68 37 L64 26 L60 37 C55 40 53 45 53 50 C53 55 55 60 60 63 L64 74 L68 63 C75 64 81 62 86 57 C91 57 95 54 95 50 Z', c: [72, 50], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M89 46 L98 50 L89 54 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  ],
}

// Facing-layer shapes (drawn under the body, rotated to facingDeg, so only the
// business end shows). Heroes carry their class weapon; a weaponless humanoid
// keeps the classic blade. Creature families carry NO weapon layer — their
// directional silhouette (snout/head at +x) is the heading indicator, which
// also saves an element per monster token. Static JSX — 1–2 flat primitives.
// The body silhouettes reach x≈92, so anything inside that is hidden — every
// shape here must put its business end WELL past it (tips out to ~110–125 of
// the 100 box; the svg has overflow:visible) or the weapon reads as a 2px
// sliver at real token sizes.
const WEAPON_SHAPES: Record<Weapon, ReactNode> = {
  sword: <polygon points="58,45 94,41 126,50 94,59 58,55" fill={PAL.steel} stroke={PAL.ink} strokeWidth="3" />,
  dagger: <polygon points="62,46 92,44 115,50 92,56 62,54" fill={PAL.steel} stroke={PAL.ink} strokeWidth="3" />,
  // the bow sits FULLY clear of the silhouette — if the string falls behind the
  // body, the remaining arc bulge reads as a detached crescent, not a bow.
  bow: (
    <>
      <path d="M96 24 C126 37 126 63 96 76" fill="none" stroke={PAL.woodLight} strokeWidth="6" />
      <line x1="96" y1="24" x2="96" y2="76" stroke={PAL.cream} strokeWidth="2.5" />
    </>
  ),
  staff: (
    <>
      <line x1="55" y1="50" x2="110" y2="50" stroke={PAL.wood} strokeWidth="7" />
      <circle cx="114" cy="50" r="10" fill={PAL.cream} stroke={PAL.ink} strokeWidth="3" />
    </>
  ),
}

// One SVG per token: ground shadow, facing weapon (heroes), then the STACK of
// body parts drawn back-to-front. Merged into a single <svg> to keep the
// per-token element count down (see contract).
const PaperBody = memo(function PaperBody({ glyph, tone, bodyShape, tint, weapon, alive, selected, facingDeg, moving, creature, dims }: TokenBodyProps) {
  BODY_RENDER_PROBE.count++
  const p = PAPER_TONE[tone]
  const outline = tone !== 'casting' && tint ? tint : p.outline
  const parts = PAPER_BODIES[bodyShape]
  // Facing rotation snaps per round like the circle skin's FacingNub — no
  // rotate transition (359°→1° would spin the long way around). The whole
  // top-down body rotates to the heading (null — neutrals — faces east).
  // A part's motion lean rides the SAME transform string (rotate first, then
  // the local +x shift), so it snaps on the move/idle edge — at 1–3 screen px
  // that's imperceptible, and it costs no transition or animation.
  const angle = alive ? facingDeg : null
  const partT = (pl: BodyPart) => {
    const lean = moving && pl.lean ? ` translate(${pl.lean} 0)` : ''
    return angle || lean ? `rotate(${angle ?? 0} 50 50)${lean}` : undefined
  }
  const litT = (pl: BodyPart, nudge: string, k: number) => {
    const [cx, cy] = pl.c ?? [50, 50]
    return `translate(${nudge}) ${partT(pl) ?? ''} translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`
  }
  // accent paint: a tone field (base/top/outline/text) or a palette role.
  const paint = (f: BodyPart['fill']) =>
    f === 'base' || f === 'top' || f === 'outline' || f === 'text' ? p[f] : f ? PAL[f] : p.base
  const heroWeapon = weapon ?? (bodyShape === 'humanoid' ? 'sword' : undefined)
  return (
    <div
      data-skin="paper"
      style={{ width: dims.width, height: dims.height }}
      className={`relative flex items-center justify-center select-none transition-opacity ${alive ? '' : 'opacity-60'}`}
    >
      {selected && <div className="absolute -inset-1 rounded-full ring-2 ring-emerald-300 pointer-events-none" />}
      {tone === 'casting' && <div className="absolute -inset-1 rounded-full ring-2 ring-amber-400/70 animate-pulse pointer-events-none" />}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }} aria-hidden>
        {/* ground-contact shadow: an offset flat ellipse, NOT filter:drop-shadow */}
        <ellipse cx="54" cy={alive ? 55 : 80} rx="46" ry={alive ? 45 : 17} fill={PAL.shadow} fillOpacity={0.35} />
        {angle != null && heroWeapon && (
          <g transform={partT(parts[0])}>
            {WEAPON_SHAPES[heroWeapon]}
          </g>
        )}
        {alive ? (
          // The part stack, back→front. Each PLATE is a two-tone cutout — dark
          // base + outline, then the same path as a lit face with the up-left
          // nudge composed OUTSIDE the rotation (transforms apply right-to-left,
          // so the shape rotates first, then shifts) so the ONE light direction
          // survives any heading; `shadow` plates cast a flat down-right shadow
          // onto the parts below (the stacked-paper read). Each ACCENT is a
          // single flat fill (eyes/teeth/nose). No filters, no gradients.
          parts.map((pl, i) =>
            (pl.kind ?? 'plate') === 'accent' ? (
              // accent: a lone path carries its own facing transform, so an
              // animated one needs a transform-less <g data-atk> wrapper to hang
              // the CSS jab on (static accents stay a bare path — no extra node).
              pl.atk ? (
                <g key={i} data-atk={pl.atk}>
                  <path d={pl.d} fill={paint(pl.fill)} stroke={pl.stroke ? outline : 'none'} strokeWidth={pl.stroke ? 3 : undefined} strokeLinecap="round" transform={partT(pl)} />
                </g>
              ) : (
                <path key={i} d={pl.d} fill={paint(pl.fill)} stroke={pl.stroke ? outline : 'none'} strokeWidth={pl.stroke ? 3 : undefined} strokeLinecap="round" transform={partT(pl)} />
              )
            ) : (
              // plate: already a transform-less <g> holding shadow/base/lit — so
              // `data-atk` rides it for free (the CSS jab targets the g in screen
              // space; the inner paths keep their own facing/lit transforms).
              <g key={i} data-atk={pl.atk}>
                {pl.shadow && <path d={pl.d} fill={PAL.shadow} fillOpacity={0.3} transform={`translate(2.5 3.5) ${partT(pl) ?? ''}`} />}
                <path d={pl.d} fill={p.base} stroke={outline} strokeWidth="4.5" transform={partT(pl)} />
                <path d={pl.d} fill={p.top} transform={litT(pl, '-2.5 -3.5', 0.93)} />
              </g>
            ),
          )
        ) : (
          // KO: every PLATE merged into ONE silhouette (path data concatenates —
          // all wind the same way) and crumpled flat — squashed onto the ground
          // line and tipped over, lit copy keeping the standard up-left nudge,
          // so the heap still reads as cut paper (and as this body, not a
          // generic ✕). Accents dropped. Two paths; no filters.
          (() => {
            const merged = parts.filter((pl) => (pl.kind ?? 'plate') === 'plate').map((pl) => pl.d).join(' ')
            return (
              <>
                <path d={merged} fill={p.base} stroke={p.outline} strokeWidth="6" transform="translate(50 80) rotate(-9) scale(1.05 0.42) translate(-50 -50)" />
                <path d={merged} fill={p.top} transform="translate(-3 -4) translate(50 80) rotate(-9) scale(0.99 0.4) translate(-50 -50)" />
              </>
            )
          })()
        )}
      </svg>
      {/* heroes/NPCs keep a small centered icon (class glyph / merchant mark);
          monsters are silhouette-only — the layered body IS the identity. */}
      {!creature && (
        <span className="relative font-bold leading-none" style={{ fontSize: dims.fontSize, color: p.text }}>
          {alive ? glyph : ''}
        </span>
      )}
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
  // terrain restyle for skins WITHOUT an organic terrain layer: inline styles
  // for the rect barrier divs. Absent → the classic stone/amber classes. Flat
  // fills + zero-blur inset shadow only — no filters, same as the token contract.
  barrierWall?: CSSProperties
  barrierCliff?: CSSProperties
  // the organic terrain layer (render/terrain.tsx): ONE static per-location SVG
  // (wonky wall/cliff blobs, organic map rim, floor mottling, scatter props)
  // built from biome+barriers+seed. When present, Arena renders it inside the
  // ground layer and SKIPS the rect barrier divs and the classic perimeter ring.
  terrain?: (p: TerrainProps) => ReactNode
  // hero-anchored light: ONE radial-gradient div gliding with the party on the
  // compositor (layered under the static vignette). `city` is the warmer
  // ambient for peaceful town fields.
  heroLight?: { field: string; city: string }
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
    // the organic terrain layer replaces the rect barrier restyle + perimeter ring
    terrain: (p) => <PaperTerrain {...p} />,
    heroLight: {
      field: 'radial-gradient(closest-side, rgb(214 226 255 / 0.09), rgb(214 226 255 / 0.04) 55%, transparent 75%)',
      city:  'radial-gradient(closest-side, rgb(255 214 150 / 0.13), rgb(255 200 130 / 0.05) 55%, transparent 75%)',
    },
    vignette: 'radial-gradient(120% 120% at 50% 45%, transparent 55%, rgb(0 0 0 / 0.42) 100%)',
  },
}
