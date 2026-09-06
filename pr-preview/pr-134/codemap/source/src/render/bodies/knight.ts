import type { BodyPart } from '@/render/bodyTypes'

// Simple armored humanoid derived from the labeled Inkscape sketch: readable
// limbs first, details second. The carried sword remains the shared weapon
// layer; this body supplies legs, arms, plate silhouette, helmet, and shield.
export const knightBody = [
  { d: 'M46 59 C50 66 51 76 49 86 C46 95 37 96 34 88 C31 78 33 66 38 58 Z', c: [42, 75], lean: -3, walk: 1 },
  { d: 'M54 59 C61 66 65 78 64 88 C63 96 54 97 50 88 C47 78 48 67 51 60 Z', c: [56, 75], lean: -3, walk: 2 },
  { d: 'M39 43 C35 44 32 47 31 52 C30 57 34 61 42 60 L37 70 C28 73 20 67 20 58 C20 49 27 42 36 40 Z', c: [31, 56], lean: -1, shadow: true, walk: 1, atk: 'trail' },
  { d: 'M61 36 C70 31 82 34 88 43 C92 50 86 57 78 54 L64 49 C58 46 57 40 61 36 Z', c: [75, 44], lean: 4, shadow: true, walk: 2, atk: 'jab' },
  { d: 'M32 50 C32 32 43 21 56 22 C69 23 79 35 78 51 C77 68 66 79 53 80 C40 78 32 66 32 50 Z', c: [55, 51], idle: 'breathe' },
  { d: 'M51 31 C62 27 75 34 78 47 C81 60 72 70 59 70 C48 70 40 62 40 51 C40 42 44 35 51 31 Z', c: [61, 50], lean: 3, shadow: true, atk: 'jab' },
  { d: 'M22 52 C19 43 23 35 31 32 C39 36 42 47 39 59 C34 64 26 61 22 52 Z', kind: 'accent', fill: 'steel', stroke: true, lean: -1, walk: 1, atk: 'trail' },
  { d: 'M44 39 L50 32 L60 31 L69 39 L64 43 L54 41 Z M46 49 L72 49 L72 55 L46 55 Z M48 61 L68 62 L65 67 L50 66 Z', kind: 'accent', fill: 'cream', stroke: true },
  { d: 'M66 42 L83 47 L83 53 L66 58 Z', kind: 'accent', fill: 'outline', lean: 3, atk: 'jab' },
] satisfies BodyPart[]
