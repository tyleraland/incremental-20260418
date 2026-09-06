import type { BodyPart } from '@/render/bodyTypes'

// FEARROW (regal phoenix/harpy) — the reference read is a pair of big swept
// feathered wings fanned around a slim body, a forked tail streaming behind,
// and a crested, sharp-beaked head at the prow. Five stacked cutouts back→
// front: forked tail plume (lags) · upper wing · lower wing · slim torso ·
// crested head (leads) · a gold flame-crest, a pale beak, and an eye accent.
export const fearrowBody = [
  { d: 'M50 44 C56 49 56 51 50 56 C40 55 30 54 20 53 L6 57 L14 52 L4 50 L14 48 L6 43 L20 47 C30 46 40 45 50 44 Z', c: [26, 50], lean: -8, atk: 'trail' },
  { d: 'M62 46 C52 49 39 50 27 50 C28 47 34 45 41 44 C32 43 21 42 12 39 C15 34 22 33 30 34 C22 30 14 24 8 16 C4 9 10 5 18 10 C34 20 50 34 62 46 Z', c: [34, 38], lean: 2, shadow: true },
  { d: 'M62 54 C50 66 34 80 18 90 C10 95 4 91 8 84 C14 76 22 70 30 66 C22 67 15 66 12 61 C21 58 32 57 41 56 C34 55 28 53 27 50 C39 50 52 51 62 54 Z', c: [34, 62], lean: 2, shadow: true },
  { d: 'M42 43 C58 41 72 44 80 47 C84 48 84 52 80 53 C72 56 58 59 42 57 C36 55 34 52 34 50 C34 48 36 45 42 43 Z', c: [58, 50], lean: 1 },
  { d: 'M80 50 C80 44 85 40 91 41 C89 34 92 28 98 27 C97 33 98 39 99 44 C101 46 102 48 102 50 C102 53 99 56 94 57 C88 58 82 55 80 50 Z', c: [91, 49], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M95 30 C96 24 99 20 103 20 C101 26 101 33 98 37 Z', kind: 'accent', fill: 'lampGlow', lean: 5, atk: 'jab' },
  { d: 'M99 48 L112 50 L99 53 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
  { d: 'M92 47 a2.1 2.1 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
