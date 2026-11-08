import type { BodyPart } from '@/render/bodyTypes'

// hero/NPC: round torso, head disc riding center-front; head leads on the
// move (heading otherwise reads from the carried weapon)
export const humanoidBody = [
  { d: 'M50 6 C72 7 90 20 92 42 C94 65 74 90 50 94 C27 91 6 65 8 42 C10 20 29 8 50 6 Z', c: [50, 50] },
  { d: 'M60 34 C70 35 76 41 76 50 C76 59 69 66 59 66 C50 66 44 59 44 50 C44 41 51 33 60 34 Z', c: [60, 50], lean: 4, shadow: true },
] satisfies BodyPart[]
