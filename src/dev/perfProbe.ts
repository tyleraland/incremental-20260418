// On-device battlefield perf probe (THROWAWAY / dev tool).
//
// The Playwright harness (e2e/many-entities.spec.ts) measures engine-vs-render on a
// 4× CPU-throttled DESKTOP — useful, but it can't tell you what YOUR phone spends
// time on. This singleton samples the live app on the actual device so we can copy
// a report into a gist and see whether a laggy crowded battle is the engine's "AI"
// decision-making, the per-round React render, or raw frame/paint cost.
//
// Sources it stitches together:
//   • ENGINE   — src/engine/profile.ts accumulates per-phase ms inside advanceRound
//                (plan / decide / move / act / zoneApply / outcome / round total).
//   • RENDER   — a React <Profiler> around the battle subtree feeds commit durations.
//   • FRAMES   — a rAF loop measures sustained fps + worst frame; PerformanceObserver
//                tallies long-tasks (the on-device smoothness signal).
//   • SCENE    — live entity/token/DOM counts pulled from the store + DOM.
//
// Gated behind `?probe=1` (or DEV) by the caller, so normal production pays nothing.

import { useGameStore } from '@/stores/useGameStore'
import {
  setEngineProfiling,
  resetEngineProfile,
  readEngineProfile,
  type EngineProfile,
} from '@/engine/profile'

const JANK_FRAME_MS = 50   // a frame longer than this reads as a visible hitch (~< 20fps)

export interface ProbeLive {
  running: boolean
  elapsedMs: number
  fps: number          // sustained over the run
  worstFrameMs: number
  jankFrames: number
  commits: number
  renderMsAvg: number
  rounds: number
  roundMsAvg: number   // avg advanceRound wall time
  tokens: number       // on-screen battle tokens
}

type Listener = () => void

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

function countTokens(): number {
  if (typeof document === 'undefined') return 0
  return document.querySelectorAll('[data-cid]').length
}

function countArenaNodes(): number {
  if (typeof document === 'undefined') return 0
  const arena = document.querySelector('.aspect-square')
  return arena ? arena.querySelectorAll('*').length : 0
}

class PerfProbe {
  running = false
  private startedAt = 0
  private lastWindowMs = 0   // frozen elapsed window, kept after stop so fps still reads
  private rafId: number | null = null
  private longTaskObs: PerformanceObserver | null = null

  // frame sampling
  private lastFrameTs = 0
  private frames = 0
  private worstFrameMs = 0
  private jankFrames = 0

  // long tasks
  private longTaskMs = 0
  private longTaskCount = 0

  // react commits (battle subtree)
  private commits = 0
  private renderMsTotal = 0
  private worstCommitMs = 0

  // peak scene seen during the run
  private peakTokens = 0
  private peakArenaNodes = 0

  private listeners = new Set<Listener>()
  private liveTimer: ReturnType<typeof setInterval> | null = null

  // Cached snapshot: `useSyncExternalStore` requires getSnapshot to return a
  // referentially-stable value between notifications, so we recompute ONLY on emit
  // (returning a fresh object every call would loop the panel). Seeded lazily.
  private liveCache: ProbeLive | null = null

  // ── subscription (for useSyncExternalStore in the panel) ──────────────────────
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  private emit() {
    this.liveCache = this.computeLive()
    for (const fn of this.listeners) fn()
  }

  private computeLive(): ProbeLive {
    const elapsedMs = this.running ? nowMs() - this.startedAt : this.lastWindowMs
    const secs = elapsedMs / 1000
    const eng = readEngineProfile()
    return {
      running: this.running,
      elapsedMs,
      fps: secs > 0 ? this.frames / secs : 0,
      worstFrameMs: this.worstFrameMs,
      jankFrames: this.jankFrames,
      commits: this.commits,
      renderMsAvg: this.commits > 0 ? this.renderMsTotal / this.commits : 0,
      rounds: eng.rounds,
      roundMsAvg: eng.rounds > 0 ? (eng.totalsMs.round ?? 0) / eng.rounds : 0,
      tokens: countTokens(),
    }
  }

  getLive = (): ProbeLive => (this.liveCache ??= this.computeLive())

  // ── lifecycle ─────────────────────────────────────────────────────────────────
  start = () => {
    if (this.running) return
    this.reset(true)
    this.running = true
    this.startedAt = nowMs()
    this.lastFrameTs = this.startedAt
    setEngineProfiling(true)
    resetEngineProfile()
    this.installFrameLoop()
    this.installLongTaskObserver()
    // Refresh the live panel a few times a second without coupling it to frames.
    this.liveTimer = setInterval(() => this.emit(), 400)
    this.emit()
  }

