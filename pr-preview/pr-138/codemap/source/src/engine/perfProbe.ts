// Opt-in, observational counters for the current engine round. Kept outside
// BattleState so enabling the probe cannot affect snapshots or replay output.
export const ENGINE_PERF_PROBE = {
  enabled: false,
  round: 0,
  decisionRound: false,
  targetEvaluations: 0,
  visibleEnemyQueries: 0,
  visionCacheHits: 0,
  spatialNearQueries: 0,
  spatialCandidates: 0,
}

export function beginEnginePerfRound(round: number, decisionRound: boolean): void {
  if (!ENGINE_PERF_PROBE.enabled) return
  ENGINE_PERF_PROBE.round = round
  ENGINE_PERF_PROBE.decisionRound = decisionRound
  ENGINE_PERF_PROBE.targetEvaluations = 0
  ENGINE_PERF_PROBE.visibleEnemyQueries = 0
  ENGINE_PERF_PROBE.visionCacheHits = 0
  ENGINE_PERF_PROBE.spatialNearQueries = 0
  ENGINE_PERF_PROBE.spatialCandidates = 0
}
