import type { BodyPart } from '@/render/bodyTypes'

// WOLF (canines: wolves, hounds, foxes) — the reference read is a SPIKY MANE
// ruff behind a snarling eared head, over a tapered torso with a bushy tail.
// Five stacked cutouts back→front: tail plume (lags on the move) · torso with
// leg bumps · jagged mane ruff · eared head (leads) · a nose accent.
export const canineBody = [
  { d: 'M31 50 C25 40 15 35 7 37 C-1 39 0 47 7 49 C-1 51 0 60 8 62 C16 64 26 60 31 50 Z', c: [15, 50], lean: -8, atk: 'trail' },
  { d: 'M64 50 C64 41 58 34 49 33 C47 26 41 26 39 33 C34 33 29 36 26 41 C23 43 21 47 22 50 C21 53 23 57 26 59 C29 64 34 67 39 67 C41 74 47 74 49 67 C58 66 64 59 64 50 Z', c: [42, 50] },
  { d: 'M78 50 L67 45 L73 34 L61 40 L60 27 L52 39 L45 31 L45 43 L34 41 L43 50 L34 59 L45 57 L45 69 L52 61 L60 73 L61 60 L73 66 L67 55 L78 50 Z', c: [55, 50], lean: 1 },
  { d: 'M95 50 C95 46 91 43 86 43 C81 38 75 36 68 37 L64 26 L60 37 C55 40 53 45 53 50 C53 55 55 60 60 63 L64 74 L68 63 C75 64 81 62 86 57 C91 57 95 54 95 50 Z', c: [72, 50], lean: 5, shadow: true, atk: 'jab' },
  { d: 'M89 46 L98 50 L89 54 Z', kind: 'accent', fill: 'outline', lean: 5, atk: 'jab' },
] satisfies BodyPart[]
