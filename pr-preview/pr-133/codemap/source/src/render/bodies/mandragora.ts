import type { BodyPart } from '@/render/bodyTypes'

// MANDRAGORA (a carnivorous plant — Venus-flytrap maw + vine tentacles) — the
// reference read is a bulbous leafy base with a gaping pink maw at the front,
// curling vine tentacles radiating out, and a pale flower crown on top. Bodies
// wear the team tone (so it's not literally green), so the SILHOUETTE carries
// the plant: five curling tentacle accents (back ones lag) behind a bulb plate,
// a big pink gullet with two leafy jaw plates that snap forward on a jab, a dark
// maw-hollow, and a three-petal flower crown. The bulb + both jaws wind the same
// way so the far-LOD merge is a solid mouthed blob; tentacles/flower stay accents.
export const mandragoraBody = [
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
] satisfies BodyPart[]
