import { humanoidBody } from '@/render/bodies/humanoid'
import { knightBody } from '@/render/bodies/knight'
import { paperDollBody } from '@/render/bodies/paper-doll'
import { blobBody } from '@/render/bodies/blob'
import { beastBody } from '@/render/bodies/beast'
import { flyerBody } from '@/render/bodies/flyer'
import { snailBody } from '@/render/bodies/snail'
import { serpentBody } from '@/render/bodies/serpent'
import { canineBody } from '@/render/bodies/canine'
import { fearrowBody } from '@/render/bodies/fearrow'
import { crampRatBody } from '@/render/bodies/cramp-rat'
import { mandragoraBody } from '@/render/bodies/mandragora'
import { spiderBody } from '@/render/bodies/spider'
import { mimicBody } from '@/render/bodies/mimic'
import { mimic2Body } from '@/render/bodies/mimic2'
import { thiefBugBody } from '@/render/bodies/thief-bug'
import { larvaBody } from '@/render/bodies/larva'
import { centipedeBody } from '@/render/bodies/centipede'
import { dragonWyrmling } from '@/render/bodies/dragon-wyrmling'
import type { BodyShape } from '@/render/appearance'
import type { BodyPart } from '@/render/bodyTypes'

export const PAPER_BODIES: Record<BodyShape, BodyPart[]> = {
  humanoid: humanoidBody,
  knight: knightBody,
  paperDoll: paperDollBody,
  blob: blobBody,
  beast: beastBody,
  flyer: flyerBody,
  snail: snailBody,
  serpent: serpentBody,
  canine: canineBody,
  fearrow: fearrowBody,
  crampRat: crampRatBody,
  mandragora: mandragoraBody,
  spider: spiderBody,
  mimic: mimicBody,
  mimic2: mimic2Body,
  thiefBug: thiefBugBody,
  larva: larvaBody,
  centipede: centipedeBody,
  dragonWyrmling: dragonWyrmling,
}
