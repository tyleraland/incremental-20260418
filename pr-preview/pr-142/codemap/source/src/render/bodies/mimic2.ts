import type { BodyPart } from '@/render/bodyTypes'

// MIMIC2 (a boxier, rectangular treasure-chest mimic) — the crate cousin of
// `mimic`: a hard-cornered rectangular body crossed by THREE straight metal
// bands, a rectangular clamshell maw with blocky SQUARE teeth (snap on a jab), a
// big square LOCK plate + keyhole on the chin, and two straight clawed arms from
// the back corners (they lag on the move). Crisp right angles distinguish it from
// the rounded `mimic`. Box + both jaws wind the same way so the far-LOD merge is
// a solid rectangular mouthed box; bands/teeth/lock/arms stay accents.
export const mimic2Body = [
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
] satisfies BodyPart[]
