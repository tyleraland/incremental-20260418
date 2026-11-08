import type { BodyPart } from '@/render/bodyTypes'

// tapered S-band under, bulbous head knob over — the head strikes forward on
// the move, a forked tongue flicks past the snout, two eyes ride the head
export const serpentBody = [
  { d: 'M76 56 C70 49 63 47 56 49 C48 52 44 60 38 66 C32 72 22 74 14 70 C8 67 5 60 10 57 C16 60 24 60 30 56 C36 52 40 44 48 38 C54 34 63 33 70 37 C76 41 79 49 76 56 Z', c: [42, 52] },
  { d: 'M77 41 C83 36 92 37 95 44 C98 51 94 59 86 60 C80 61 75 58 73 53 C71 48 72 44 77 41 Z', c: [84, 49], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M92 48 L100 48 L109 44 L102 49 L109 53 L100 50 L92 50 Z', kind: 'accent', fill: 'bloom', lean: 5, atk: 'jab' },
  { d: 'M88 43 a2.2 2.2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 5, atk: 'jab' },
  { d: 'M88 54 a2.2 2.2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
