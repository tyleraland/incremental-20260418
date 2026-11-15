import type { BodyPart } from '@/render/bodyTypes'

// LARVA (segmented ember grub) — the reference read is a low curled grub:
// dark little legs underneath, a tapering segmented body, and a hooked front
// plate that curls upward. The silhouette stays creature-readable in the
// far-LOD merge; the shell-band accent is packed into one multi-subpath part.
export const larvaBody = [
  { d: 'M22 61 L18 75 L23 75 L27 62 Z M47 68 L45 85 L50 85 L52 68 Z M73 59 L78 70 L82 68 L77 57 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, walk: 1 },
  { d: 'M34 66 L31 82 L36 82 L39 67 Z M61 65 L62 80 L67 80 L65 64 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, walk: 2 },
  { d: 'M15 55 C9 47 13 36 25 29 C37 22 54 23 68 31 C79 37 85 48 81 58 C76 70 58 77 40 73 C28 71 19 65 15 55 Z', c: [47, 52], lean: -2, idle: 'breathe' },
  { d: 'M25 39 C35 27 54 25 70 35 C78 40 82 49 79 57 C72 54 63 53 54 56 C42 60 31 57 22 50 C20 46 21 42 25 39 Z', c: [51, 46], shadow: true, idle: 'breathe' },
  { d: 'M62 33 C68 19 83 14 93 25 C85 24 78 30 77 39 C87 42 93 50 90 60 C83 56 74 52 66 56 C59 51 57 40 62 33 Z', c: [76, 38], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M28 38 C35 42 38 50 35 58 L30 59 C33 49 31 42 24 40 Z M43 31 C50 38 53 49 50 62 L45 63 C48 50 45 40 38 34 Z M59 32 C66 40 68 50 64 63 L59 63 C63 51 61 42 54 35 Z M72 40 C79 47 80 55 75 63 L71 61 C75 53 74 47 68 42 Z', kind: 'accent', fill: 'base', stroke: true },
  { d: 'M26 31 L35 27 L41 31 L31 35 Z M45 27 L54 28 L58 33 L47 33 Z M65 30 L73 35 L74 40 L64 36 Z M74 21 L82 19 L86 23 L77 25 Z', kind: 'accent', fill: 'cream' },
  { d: 'M85 30 L98 25 L89 36 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
