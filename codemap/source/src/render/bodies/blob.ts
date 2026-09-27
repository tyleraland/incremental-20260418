import type { BodyPart } from '@/render/bodyTypes'

// slime: wobbly puddle with a droplet wake, gel core riding it — the core
// LAGS behind the heading while moving (inertia); two dark eyes ride the core
// front so the blob reads as a creature, not a splash
export const blobBody = [
  { d: 'M91 52 C92 61 84 71 73 75 C63 83 47 86 36 80 C24 83 12 75 14 63 C7 59 6 48 13 42 C9 35 12 27 20 26 C26 25 31 29 30 35 C36 27 48 23 58 26 C74 25 88 37 91 48 L91 52 Z', c: [50, 52] },
  { d: 'M50 34 C62 34 70 42 70 52 C70 62 60 69 48 69 C37 69 29 62 29 52 C29 42 38 34 50 34 Z', c: [50, 52], lean: -6, shadow: true },
  { d: 'M64 45 a3.4 3.4 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: -6 },
  { d: 'M64 59 a3.4 3.4 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: -6 },
] satisfies BodyPart[]
