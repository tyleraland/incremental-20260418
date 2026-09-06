import type { PaperRole } from '@/render/palette'

export interface BodyPart {
  d: string
  c?: [number, number]              // lit-scale origin (plates); defaults to box center
  lean?: number                     // +x shift along heading while moving (can be negative = lag)
  kind?: 'plate' | 'accent'         // default 'plate'
  fill?: 'base' | 'top' | 'outline' | 'text' | PaperRole  // accent paint (tone field or palette role)
  stroke?: boolean | 'fill'         // accent: tone outline, or same-color edge
  shadow?: boolean                  // plate: cast a flat drop shadow onto lower parts
  // melee-attack motion (CSS-driven, off the memo'd body — see `data-atk` +
  // index.css): 'jab' snaps toward the target, 'trail' lags the opposite way,
  // 'swingDown' rotates a limb toward screen 6 o'clock. Absent = hold.
  atk?: 'jab' | 'trail' | 'swingDown'
  // OPTIONAL walk cycle (CSS-driven, off the memo'd body — see `data-walk` +
  // index.css): a foot/leg/arm that shuffles a little WHILE the token is moving.
  // `1`/`2` are opposite gait phases (alternating feet step out of sync). Runs
  // only at detail LOD (the far-LOD merge has no accent parts) and only while
  // moving (the chip wrapper carries `animate-walk`). Absent = the part holds.
  walk?: 1 | 2
  // OPTIONAL hit expression/state. 'hide' is visible normally and hidden while
  // the chip recoils; 'show' is hidden normally and shown only while hit.
  hit?: 'hide' | 'show'
  // OPTIONAL continuous idle (CSS-driven, off the memo'd body — see `data-idle`
  // + index.css): a RESTING token stays subtly alive. 'breathe' swells the part
  // through three poses (rest → inhale → exhale undershoot); 'sway' drifts it a
  // few degrees (antennae, fronds, tails). The chip wrapper carries
  // `animate-idle` ONLY while the token is at detail LOD, alive, still and not
  // casting (BattleChip), with per-token phase/tempo vars seeded off the unit
  // id — so a nest never pulses in lockstep and a dense far-LOD mob (merged,
  // no data-idle nodes) animates nothing. Keep idle parts to 1–3 per body:
  // each holds a compositor layer promoted for the token's whole resting life.
  idle?: 'breathe' | 'sway'
}
