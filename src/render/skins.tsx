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
  // Body LOD: at far/dense zoom (the chip's `detail` is off) the paper skin
  // collapses its stacked parts into ONE merged two-tone silhouette (2 paths vs
  // ~12) — the per-token node count is what drives style-recalc across a big
  // mob, and the inner depth/accents aren't legible at that size anyway. A
  // boolean edge (flips only when LOD flips), so it never churns the memo.
  simple?: boolean
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
  a.moving === b.moving && a.creature === b.creature && a.simple === b.simple &&
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
export interface BodyPart {
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
  // OPTIONAL walk cycle (CSS-driven, off the memo'd body — see `data-walk` +
  // index.css): a foot/leg/arm that shuffles a little WHILE the token is moving.
  // `1`/`2` are opposite gait phases (alternating feet step out of sync). Runs
  // only at detail LOD (the far-LOD merge has no accent parts) and only while
  // moving (the chip wrapper carries `animate-walk`). Absent = the part holds.
  walk?: 1 | 2
  // OPTIONAL continuous idle (CSS-driven, off the memo'd body — see `data-idle`
  // + index.css): a RESTING token stays subtly alive. 'breathe' swells the part
  // through three poses (rest → inhale → exhale undershoot); 'sway' drifts it a
  // few degrees (antennae, fronds, tails). The chip wrapper carries
  // `animate-idle` ONLY while the token is at detail LOD, alive, still and not
  // casting (BattleChip), with per-token phase/tempo vars seeded off the unit
  // id — so a nest never pulses in lockstep and a dense far-LOD mob (merged,
  // no data-idle nodes) animates nothing. Keep idle parts to 1–3 per body:
  // each holds a compositor layer promoted for the token's whole resting life.
  idle?: 'breathe' | 'sway'
}

