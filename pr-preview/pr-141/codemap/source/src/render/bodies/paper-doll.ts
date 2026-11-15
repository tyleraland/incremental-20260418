import type { BodyPart } from '@/render/bodyTypes'

// Minimal paper translation of reference/paper-assets/humanoid-template.svg.
// Keeps the template's rig-friendly groups. Skin circles use same-color strokes,
// so overlaps do not draw black seams.
export const paperDollBody = [
  { d: 'M20 35 L80 35 L60 72.5 L40 72.5 Z', c: [50, 54], idle: 'breathe' },
  { d: 'M43 73 L36.5 90 L42.5 93 L47.5 74 Z', kind: 'accent', fill: 'cream', stroke: 'fill', lean: -3, walk: 1 },
  { d: 'M57 73 L63.5 90 L57.5 93 L52.5 74 Z', kind: 'accent', fill: 'cream', stroke: 'fill', lean: -3, walk: 2 },
  { d: 'M39 74 C39 69 61 69 61 74 C61 79 39 79 39 74 Z', kind: 'accent', fill: 'rock', stroke: 'fill' },
  { d: 'M22 36 C14 39 10 49 15 58 C20 64 28 60 29 50 C30 42 28 37 22 36 Z M12 58 C7 64 6 73 9 79 C13 83 17 77 17 69 C17 62 15 58 12 58 Z M7 76 C1 80 1 88 7 91 C13 91 16 85 14 79 C12 76 9 75 7 76 Z', kind: 'accent', fill: 'cream', stroke: 'fill', lean: -3, walk: 1, atk: 'swingDown' },
  { d: 'M78 36 C86 39 90 49 85 58 C80 64 72 60 71 50 C70 42 72 37 78 36 Z M88 58 C93 64 94 73 91 79 C87 83 83 77 83 69 C83 62 85 58 88 58 Z M93 76 C99 80 99 88 93 91 C87 91 84 85 86 79 C88 76 91 75 93 76 Z', kind: 'accent', fill: 'cream', stroke: 'fill', lean: 3, walk: 2 },
  { d: 'M27.5 20 C27.5 0 72.5 0 72.5 20 C72.5 35 62.5 42.5 50 42.5 C37.5 42.5 27.5 35 27.5 20 Z', kind: 'accent', fill: 'cream', stroke: 'fill', lean: 2 },
  { d: 'M42.5 27.5 a2 2 0 1 0 0.1 0 Z M57.5 27.5 a2 2 0 1 0 0.1 0 Z', kind: 'accent', fill: 'outline', lean: 2, hit: 'hide' },
  { d: 'M39 25 L46 29 L39 33 Z M61 25 L54 29 L61 33 Z', kind: 'accent', fill: 'outline', lean: 2, hit: 'show' },
] satisfies BodyPart[]
