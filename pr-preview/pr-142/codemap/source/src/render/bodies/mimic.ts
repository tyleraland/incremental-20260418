import type { BodyPart } from '@/render/bodyTypes'

// MIMIC (a treasure-chest monster) — the reference read is a banded wooden
// CHEST whose front splits into a fanged maw, with long grasping clawed arms.
// Bodies wear the team tone, so the SILHOUETTE sells the chest: a boxy back
// body plate crossed by two pale metal BANDS, a front clamshell of two jaw
// plates around a dark gullet with interlocking pale TEETH (snap shut on a jab),
// and two thick clawed arms reaching from the sides (they lag on the move). Box
// + both jaws wind the same way so the far-LOD merge is a solid mouthed box;
// bands/teeth/arms stay accents out of the merge.
export const mimicBody = [
  { d: 'M28 38 C18 31 10 21 6 10 C3 2 12 0 12 6 C13 3 18 4 17 9 C22 18 26 28 26 40 Z', kind: 'accent', fill: 'base', stroke: true, lean: -4, atk: 'trail', walk: 1 },
  { d: 'M28 62 C18 69 10 79 6 90 C3 98 12 100 12 94 C13 97 18 96 17 91 C22 82 26 72 26 60 Z', kind: 'accent', fill: 'base', stroke: true, lean: -4, atk: 'trail', walk: 2 },
  { d: 'M16 28 Q8 28 8 38 L8 62 Q8 72 16 72 L42 72 L42 28 Z', c: [24, 50] },
  { d: 'M15 29 L21 29 L21 71 L15 71 Z', kind: 'accent', fill: 'cream' },
  { d: 'M27 29 L33 29 L33 71 L27 71 Z', kind: 'accent', fill: 'cream' },
  { d: 'M40 48 L74 42 L74 58 L40 52 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
  { d: 'M40 70 L64 69 Q74 67 74 58 L40 52 Z', c: [56, 62], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M40 53 L74 58 L72 52 L67 57 L62 51 L57 56 L52 50 L47 55 L42 49 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
  { d: 'M40 30 L40 48 L74 42 Q74 33 64 31 Z', c: [56, 38], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M40 47 L74 42 L72 48 L67 43 L62 49 L57 44 L52 50 L47 45 L42 51 Z', kind: 'accent', fill: 'cream', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