// Exported for the body contract test (Bodies.test.ts) + the asset catalog —
// the entries themselves stay authored here.
export const PAPER_BODIES: Record<BodyShape, BodyPart[]> = {
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
  // FEARROW (regal phoenix/harpy) — the reference read is a pair of big swept
  // feathered wings fanned around a slim body, a forked tail streaming behind,
  // and a crested, sharp-beaked head at the prow. Five stacked cutouts back→
  // front: forked tail plume (lags) · upper wing · lower wing · slim torso ·
  // crested head (leads) · a gold flame-crest, a pale beak, and an eye accent.
  fearrow: [
    { d: 'M50 44 C56 49 56 51 50 56 C40 55 30 54 20 53 L6 57 L14 52 L4 50 L14 48 L6 43 L20 47 C30 46 40 45 50 44 Z', c: [26, 50], lean: -8, atk: 'trail' },
    { d: 'M62 46 C52 49 39 50 27 50 C28 47 34 45 41 44 C32 43 21 42 12 39 C15 34 22 33 30 34 C22 30 14 24 8 16 C4 9 10 5 18 10 C34 20 50 34 62 46 Z', c: [34, 38], lean: 2, shadow: true },
    { d: 'M62 54 C50 66 34 80 18 90 C10 95 4 91 8 84 C14 76 22 70 30 66 C22 67 15 66 12 61 C21 58 32 57 41 56 C34 55 28 53 27 50 C39 50 52 51 62 54 Z', c: [34, 62], lean: 2, shadow: true },
    { d: 'M42 43 C58 41 72 44 80 47 C84 48 84 52 80 53 C72 56 58 59 42 57 C36 55 34 52 34 50 C34 48 36 45 42 43 Z', c: [58, 50], lean: 1 },
    { d: 'M80 50 C80 44 85 40 91 41 C89 34 92 28 98 27 C97 33 98 39 99 44 C101 46 102 48 102 50 C102 53 99 56 94 57 C88 58 82 55 80 50 Z', c: [91, 49], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M95 30 C96 24 99 20 103 20 C101 26 101 33 98 37 Z', kind: 'accent', fill: 'lampGlow', lean: 5, atk: 'jab' },
    { d: 'M99 48 L112 50 L99 53 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
    { d: 'M92 47 a2.1 2.1 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 5, atk: 'jab' },
  ],
  // CRAMP RAT (a spiny purple rodent) — the reference read is a round body
  // bristling with SPIKES, a blunt snout poking forward, and a thin whippy
  // tail. A soft under-body plate carries a jagged spike-ball over it (the
  // signature), a blunt muzzle leads at the prow, and a thin tail lags behind.
  // Accents: dark nose + eye, a rosy cheek blush. The spike-ball + body + snout
  // plates all wind the same way so the far-LOD merge fills a solid spiny disc;
  // the whippy tail is an accent (kept out of the merge — it needs no two-tone).
  crampRat: [
    { d: 'M40 56 C30 60 19 62 11 60 C5 59 6 54 12 55 C20 57 30 55 40 52 Z', kind: 'accent', fill: 'base', stroke: true, lean: -6, atk: 'trail' },
    { d: 'M74 50 C74 67 60 78 44 78 C26 78 12 66 12 50 C12 34 26 22 44 22 C60 22 74 33 74 50 Z', c: [44, 50] },
    { d: 'M77 50 L73.2 56.9 L74.5 65.5 L66.7 69.2 L65.8 80.1 L55.3 77.1 L49.8 89.9 L41.5 78.8 L29.8 90 L28.5 73.9 L12.2 79.1 L19.3 63.5 L2.3 60.5 L16 50 L2.3 39.5 L19.3 36.5 L12.2 20.9 L28.5 26.1 L29.8 10 L41.5 21.2 L49.8 10.1 L55.3 22.9 L65.8 19.9 L66.7 30.8 L74.5 34.5 L73.2 43.1 Z', c: [45, 50], lean: 1, shadow: true },
    { d: 'M72 50 C72 44 78 40 86 41 C92 42 96 46 96 50 C96 54 92 58 86 59 C78 60 72 56 72 50 Z', c: [86, 50], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M92 47 a2.6 2.6 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
    { d: 'M74 55 a3 3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'bloom', lean: 4 },
    { d: 'M80 45 a2 2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  ],
  // MANDRAGORA (a carnivorous plant — Venus-flytrap maw + vine tentacles) — the
  // reference read is a bulbous leafy base with a gaping pink maw at the front,
  // curling vine tentacles radiating out, and a pale flower crown on top. Bodies
  // wear the team tone (so it's not literally green), so the SILHOUETTE carries
  // the plant: five curling tentacle accents (back ones lag) behind a bulb plate,
  // a big pink gullet with two leafy jaw plates that snap forward on a jab, a dark
  // maw-hollow, and a three-petal flower crown. The bulb + both jaws wind the same
  // way so the far-LOD merge is a solid mouthed blob; tentacles/flower stay accents.
  mandragora: [
    { d: 'M37 39 C27 32 18 20 11 8 C7 2 0 5 4 12 C11 24 22 35 31 48 Z', kind: 'accent', fill: 'bloom', stroke: true, lean: -4, atk: 'trail' },
    { d: 'M37 65 C27 72 18 84 11 96 C7 102 0 99 4 92 C11 80 22 69 31 56 Z', kind: 'accent', fill: 'bloom', stroke: true, lean: -4, atk: 'trail' },
    { d: 'M25 47 C15 45 4 41 2 32 C1 27 6 27 8 32 C11 41 18 48 27 53 Z', kind: 'accent', fill: 'bloom', stroke: true, lean: -4, atk: 'trail' },
    { d: 'M43 29 C41 19 37 8 31 2 C27 -2 23 3 27 8 C33 15 39 23 41 33 Z', kind: 'accent', fill: 'bloom', stroke: true },
    { d: 'M43 73 C41 83 37 94 31 100 C27 104 23 99 27 94 C33 87 39 79 41 69 Z', kind: 'accent', fill: 'bloom', stroke: true },
    { d: 'M62 52 C62 68 52 79 38 79 C23 79 12 68 12 52 C12 36 23 25 38 25 C52 25 62 36 62 52 Z', c: [36, 52] },
    { d: 'M30 56 a5 5 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline' },
    { d: 'M56 52 L97 32 L97 72 Z', kind: 'accent', fill: 'bloom', lean: 5, atk: 'jab' },
    { d: 'M50 46 C64 38 82 30 98 28 C100 35 97 44 88 48 C74 51 60 51 50 51 Z', c: [80, 42], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M50 54 C60 49 74 49 88 52 C97 56 100 65 98 72 C82 70 64 62 50 54 Z', c: [80, 58], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M34 24 a4 4 0 1 0 0.1 0 Z', kind: 'accent', fill: 'cream', lean: 1 },
    { d: 'M28 27 a3 3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'cream', lean: 1 },
    { d: 'M40 27 a3 3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'cream', lean: 1 },
  ],
  // SPIDER (eight-legged) — the reference read is a two-part body (a big rear
  // abdomen + a smaller front cephalothorax) ringed by EIGHT jointed legs, four
  // per side, with fangs + an eye cluster at the prow. The legs are the signature:
  // dark-red bent accents radiating out (front pairs snap forward on a jab, rear
  // pairs lag), drawn behind the two body plates so they emerge from under it. The
  // abdomen + cephalothorax wind the same way so the far-LOD merge is a solid
  // peanut; legs/fang/eyes stay accents out of the merge.
  spider: [
    { d: 'M65.7 43.8 L71.1 28.4 L87.7 21.7 L69.2 26.1 L62.2 39.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 1 },
    { d: 'M60.6 38.5 L57.1 22.6 L67.6 8.2 L54.3 21.7 L55.4 36.8 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 2 },
    { d: 'M52.6 36.8 L42.3 25.4 L40.4 8.2 L39.5 26.3 L47.4 38.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 1 },
    { d: 'M45.8 39.5 L31.1 35.3 L20.3 21.7 L29.1 37.6 L42.3 43.8 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 2 },
    { d: 'M62.2 60.5 L69.2 73.9 L87.7 78.3 L71.1 71.6 L65.7 56.2 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 2 },
    { d: 'M55.4 63.2 L54.3 78.3 L67.6 91.8 L57.1 77.4 L60.6 61.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 1 },
    { d: 'M47.4 61.5 L39.5 73.7 L40.4 91.8 L42.3 74.6 L52.6 63.2 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 2 },
    { d: 'M42.3 56.2 L29.1 62.4 L20.3 78.3 L31.1 64.7 L45.8 60.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 1 },
    { d: 'M46 50 C46 63 37 72 25 72 C13 72 4 63 4 50 C4 37 13 28 25 28 C37 28 46 37 46 50 Z', c: [24, 50], lean: -3 },
    { d: 'M74 50 C74 59 67 66 57 66 C47 66 40 59 40 50 C40 41 47 34 57 34 C67 34 74 41 74 50 Z', c: [57, 50], lean: 3, shadow: true, atk: 'jab' },
    { d: 'M72 47 L86 50 L72 53 Z', kind: 'accent', fill: 'outline', lean: 4, atk: 'jab' },
    { d: 'M66 46 a1.8 1.8 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4, atk: 'jab' },
    { d: 'M66 54 a1.8 1.8 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4, atk: 'jab' },
  ],
  // MIMIC (a treasure-chest monster) — the reference read is a banded wooden
  // CHEST whose front splits into a fanged maw, with long grasping clawed arms.
  // Bodies wear the team tone, so the SILHOUETTE sells the chest: a boxy back
  // body plate crossed by two pale metal BANDS, a front clamshell of two jaw
  // plates around a dark gullet with interlocking pale TEETH (snap shut on a jab),
  // and two thick clawed arms reaching from the sides (they lag on the move). Box
  // + both jaws wind the same way so the far-LOD merge is a solid mouthed box;
  // bands/teeth/arms stay accents out of the merge.
  mimic: [
    { d: 'M28 38 C18 31 10 21 6 10 C3 2 12 0 12 6 C13 3 18 4 17 9 C22 18 26 28 26 40 Z', kind: 'accent', fill: 'base', stroke: true, lean: -4, atk: 'trail', walk: 1 },
    { d: 'M28 62 C18 69 10 79 6 90 C3 98 12 100 12 94 C13 97 18 96 17 91 C22 82 26 72 26 60 Z', kind: 'accent', fill: 'base', stroke: true, lean: -4, atk: 'trail', walk: 2 },
    { d: 'M16 28 Q8 28 8 38 L8 62 Q8 72 16 72 L42 72 L42 28 Z', c: [24, 50] },
    { d: 'M15 29 L21 29 L21 71 L15 71 Z', kind: 'accent', fill: 'cream' },
    { d: 'M27 29 L33 29 L33 71 L27 71 Z', kind: 'accent', fill: 'cream' },
    { d: 'M40 48 L74 42 L74 58 L40 52 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
    { d: 'M40 70 L64 69 Q74 67 74 58 L40 52 Z', c: [56, 62], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M40 53 L74 58 L72 52 L67 57 L62 51 L57 56 L52 50 L47 55 L42 49 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
    { d: 'M40 30 L40 48 L74 42 Q74 33 64 31 Z', c: [56, 38], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M40 47 L74 42 L72 48 L67 43 L62 49 L57 44 L52 50 L47 45 L42 51 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
  ],
  // MIMIC2 (a boxier, rectangular treasure-chest mimic) — the crate cousin of
  // `mimic`: a hard-cornered rectangular body crossed by THREE straight metal
  // bands, a rectangular clamshell maw with blocky SQUARE teeth (snap on a jab), a
  // big square LOCK plate + keyhole on the chin, and two straight clawed arms from
  // the back corners (they lag on the move). Crisp right angles distinguish it from
  // the rounded `mimic`. Box + both jaws wind the same way so the far-LOD merge is
  // a solid rectangular mouthed box; bands/teeth/lock/arms stay accents.
  mimic2: [
    { d: 'M22 30 C16 22 10 14 4 8 C1 5 8 1 9 6 C10 2 15 4 14 9 C18 16 22 24 26 32 Z', kind: 'accent', fill: 'base', stroke: true, lean: -4, atk: 'trail', walk: 1 },
    { d: 'M22 70 C16 78 10 86 4 92 C1 95 8 99 9 94 C10 98 15 96 14 91 C18 84 22 76 26 68 Z', kind: 'accent', fill: 'base', stroke: true, lean: -4, atk: 'trail', walk: 2 },
    { d: 'M6 24 L44 24 L44 76 L6 76 Z', c: [24, 50] },
    { d: 'M11 25 L16 25 L16 75 L11 75 Z', kind: 'accent', fill: 'cream' },
    { d: 'M23 25 L28 25 L28 75 L23 75 Z', kind: 'accent', fill: 'cream' },
    { d: 'M35 25 L40 25 L40 75 L35 75 Z', kind: 'accent', fill: 'cream' },
    { d: 'M42 46 L78 44 L78 56 L42 54 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
    { d: 'M42 76 L42 54 L78 56 L78 80 Z', c: [60, 66], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M42 54 L78 56 L75.3 55.8 L75.3 50.8 L70.8 50.6 L70.8 55.6 L68.1 55.4 L68.1 50.4 L63.6 50.2 L63.6 55.2 L60.9 55 L60.9 50 L56.4 49.8 L56.4 54.8 L53.7 54.6 L53.7 49.6 L49.2 49.4 L49.2 54.4 L46.5 54.2 L46.5 49.2 L42 49 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
    { d: 'M42 24 L78 20 L78 44 L42 46 Z', c: [60, 34], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M42 46 L78 44 L75.3 44.2 L75.3 49.2 L70.8 49.4 L70.8 44.4 L68.1 44.6 L68.1 49.6 L63.6 49.8 L63.6 44.8 L60.9 45 L60.9 50 L56.4 50.2 L56.4 45.2 L53.7 45.4 L53.7 50.4 L49.2 50.6 L49.2 45.6 L46.5 45.8 L46.5 50.8 L42 51 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
    { d: 'M54 60 L64 60 L64 72 L54 72 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
    { d: 'M58 64 a1.8 1.8 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  ],
  // THIEF BUG (a scuttling roach) — the reference read is a LOW two-lobe
  // carapace (a big oval abdomen behind a smaller head-shield) trailing two very
  // LONG antennae swept back over the body, six splayed legs, and small pincer
  // mandibles at the prow. The antennae are the signature. The six legs ship as
  // TWO tripod-gait accents (three legs per path, opposite walk phases — half
  // the spider's leg nodes). First body on the `data-idle` seam: the abdomen
  // BREATHES (scale pulse; the wing seam rides it) and the antennae SWAY while
  // the bug rests; the head-shield + mandibles snap forward on a jab and the
  // antennae whip back. Abdomen + head-shield wind the same way so the far-LOD
  // merge is a solid two-lobe bug; legs/antennae/seam/mandibles stay accents.
  thiefBug: [
    { d: 'M58 40 L66 26 L79 17 L63 27 L54 38 Z M45 62 L45 76 L54 88 L42 78 L40 61 Z M31 40 L21 29 L8 24 L19 32 L27 42 Z', kind: 'accent', fill: 'base', stroke: true, walk: 1 },
    { d: 'M58 60 L66 74 L79 83 L63 73 L54 62 Z M45 38 L45 24 L54 12 L42 22 L40 39 Z M31 60 L21 71 L8 76 L19 68 L27 58 Z', kind: 'accent', fill: 'base', stroke: true, walk: 2 },
    // both antennae in ONE two-subpath accent: the sway rotation pivots on their
    // shared center, so they scissor open/closed — and it's one compositor layer
    // instead of two (the idle budget is per-part, not per-path).
    { d: 'M82 41 C64 19 38 8 13 5 C7 5 7 11 13 13 C36 17 58 27 76 46 Z M82 59 C64 81 38 92 13 95 C7 95 7 89 13 87 C36 83 58 73 76 54 Z', kind: 'accent', fill: 'base', stroke: true, lean: -5, atk: 'trail', idle: 'sway' },
    { d: 'M68 50 C68 65 55 75 35 75 C16 75 4 64 4 50 C4 36 16 25 35 25 C55 25 68 35 68 50 Z', c: [36, 50], lean: -2, idle: 'breathe' },
    { d: 'M66 50 L8 48.8 L8 51.2 L66 51 Z', kind: 'accent', fill: 'outline', lean: -2, idle: 'breathe' },
    { d: 'M92 50 C92 58 85 64 76 64 C67 64 61 58 61 50 C61 42 67 36 76 36 C85 36 92 42 92 50 Z', c: [76, 50], lean: 4, shadow: true, atk: 'jab' },
    { d: 'M90 45 L102 40 L96 49 Z M90 55 L102 60 L96 51 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  ],
  // LARVA (segmented ember grub) — the reference read is a low curled grub:
  // dark little legs underneath, a tapering segmented body, and a hooked front
  // plate that curls upward. The silhouette stays creature-readable in the
  // far-LOD merge; the shell-band accent is packed into one multi-subpath part.
  larva: [
    { d: 'M22 61 L18 75 L23 75 L27 62 Z M47 68 L45 85 L50 85 L52 68 Z M73 59 L78 70 L82 68 L77 57 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, walk: 1 },
    { d: 'M34 66 L31 82 L36 82 L39 67 Z M61 65 L62 80 L67 80 L65 64 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, walk: 2 },
    { d: 'M15 55 C9 47 13 36 25 29 C37 22 54 23 68 31 C79 37 85 48 81 58 C76 70 58 77 40 73 C28 71 19 65 15 55 Z', c: [47, 52], lean: -2, idle: 'breathe' },
    { d: 'M25 39 C35 27 54 25 70 35 C78 40 82 49 79 57 C72 54 63 53 54 56 C42 60 31 57 22 50 C20 46 21 42 25 39 Z', c: [51, 46], shadow: true, idle: 'breathe' },
    { d: 'M62 33 C68 19 83 14 93 25 C85 24 78 30 77 39 C87 42 93 50 90 60 C83 56 74 52 66 56 C59 51 57 40 62 33 Z', c: [76, 38], lean: 5, shadow: true, atk: 'jab' },
    { d: 'M28 38 C35 42 38 50 35 58 L30 59 C33 49 31 42 24 40 Z M43 31 C50 38 53 49 50 62 L45 63 C48 50 45 40 38 34 Z M59 32 C66 40 68 50 64 63 L59 63 C63 51 61 42 54 35 Z M72 40 C79 47 80 55 75 63 L71 61 C75 53 74 47 68 42 Z', kind: 'accent', fill: 'base', stroke: true },
    { d: 'M26 31 L35 27 L41 31 L31 35 Z M45 27 L54 28 L58 33 L47 33 Z M65 30 L73 35 L74 40 L64 36 Z M74 21 L82 19 L86 23 L77 25 Z', kind: 'accent', fill: 'cream' },
    { d: 'M85 30 L98 25 L89 36 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  ],
  // CENTIPEDE - a long bead-chain crawler. The read is many little legs under a
  // segmented spine, with a hard head plate and antennae/mandibles at the prow.
  // Legs are packed into two alternating accents so the walk cycle stays cheap.
  centipede: [
    { d: 'M12 37 L2 23 L-6 20 L1 31 L10 44 Z M31 34 L25 18 L17 12 L22 27 L29 44 Z M51 34 L49 17 L42 8 L44 26 L49 44 Z M71 37 L75 20 L70 10 L66 27 L68 44 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, atk: 'trail', walk: 1 },
    { d: 'M12 63 L2 77 L-6 80 L1 69 L10 56 Z M31 66 L25 82 L17 88 L22 73 L29 56 Z M51 66 L49 83 L42 92 L44 74 L49 56 Z M71 63 L75 80 L70 90 L66 73 L68 56 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, atk: 'trail', walk: 2 },
    { d: 'M22 50 C22 60 15 67 6 67 C-3 67 -10 60 -10 50 C-10 40 -3 33 6 33 C15 33 22 40 22 50 Z', c: [6, 50], lean: -6, atk: 'trail' },
    { d: 'M38 50 C38 62 30 70 19 70 C8 70 0 62 0 50 C0 38 8 30 19 30 C30 30 38 38 38 50 Z', c: [19, 50], lean: -4, idle: 'breathe' },
    { d: 'M55 50 C55 63 46 72 34 72 C22 72 13 63 13 50 C13 37 22 28 34 28 C46 28 55 37 55 50 Z', c: [34, 50], lean: -2, shadow: true, idle: 'breathe' },
    { d: 'M72 50 C72 62 64 70 53 70 C42 70 34 62 34 50 C34 38 42 30 53 30 C64 30 72 38 72 50 Z', c: [53, 50], shadow: true },
    { d: 'M91 50 C91 60 84 67 74 67 C64 67 57 60 57 50 C57 40 64 33 74 33 C84 33 91 40 91 50 Z', c: [74, 50], lean: 3, shadow: true, atk: 'jab' },
    { d: 'M92 50 C92 43 98 38 106 39 C113 40 117 45 117 50 C117 55 113 60 106 61 C98 62 92 57 92 50 Z', c: [105, 50], lean: 6, shadow: true, atk: 'jab' },
    { d: 'M102 42 C96 30 86 21 75 17 C70 16 69 21 74 23 C84 27 92 35 98 45 Z M102 58 C96 70 86 79 75 83 C70 84 69 79 74 77 C84 73 92 65 98 55 Z', kind: 'accent', fill: 'base', stroke: true, lean: 4, atk: 'jab', idle: 'sway' },
    { d: 'M114 45 L124 39 L119 49 Z M114 55 L124 61 L119 51 Z', kind: 'accent', fill: 'outline', lean: 7, atk: 'jab' },
    { d: 'M100 45 a2.2 2.2 0 1 0 0.1 0 Z M100 55 a2.2 2.2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 6, atk: 'jab' },
    { d: 'M16 36 L23 32 L30 36 L23 40 Z M34 31 L42 31 L48 36 L38 38 Z M55 32 L64 35 L68 40 L58 38 Z M76 38 L85 43 L86 49 L75 45 Z', kind: 'accent', fill: 'cream' },
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

// Per-shape merged silhouette: every PLATE's path concatenated (all wind the
// same way) into one outline — used by the KO crumple AND the far-LOD body, so
// a dense mob draws 2 paths/token instead of ~12. Precomputed at module load.
const PAPER_MERGED: Record<BodyShape, string> = Object.fromEntries(
  (Object.keys(PAPER_BODIES) as BodyShape[]).map((k) => [
    k, PAPER_BODIES[k].filter((pl) => (pl.kind ?? 'plate') === 'plate').map((pl) => pl.d).join(' '),
  ]),
) as Record<BodyShape, string>

// One SVG per token: ground shadow, facing weapon (heroes), then the STACK of
// body parts drawn back-to-front. Merged into a single <svg> to keep the
// per-token element count down (see contract).
const PaperBody = memo(function PaperBody({ glyph, tone, bodyShape, tint, weapon, alive, selected, facingDeg, moving, creature, simple, dims }: TokenBodyProps) {
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
        {alive && simple ? (
          // FAR-LOD body: the whole creature as ONE merged two-tone silhouette
          // rotated to facing — 2 paths instead of ~12. At this on-screen size
          // the inner depth/accents aren't legible anyway, and the per-token node
          // count is what drives style-recalc across a dense mob (the profiling
          // lever). Same shape + facing + two-tone read as the full body.
          <>
            <path d={PAPER_MERGED[bodyShape]} fill={p.base} stroke={outline} strokeWidth="5" transform={angle != null ? `rotate(${angle} 50 50)` : undefined} />
            <path d={PAPER_MERGED[bodyShape]} fill={p.top} transform={`translate(-2.5 -3.5) ${angle != null ? `rotate(${angle} 50 50) ` : ''}translate(50 50) scale(0.93) translate(-50 -50)`} />
          </>
        ) : alive ? (
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
              // animated one (jab, walk OR idle) needs a transform-less <g> wrapper
              // to hang the CSS motion on (static accents stay a bare path — no node).
              pl.atk || pl.walk || pl.idle ? (
                <g key={i} data-atk={pl.atk} data-walk={pl.walk} data-idle={pl.idle}>
                  <path d={pl.d} fill={paint(pl.fill)} stroke={pl.stroke ? outline : 'none'} strokeWidth={pl.stroke ? 3 : undefined} strokeLinecap="round" transform={partT(pl)} />
                </g>
              ) : (
                <path key={i} d={pl.d} fill={paint(pl.fill)} stroke={pl.stroke ? outline : 'none'} strokeWidth={pl.stroke ? 3 : undefined} strokeLinecap="round" transform={partT(pl)} />
              )
            ) : (
              // plate: already a transform-less <g> holding shadow/base/lit — so
              // `data-atk`/`data-walk`/`data-idle` ride it for free (the CSS motion
              // targets the g in screen space; the inner paths keep their facing/lit
              // transforms).
              <g key={i} data-atk={pl.atk} data-walk={pl.walk} data-idle={pl.idle}>
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
          <>
            <path d={PAPER_MERGED[bodyShape]} fill={p.base} stroke={p.outline} strokeWidth="6" transform="translate(50 80) rotate(-9) scale(1.05 0.42) translate(-50 -50)" />
            <path d={PAPER_MERGED[bodyShape]} fill={p.top} transform="translate(-3 -4) translate(50 80) rotate(-9) scale(0.99 0.4) translate(-50 -50)" />
          </>
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