  stop = () => {
    if (!this.running) return
    this.lastWindowMs = nowMs() - this.startedAt
    this.running = false
    setEngineProfiling(false)
    if (this.rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.rafId)
    this.rafId = null
    this.longTaskObs?.disconnect()
    this.longTaskObs = null
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    this.emit()
  }

  toggle = () => { this.running ? this.stop() : this.start() }

  reset = (silent = false) => {
    this.frames = 0
    this.worstFrameMs = 0
    this.jankFrames = 0
    this.longTaskMs = 0
    this.longTaskCount = 0
    this.commits = 0
    this.renderMsTotal = 0
    this.worstCommitMs = 0
    this.peakTokens = 0
    this.peakArenaNodes = 0
    this.startedAt = nowMs()
    this.lastWindowMs = 0
    resetEngineProfile()
    if (!silent) this.emit()
  }

  // ── React <Profiler> callback (battle subtree) ──────────────────────────────────
  onRender = (
    _id: string,
    _phase: 'mount' | 'update' | 'nested-update',
    actualDuration: number,
  ) => {
    if (!this.running) return
    this.commits++
    this.renderMsTotal += actualDuration
    if (actualDuration > this.worstCommitMs) this.worstCommitMs = actualDuration
  }

  private installFrameLoop() {
    if (typeof requestAnimationFrame !== 'function') return
    const tick = () => {
      const t = nowMs()
      const dt = t - this.lastFrameTs
      this.lastFrameTs = t
      this.frames++
      if (dt > this.worstFrameMs) this.worstFrameMs = dt
      if (dt > JANK_FRAME_MS) this.jankFrames++
      const tokens = countTokens()
      if (tokens > this.peakTokens) this.peakTokens = tokens
      const nodes = countArenaNodes()
      if (nodes > this.peakArenaNodes) this.peakArenaNodes = nodes
      if (this.running) this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private installLongTaskObserver() {
    if (typeof PerformanceObserver !== 'function') return
    try {
      this.longTaskObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { this.longTaskMs += e.duration; this.longTaskCount++ }
      })
      this.longTaskObs.observe({ entryTypes: ['longtask'] })
    } catch { /* longtask entry type unsupported (Safari/iOS) — fps + worst-frame still tell the story */ }
  }

  // ── report ──────────────────────────────────────────────────────────────────────
  private deviceInfo() {
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator)
    const w = typeof window !== 'undefined' ? window : ({} as Window)
    return {
      userAgent: (nav as Navigator).userAgent ?? 'n/a',
      hardwareConcurrency: (nav as Navigator).hardwareConcurrency ?? null,
      deviceMemoryGB: (nav as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      devicePixelRatio: (w as Window).devicePixelRatio ?? null,
      viewport: typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : null,
      url: typeof location !== 'undefined' ? location.href : 'n/a',
    }
  }

  private sceneInfo() {
    const s = useGameStore.getState()
    const locId = s.combatLocationId ?? null
    const battle = locId ? s.battles[locId] : undefined
    const combatants = battle?.combatants ?? []
    return {
      combatLocationId: locId,
      mapMode: s.mapMode,
      round: battle?.round ?? null,
      mode: battle?.mode ?? null,
      timeScale: battle?.timeScale ?? null,
      cols: battle?.cols ?? null,
      rows: battle?.rows ?? null,
      combatants: combatants.length,
      alive: combatants.filter((c) => c.alive).length,
      heroes: combatants.filter((c) => c.team === 'player').length,
      enemies: combatants.filter((c) => c.team === 'enemy').length,
      tokensOnScreen: countTokens(),
      peakTokensOnScreen: this.peakTokens,
      arenaDomNodes: countArenaNodes(),
      peakArenaDomNodes: this.peakArenaNodes,
    }
  }

