// Procedural map generation — public API. Design guide: src/mapgen/CLAUDE.md;
// idea inventory: procedural-generation-ideas.md (repo root).
//
// Pure, deterministic, leaf library (like src/engine): imports no store, no
// render, no game state, no time. Consumers pull specs through here; the only
// cross-boundary file is adapter.ts (type-only engine import).

export * from './types'
export { generateMap, type PassCtx, type PassDef, type RecipeDef } from './pipeline'
export { validate } from './validate'
export { normalizeParams, type NormParams } from './draft'
export { makeFields, fbm, valueNoise, type Field, type FieldBundle } from './fields'
export { hashString, hash01, makeRng, streamRng, type Rng } from './rng'
export { RECIPE_REGISTRY } from './recipes'
export { bfsDepth, deriveRegions, digestIntensity, flowField, nodeDegrees, type DerivedRegions, type DeriveRegionsOpts, type FlowField, type GraphEdgeLike } from './graph'
export { GATE_LOOKS, GATE_TAGS, placeProficiencyLock, type GateLook, type ProficiencyLockSite } from './gates'
export { premisePass } from './naming'
export { STAMP_REGISTRY, placeStamp, stampBarrierCost, type StampDef } from './stamps'
export { tacticalProfile } from './profile'
export { specBarriers, intensityAt, generateForLocation, generateForLocationCached, type MapGenSource, type MapGenOpts } from './adapter'
