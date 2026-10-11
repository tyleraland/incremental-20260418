import type { BodyPart } from '@/render/bodyTypes'

// CENTIPEDE - a long bead-chain crawler. The read is many little legs under a
// segmented spine, with a hard head plate and antennae/mandibles at the prow.
// Legs are packed into two alternating accents so the walk cycle stays cheap.
export const centipedeBody = [
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
] satisfies BodyPart[]