  buildReport(): { text: string; json: unknown } {
    const live = this.getLive()
    const eng: EngineProfile = readEngineProfile()
    const elapsedMs = live.elapsedMs || (nowMs() - this.startedAt)
    const secs = Math.max(0.001, elapsedMs / 1000)

    // Engine phase table: total ms, % of round time, ms per round, calls.
    const roundTotal = eng.totalsMs.round ?? 0
    const PHASES = ['plan', 'decide', 'move', 'act', 'zoneApply', 'outcome', 'turns', 'round']
    const phaseRows = PHASES.filter((p) => eng.totalsMs[p] != null).map((p) => {
      const ms = eng.totalsMs[p] ?? 0
      const calls = eng.counts[p] ?? 0
      const pct = roundTotal > 0 ? (ms / roundTotal) * 100 : 0
      const perRound = eng.rounds > 0 ? ms / eng.rounds : 0
      return { phase: p, totalMs: +ms.toFixed(1), pctOfRound: +pct.toFixed(1), msPerRound: +perRound.toFixed(2), calls }
    })

    const render = {
      commits: this.commits,
      commitsPerSec: +(this.commits / secs).toFixed(1),
      avgCommitMs: +(this.commits > 0 ? this.renderMsTotal / this.commits : 0).toFixed(2),
      worstCommitMs: +this.worstCommitMs.toFixed(1),
      totalRenderMs: +this.renderMsTotal.toFixed(0),
      pctOfWallClock: +((this.renderMsTotal / elapsedMs) * 100).toFixed(1),
    }
    const frames = {
      sampledFrames: this.frames,
      fps: +live.fps.toFixed(1),
      worstFrameMs: +this.worstFrameMs.toFixed(1),
      jankFrames: this.jankFrames,
      jankPct: +((this.jankFrames / Math.max(1, this.frames)) * 100).toFixed(1),
      longTasks: this.longTaskCount,
      longTaskMs: +this.longTaskMs.toFixed(0),
    }
    const engineSummary = {
      rounds: eng.rounds,
      roundsPerSec: +(eng.rounds / secs).toFixed(2),
      avgRoundMs: +(eng.rounds > 0 ? roundTotal / eng.rounds : 0).toFixed(2),
      totalEngineMs: +roundTotal.toFixed(0),
      pctOfWallClock: +((roundTotal / elapsedMs) * 100).toFixed(1),
    }

    const json = {
      capturedAt: new Date().toISOString(),
      elapsedMs: +elapsedMs.toFixed(0),
      device: this.deviceInfo(),
      scene: this.sceneInfo(),
      frames,
      render,
      engine: engineSummary,
      enginePhases: phaseRows,
    }

    // ── human-readable text (the part you skim in the gist) ──────────────────────
    const d = json.device
    const sc = json.scene
    const L: string[] = []
    L.push('# Battlefield perf probe')
    L.push(`captured ${json.capturedAt}   window ${(elapsedMs / 1000).toFixed(1)}s`)
    L.push('')
    L.push('## Device')
    L.push(`ua: ${d.userAgent}`)
    L.push(`cores: ${d.hardwareConcurrency ?? '?'}   mem: ${d.deviceMemoryGB ?? '?'}GB   dpr: ${d.devicePixelRatio ?? '?'}   viewport: ${d.viewport ? `${d.viewport.w}×${d.viewport.h}` : '?'}`)
    L.push(`url: ${d.url}`)
    L.push('')
    L.push('## Scene')
    L.push(`location ${sc.combatLocationId ?? '—'}  mode ${sc.mode ?? '—'}  grid ${sc.cols ?? '?'}×${sc.rows ?? '?'}  timeScale ${sc.timeScale ?? '?'}`)
    L.push(`combatants ${sc.combatants} (alive ${sc.alive}: ${sc.heroes} heroes / ${sc.enemies} enemies)`)
    L.push(`tokens on-screen ${sc.tokensOnScreen} (peak ${sc.peakTokensOnScreen})   arena DOM nodes ${sc.arenaDomNodes} (peak ${sc.peakArenaDomNodes})`)
    L.push('')
    L.push('## Frames (the lag signal)')
    L.push(`fps ${frames.fps}   worst frame ${frames.worstFrameMs}ms   jank frames ${frames.jankFrames} (${frames.jankPct}%)   long-tasks ${frames.longTasks} (${frames.longTaskMs}ms)`)
    L.push('')
    L.push('## Render (React commit of the battle subtree)')
    L.push(`avg ${render.avgCommitMs}ms/commit   worst ${render.worstCommitMs}ms   ${render.commitsPerSec} commits/s   ${render.pctOfWallClock}% of wall clock`)
    L.push('')
    L.push('## Engine (advanceRound, main thread)')
    L.push(`${engineSummary.avgRoundMs}ms/round   ${engineSummary.roundsPerSec} rounds/s   ${engineSummary.pctOfWallClock}% of wall clock`)
    L.push('phase            total    %round   ms/round   calls')
    for (const r of phaseRows) {
      L.push(
        `  ${r.phase.padEnd(12)} ${String(r.totalMs).padStart(8)} ${String(r.pctOfRound).padStart(7)}% ${String(r.msPerRound).padStart(9)} ${String(r.calls).padStart(8)}`,
      )
    }
    L.push('  (decide = targeting/tactics "AI"; move = pathing; act = skills/attacks; turns = all three summed)')
    L.push('')
    L.push('## Raw JSON')
    L.push('```json')
    L.push(JSON.stringify(json, null, 2))
    L.push('```')

    return { text: L.join('\n'), json }
  }

  report = (): string => this.buildReport().text
}

export const perfProbe = new PerfProbe()
