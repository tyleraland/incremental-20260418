import type { BodyPart } from '@/render/bodyTypes'

// SPIDER (eight-legged) — the reference read is a two-part body (a big rear
// abdomen + a smaller front cephalothorax) ringed by EIGHT jointed legs, four
// per side, with fangs + an eye cluster at the prow. The legs are the signature:
// dark-red bent accents radiating out (front pairs snap forward on a jab, rear
// pairs lag), drawn behind the two body plates so they emerge from under it. The
// abdomen + cephalothorax wind the same way so the far-LOD merge is a solid
// peanut; legs/fang/eyes stay accents out of the merge.
export const spiderBody = [
  { d: 'M65.7 43.8 L71.1 28.4 L87.7 21.7 L69.2 26.1 L62.2 39.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 1 },
  { d: 'M60.6 38.5 L57.1 22.6 L67.6 8.2 L54.3 21.7 L55.4 36.8 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 2 },
  { d: 'M52.6 36.8 L42.3 25.4 L40.4 8.2 L39.5 26.3 L47.4 38.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 1 },
  { d: 'M45.8 39.5 L31.1 35.3 L20.3 21.7 L29.1 37.6 L42.3 43.8 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 2 },
  { d: 'M62.2 60.5 L69.2 73.9 L87.7 78.3 L71.1 71.6 L65.7 56.2 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 2 },
  { d: 'M55.4 63.2 L54.3 78.3 L67.6 91.8 L57.1 77.4 L60.6 61.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, atk: 'jab', walk: 1 },
  { d: 'M47.4 61.5 L39.5 73.7 L40.4 91.8 L42.3 74.6 L52.6 63.2 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 2 },
  { d: 'M42.3 56.2 L29.1 62.4 L20.3 78.3 L31.1 64.7 L45.8 60.5 Z', kind: 'accent', fill: 'base', stroke: true, lean: -3, atk: 'trail', walk: 1 },
  { d: 'M46 50 C46 63 37 72 25 72 C13 72 4 63 4 50 C4 37 13 28 25 28 C37 28 46 37 46 50 Z', c: [24, 50], lean: -3 },
  { d: 'M74 50 C74 59 67 66 57 66 C47 66 40 59 40 50 C40 41 47 34 57 34 C67 34 74 41 74 50 Z', c: [57, 50], lean: 3, shadow: true, atk: 'jab' },
  { d: 'M72 47 L86 50 L72 53 Z', kind: 'accent', fill: 'outline', lean: 4, atk: 'jab' },
  { d: 'M66 46 a1.8 1.8 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4, atk: 'jab' },
  { d: 'M66 54 a1.8 1.8 0 1 0 0.1 0 Z', kind: 'accent', fill: 'text', lean: 4, atk: 'jab' },
] satisfies BodyPart[]
