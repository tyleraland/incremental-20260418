import type { BodyPart } from '@/render/bodyTypes'

// THIEF BUG (a scuttling roach) — the reference read is a LOW two-lobe
// carapace (a big oval abdomen behind a smaller head-shield) trailing two very
// LONG antennae swept back over the body, six splayed legs, and small pincer
// mandibles at the prow. The antennae are the signature. The six legs ship as
// TWO tripod-gait accents (three legs per path, opposite walk phases — half
// the spider's leg nodes). First body on the `data-idle` seam: the abdomen
// BREATHES (scale pulse; the wing seam rides it) and the antennae SWAY while
// the bug rests; the head-shield + mandibles snap forward on a jab and the
// antennae whip back. Abdomen + head-shield wind the same way so the far-LOD
// merge is a solid two-lobe bug; legs/antennae/seam/mandibles stay accents.
export const thiefBugBody = [
  { d: 'M58 40 L66 26 L79 17 L63 27 L54 38 Z M45 62 L45 76 L54 88 L42 78 L40 61 Z M31 40 L21 29 L8 24 L19 32 L27 42 Z', kind: 'accent', fill: 'base', stroke: true, walk: 1 },
  { d: 'M58 60 L66 74 L79 83 L63 73 L54 62 Z M45 38 L45 24 L54 12 L42 22 L40 39 Z M31 60 L21 71 L8 76 L19 68 L27 58 Z', kind: 'accent', fill: 'base', stroke: true, walk: 2 },
  // both antennae in ONE two-subpath accent: the sway rotation pivots on their
  // shared center, so they scissor open/closed — and it's one compositor layer
  // instead of two (the idle budget is per-part, not per-path).
  { d: 'M82 41 C64 19 38 8 13 5 C7 5 7 11 13 13 C36 17 58 27 76 46 Z M82 59 C64 81 38 92 13 95 C7 95 7 89 13 87 C36 83 58 73 76 54 Z', kind: 'accent', fill: 'base', stroke: true, lean: -5, atk: 'trail', idle: 'sway' },
  { d: 'M68 50 C68 65 55 75 35 75 C16 75 4 64 4 50 C4 36 16 25 35 25 C55 25 68 35 68 50 Z', c: [36, 50], lean: -2, idle: 'breathe' },
  { d: 'M66 50 L8 48.8 L8 51.2 L66 51 Z', kind: 'accent', fill: 'outline', lean: -2, idle: 'breathe' },
  { d: 'M92 50 C92 58 85 64 76 64 C67 64 61 58 61 50 C61 42 67 36 76 36 C85 36 92 42 92 50 Z', c: [76, 50], lean: 4, shadow: true, atk: 'jab' },
  { d: 'M90 45 L102 40 L96 49 Z M90 55 L102 60 L96 51 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
