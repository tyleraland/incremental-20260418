import type { BodyPart } from '@/render/bodyTypes'

// two swept wings (waisted at the hinge) under a slim fuselage with a beaked
// head at the prow — harpies, bats; the body+head leads the wings on the move
export const flyerBody = [
  { d: 'M54 44 C46 36 36 24 26 16 C16 8 6 12 8 22 C10 32 22 42 40 48 L40 52 C22 58 10 68 8 78 C6 88 16 92 26 84 C36 76 46 64 54 56 C56 52 56 48 54 44 Z', c: [30, 50] },
  { d: 'M90 50 C90 45 85 42 79 42 C72 38 62 36 50 37 L30 44 C25 45 22 47 22 50 C22 53 25 55 30 56 L50 63 C62 64 72 62 79 58 C85 58 90 55 90 50 Z', c: [55, 50], lean: 4, shadow: true },
  { d: 'M86 46 L100 50 L86 54 Z', kind: 'accent', fill: 'outline', lean: 4 },
  { d: 'M78 45 a2.3 2.3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4 },
  { d: 'M78 55 a2.3 2.3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4 },
] satisfies BodyPart[]
