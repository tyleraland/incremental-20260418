import type { BodyPart } from '@/render/bodyTypes'

// generic quadruped: fat torso oval, smaller blunt eared head — boars,
// crabs, lizards
export const beastBody = [
  { d: 'M60 32 C48 26 34 26 24 32 C13 38 8 44 8 50 C8 56 13 62 24 68 C34 74 48 74 60 68 C67 63 70 57 70 50 C70 43 67 37 60 32 Z', c: [39, 50] },
  { d: 'M90 50 C90 44 86 39 79 37 C73 33 67 32 62 33 L56 23 L50 32 C45 34 42 41 42 50 C42 59 45 66 50 68 L56 77 L62 67 C67 68 73 67 79 63 C86 61 90 56 90 50 Z', c: [64, 50], lean: 5, shadow: true },
] satisfies BodyPart[]
