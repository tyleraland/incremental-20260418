import type { BodyPart } from '@/render/bodyTypes'

export const dragonWyrmling: BodyPart[] = [
  // Using the guide's layer order
  // Layer 2: Back Legs (placeholder, as they are mostly hidden)
  { d: 'M35 55 L30 60 L40 60 Z', kind: 'accent', fill: 'base', stroke: true, lean: -2, walk: 1 },

  // Layer 3: The Tail (long, tapering triangle following an S-curve)
  { d: 'M40 50 C20 60 10 60 5 50 C10 40 20 40 40 50 Z', c: [22, 50], lean: -10, atk: 'trail', idle: 'sway' },

  // Layer 4: Wing Webbing (Membrane) - Left
  { d: 'M50 45 C30 15 20 20 40 45 Z', c: [35, 30], shadow: true, lean: 2, idle: 'sway' },
  // Layer 4: Wing Webbing (Membrane) - Right
  { d: 'M50 55 C30 85 20 80 40 55 Z', c: [35, 70], shadow: true, lean: 2, idle: 'sway' },

  // Layer 5: Wing Bones & Front Legs - Left
  { d: 'M55 45 C45 20 35 20 45 45 Z', kind: 'accent', fill: 'outline', stroke: true, lean: 2, idle: 'sway' }, // humerus + fingers
  { d: 'M58 50 C55 55 52 55 53 50 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, walk: 2 }, // front leg

  // Layer 5: Wing Bones & Front Legs - Right
  { d: 'M55 55 C45 80 35 80 45 55 Z', kind: 'accent', fill: 'outline', stroke: true, lean: 2, idle: 'sway' }, // humerus + fingers
  { d: 'M58 50 C55 45 52 45 53 50 Z', kind: 'accent', fill: 'base', stroke: true, lean: 2, walk: 2 }, // front leg

  // Layer 6: The Main Torso (elongated diamond/peanut shape)
  { d: 'M80 50 C70 30 40 30 40 50 C40 70 70 70 80 50 Z', c: [60, 50], idle: 'breathe' },

  // Layer 7: The Head & Horns
  { d: 'M85 50 C95 40 105 40 100 50 C105 60 95 60 85 50 Z', c: [92, 50], lean: 6, shadow: true, atk: 'jab' }, // Head
  { d: 'M90 40 C85 35 80 35 85 40 Z', kind: 'accent', fill: 'outline', stroke: true, lean: 6 }, // Left Horn
  { d: 'M90 60 C85 65 80 65 85 60 Z', kind: 'accent', fill: 'outline', stroke: true, lean: 6 }, // Right Horn

  // Layer 8: Dorsal Plates/Spines (overlapping hexagons)
  { d: 'M75 50 L72 45 L75 40 L78 45 Z', kind: 'accent', fill: 'top', stroke: true },
  { d: 'M68 50 L65 45 L68 40 L71 45 Z', kind: 'accent', fill: 'top', stroke: true },
  { d: 'M61 50 L58 45 L61 40 L64 45 Z', kind: 'accent', fill: 'top', stroke: true },
];
