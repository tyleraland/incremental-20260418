import type { BodyPart } from '@/render/bodyTypes'

// CRAMP RAT (a spiny purple rodent) — the reference read is a round body
// bristling with SPIKES, a blunt snout poking forward, and a thin whippy
// tail. A soft under-body plate carries a jagged spike-ball over it (the
// signature), a blunt muzzle leads at the prow, and a thin tail lags behind.
// Accents: dark nose + eye, a rosy cheek blush. The spike-ball + body + snout
// plates all wind the same way so the far-LOD merge fills a solid spiny disc;
// the whippy tail is an accent (kept out of the merge — it needs no two-tone).
export const crampRatBody = [
  { d: 'M40 56 C30 60 19 62 11 60 C5 59 6 54 12 55 C20 57 30 55 40 52 Z', kind: 'accent', fill: 'base', stroke: true, lean: -6, atk: 'trail' },
  { d: 'M74 50 C74 67 60 78 44 78 C26 78 12 66 12 50 C12 34 26 22 44 22 C60 22 74 33 74 50 Z', c: [44, 50] },
  { d: 'M77 50 L73.2 56.9 L74.5 65.5 L66.7 69.2 L65.8 80.1 L55.3 77.1 L49.8 89.9 L41.5 78.8 L29.8 90 L28.5 73.9 L12.2 79.1 L19.3 63.5 L2.3 60.5 L16 50 L2.3 39.5 L19.3 36.5 L12.2 20.9 L28.5 26.1 L29.8 10 L41.5 21.2 L49.8 10.1 L55.3 22.9 L65.8 19.9 L66.7 30.8 L74.5 34.5 L73.2 43.1 Z', c: [45, 50], lean: 1, shadow: true },
  { d: 'M72 50 C72 44 78 40 86 41 C92 42 96 46 96 50 C96 54 92 58 86 59 C78 60 72 56 72 50 Z', c: [86, 50], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M92 47 a2.6 2.6 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  { d: 'M74 55 a3 3 0 1 0 0.1 0 Z', kind: 'accent', fill: 'bloom', lean: 4 },
  { d: 'M80 45 a2 2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
