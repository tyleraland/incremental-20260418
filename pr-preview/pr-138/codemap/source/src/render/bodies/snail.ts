import type { BodyPart } from '@/render/bodyTypes'

// foot slab + ball-tipped eyestalks under, spiral shell riding the back —
// the foot STRETCHES forward from under the shell on the move; the shell
// spiral is a flat accent on top
export const snailBody = [
  { d: 'M74 42 C77 36 82 32 87 33 C93 34 94 41 89 43 C86 44 84 46 84 48 L84 52 C84 54 86 56 89 57 C94 59 93 66 87 67 C82 68 77 64 74 58 C70 62 63 65 56 66 L26 68 C16 68 9 61 9 51 C9 41 16 34 26 34 L56 34 C64 35 70 38 74 42 Z', c: [50, 50], lean: 6 },
  { d: 'M34 24 C49 24 60 35 60 50 C60 65 49 76 34 76 C19 76 8 65 8 50 C8 35 19 24 34 24 Z', c: [34, 50], shadow: true },
  { d: 'M34 40 C41 42 43 49 38 54 C31 60 20 55 20 46 C20 37 28 30 39 32', kind: 'accent', fill: 'outline', stroke: true },
] satisfies BodyPart[]
