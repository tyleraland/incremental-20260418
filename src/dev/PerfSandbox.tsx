// Dev-only Battle Sandbox (`?sandbox=1`): an interactive perf/density + replay rig.
// Two sources feed the same live field:
//   • Compose — pick a hero count, an exact monster mix (any type, ±), a real map
//     (its terrain + size) or a custom square. A manual way to dial in "how many
//     tokens on which map" and watch fps + behaviour.
//   • BSNAP — paste a snapshot token (the ⎘-state button in a battle copies one;
//     `npm run bsnap` replays it headlessly) and watch it back LIVE, play/pause,
//     with the full camera / inspect / minimap. Same deterministic advance as the
//     headless tool — one engine round per tick.
// Built on the same real BattleView + engine + store the game uses, so what you
// observe is what ships. NEVER touches the save: App.tsx skips load/autosave/
// catch-up when `?sandbox=1` is set (same gate as `?perf`), and this page owns its
// own fixed-cadence tick loop. Reachable in sandbox mode (or a DEV build) from the
// ☰ Menu → Developer. Sibling of the deterministic `?perf` scene (perfSeed.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore, spawnMonsterAt, monsterIdOf, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { isDraftMonster, setDraftMonster } from '@/data/monsterOverrides'
import { BattleView } from '@/components/BattleView'
import { advanceRound, type Combatant, type Vec2 } from '@/engine'
import { TICKS_PER_SECOND } from '@/lib/time'
import { seedSimBattle, loadBsnapScene, scatterPos } from './simBattle'

type SandboxSource = 'compose' | 'bsnap'

const SANDBOX_LOC = 'perf-sandbox'

const initialMonsterId = () => {
  const requested = new URLSearchParams(window.location.search).get('monster')
  return requested && MONSTER_REGISTRY[requested] ? requested : 'slime'
}

export default function PerfSandbox() {
  const [heroes, setHeroes] = useState(4)
  const [comp, setComp] = useState<Record<string, number>>(() => ({ [initialMonsterId()]: 1 }))
  const [picker, setPicker] = useState(() => initialMonsterId())
  const [mapId, setMapId] = useState('custom')     // 'custom' | a real open-world location id
  const [customSize, setCustomSize] = useState(60)
  const [panelOpen, setPanelOpen] = useState(true)
  const [monsterRev, setMonsterRev] = useState(0)
  // Grab-and-place mode: drag a token on the field to a spot (sandbox only).
  const [repositionMode, setRepositionMode] = useState(false)
  // Monsters offered in the "add" picker, cheapest (lowest level) first.
  // Recompute when a local draft is renamed so the label updates in-place.
  const monsters = useMemo(
    () => Object.values(MONSTER_REGISTRY).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [monsterRev],
  )

  // Scene source: composed density scene vs a pasted BSNAP replay.
  const [source, setSource] = useState<SandboxSource>('compose')
  const [bsnapText, setBsnapText] = useState('')
  const [bsnapStatus, setBsnapStatus] = useState<string | null>(null)
  // Perf-test lever: freeze "normal play" (the full store tick — world clock,
  // spawns/trickle, per-unit regen/KO/pack reconcile) and advance ONLY the battle
  // under test. Tokens keep moving (the render load a perf test measures) while the
  // heavy store orchestration the probe flags as the dominant Script cost is off,
  // and the roster is held (no respawns) for a steady, reproducible load.
  const [pauseNormalPlay, setPauseNormalPlay] = useState(false)
  // The tick loop is installed once (mount) but must read the CURRENT source +
  // freeze flag each tick — refs keep it live without re-installing the interval.
  const sourceRef = useRef(source)
  sourceRef.current = source
  const engineOnlyRef = useRef(false)
  // BSNAP replay is engine-only by construction; Compose honours the freeze toggle.
  engineOnlyRef.current = source === 'bsnap' || pauseNormalPlay

  // The sandbox is primarily a visual/perf surface for the live battle renderer:
  // show authored paper assets by default even if an older localStorage toggle
  // still says circle. Keep `?skin=circle` as the explicit debug override.
  useEffect(() => {
    const explicitSkin = new URLSearchParams(window.location.search).get('skin')
    if (explicitSkin === 'circle' || explicitSkin === 'paper') return
    useGameStore.getState().setBattleSkin('paper')
  }, [])

  const paused = useGameStore((s) => s.paused)
  // Real open-world maps for the dropdown, captured once (before the sandbox loc
  // is injected). Cities included — they carry their own inked terrain.
  const realMaps = useMemo(
    () => useGameStore.getState().locations.filter((l) => l.openWorld && l.id !== SANDBOX_LOC),
    [],
  )
  // Live counts straight off the battle, for feedback.
  const live = useGameStore((s) => {
    const b = s.battles[SANDBOX_LOC]
    if (!b) return { heroes: 0, foes: 0, round: 0 }
    return {
      heroes: b.combatants.filter((c) => c.team === 'player' && c.alive).length,
      foes: b.combatants.filter((c) => c.team === 'enemy' && c.alive).length,
      round: b.round,
    }
  })

  // Latest composition, read by rebuild WITHOUT making it a rebuild trigger — so a
  // monster count edit (which spawns/removes additively, below) never tears the
  // scene down. A structural change (heroes/map/size) or the Rebuild button re-seeds
  // from this current tally.
  const compRef = useRef(comp)
  compRef.current = comp

  // Tear down and re-seed the whole scene from the current controls. Stands the
  // battle up EMPTY (cap 0) then spawns the exact composition, so per-type counts
  // are honoured; then bumps the cap to the total so the store's trickle refills
  // kills back to that density. Cheap — do it on any STRUCTURAL change (start
  // paused, so composing never fights live motion). Monster counts change
  // additively (addToField/removeFromField) and don't route through here.
  const rebuild = useCallback(() => {
    const base = mapId === 'custom' ? null : realMaps.find((l) => l.id === mapId) ?? null

    // Fully-kitted heroes (blank recruits carry no class/skills, so the engine would
    // only do basic-attack work) — clone the starters, cycling through the classes.
    const templates = INITIAL_UNITS.filter((u) => u.class)
    const roster: Unit[] = []
    for (let i = 0; i < heroes; i++) {
      const tpl = templates[i % templates.length]
      roster.push({ ...structuredClone(tpl), id: `sbx-hero-${i}`, name: `${tpl.name.split(' ')[0]} ${i + 1}` })
    }

    seedSimBattle({
      locationId: SANDBOX_LOC,
      roster,
      monsters: Object.entries(compRef.current).map(([id, count]) => ({ id, count })),
      base,
      customSize,
    })
  }, [heroes, mapId, customSize, realMaps])

  // Load the pasted BSNAP as the watched battle. Pauses so the user hits ▶ Play.
  const loadBsnap = useCallback(() => {
    try {
      const b = loadBsnapScene(SANDBOX_LOC, bsnapText)
      setSource('bsnap')
      useGameStore.setState({ paused: true })
      setBsnapStatus(`Loaded — round ${b.round} · ${b.combatants.length} combatants · ${b.mode} · ${b.cols}×${b.rows}`)
    } catch (e) {
      setBsnapStatus(e instanceof Error ? e.message : 'Could not read that snapshot')
    }
  }, [bsnapText])

  // Start paused so the scene stands at rest; own the tick loop (App.tsx's is
  // disabled under ?sandbox). One step per interval, honouring pause. Engine-only
  // (BSNAP replay, or Compose with "pause normal play") advances just the watched
  // battle's rounds directly, bypassing the store's world clock + open-world spawn/
  // reconcile machinery; a full Compose tick drives spawns + trickle + per-unit
  // systems (the "normal play" a perf test may want frozen).
  useEffect(() => {
    useGameStore.setState({ paused: true })
    const id = setInterval(() => {
      const s = useGameStore.getState()
      if (s.paused) return
      if (engineOnlyRef.current) {
        const b = s.battles[SANDBOX_LOC]
        if (b && b.outcome === 'ongoing') {
          advanceRound(b)   // mutates in place; sets its own arena/timescale ambient
          useGameStore.setState({ battles: { ...s.battles, [SANDBOX_LOC]: { ...b } } })
        }
      } else {
        s.tick()
      }
    }, 1000 / TICKS_PER_SECOND)
    return () => clearInterval(id)
  }, [])

  // Re-seed whenever a STRUCTURAL Compose control changes — heroes / map / size
  // (and once on mount). Monster count edits are additive and NOT in `rebuild`'s
  // deps, so they never reach here. Skipped in BSNAP mode so tweaking a control
  // never clobbers a loaded replay.
  useEffect(() => { if (source === 'compose') rebuild() }, [rebuild, source])

  const bump = (id: string, d: number) =>
    setComp((c) => {
      const n = Math.max(0, (c[id] ?? 0) + d)
      const next = { ...c }
      if (n === 0) delete next[id]
      else next[id] = n
      return next
    })

  // Additively spawn n monsters of `id` INTO the live battle (no teardown/reseed),
  // and keep the comp tally + openWorldCap in step so the trickle refills to the new
  // density and a later structural rebuild reproduces it. Falls back to a tally-only
  // bump if no field is up yet (the seed effect will place them).
  const addToField = (id: string, n: number) => {
    const s = useGameStore.getState()
    const battle = s.battles[SANDBOX_LOC]
    if (!battle) { bump(id, n); return }
    for (let k = 0; k < n; k++) spawnMonsterAt(battle, id, scatterPos(battle.cols, battle.barriers))
    useGameStore.setState((st) => ({
      locations: st.locations.map((l) => (l.id === SANDBOX_LOC ? { ...l, openWorldCap: (l.openWorldCap ?? 0) + n } : l)),
      battles: { ...st.battles, [SANDBOX_LOC]: { ...battle } },
    }))
    bump(id, n)
  }

  // Remove up to n live monsters of `id` from the field (newest first), lowering the
  // cap by however many actually went so the trickle doesn't just refill them.
  const removeFromField = (id: string, n: number) => {
    const s = useGameStore.getState()
    const battle = s.battles[SANDBOX_LOC]
    if (!battle) { bump(id, -n); return }
    let left = n
    const keep: Combatant[] = []
    for (let i = battle.combatants.length - 1; i >= 0; i--) {
      const c = battle.combatants[i]
      if (left > 0 && c.team === 'enemy' && c.alive && monsterIdOf(c.id) === id) { left--; continue }
      keep.push(c)
    }
    keep.reverse()
    battle.combatants = keep
    const removed = n - left
    useGameStore.setState((st) => ({
      locations: st.locations.map((l) => (l.id === SANDBOX_LOC ? { ...l, openWorldCap: Math.max(0, (l.openWorldCap ?? 0) - removed) } : l)),
      battles: { ...st.battles, [SANDBOX_LOC]: { ...battle } },
    }))
    bump(id, -removed)
  }

  // Drop a grabbed token at a world point (instant teleport). Clears any pending walk
  // order/wander so a paused-then-played unit stays where it was placed instead of
  // marching back toward a stale goal.
  const handleReposition = useCallback((cid: string, pos: Vec2) => {
    const s = useGameStore.getState()
    const battle = s.battles[SANDBOX_LOC]
    if (!battle) return
    const c = battle.combatants.find((x) => x.id === cid)
    if (!c) return
    c.pos = { x: Math.max(0, Math.min(battle.cols, pos.x)), y: Math.max(0, Math.min(battle.rows, pos.y)) }
    c.moveOrder = null
    c.wanderTarget = null
    c.moving = false
    useGameStore.setState({ battles: { ...s.battles, [SANDBOX_LOC]: { ...battle } } })
  }, [])

  const renameDraft = (id: string, name: string) => {
    const def = MONSTER_REGISTRY[id]
    if (!def || !isDraftMonster(id)) return
    setDraftMonster({ ...structuredClone(def), name: name || 'Unnamed Monster' })
    setMonsterRev((n) => n + 1)
  }

  const totalMonsters = Object.values(comp).reduce((s, n) => s + n, 0)
  const rowBtn = 'w-7 h-7 shrink-0 flex items-center justify-center rounded-md border border-game-border text-game-text hover:bg-white/10 text-sm leading-none'
  const draftIds = Object.keys(comp).filter((id) => isDraftMonster(id) && MONSTER_REGISTRY[id])

  return (
    <div className="fixed inset-0 flex flex-col bg-game-bg text-game-text">
      {/* the real battlefield fills the screen */}
      <div className="flex-1 min-h-0 flex flex-col">
        <BattleView locationId={SANDBOX_LOC} repositionEnabled={repositionMode} onReposition={handleReposition} />
      </div>

      {/* control panel — a floating card so it overlays the field */}
      <div className="absolute top-2 right-2 z-[90] w-72 max-w-[85vw] max-h-[88vh] flex flex-col rounded-xl border border-game-border bg-game-surface/95 backdrop-blur shadow-2xl">
        <header className="shrink-0 flex items-center gap-2 px-3 h-10 border-b border-game-border">
          <span className="text-sm font-semibold">Battle Sandbox</span>
          <button onClick={() => setPanelOpen((v) => !v)} className="ml-auto text-xs text-game-text-dim hover:text-game-text">{panelOpen ? 'Hide ▲' : 'Show ▼'}</button>
        </header>

        {panelOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 text-sm">
            {/* Source: composed density scene vs a pasted BSNAP replay */}
            <div className="grid grid-cols-2 gap-1.5">
              {(['compose', 'bsnap'] as SandboxSource[]).map((src) => (
                <button
                  key={src}
                  onClick={() => setSource(src)}
                  className={['h-8 rounded-lg border text-xs font-medium capitalize', source === src ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}
                >{src === 'bsnap' ? 'BSNAP replay' : 'Compose'}</button>
              ))}
            </div>

            {/* Play / pause + reset + live readout */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => useGameStore.getState().togglePause()}
                className={['flex-1 h-9 rounded-lg border text-sm font-medium', paused ? 'border-game-green/60 bg-game-green/15 text-game-green' : 'border-game-gold/60 bg-game-gold/15 text-game-gold'].join(' ')}
              >{paused ? '▶ Play' : '⏸ Pause'}</button>
              <button
                onClick={source === 'bsnap' ? loadBsnap : rebuild}
                disabled={source === 'bsnap' && !bsnapText.trim()}
                className="h-9 px-3 rounded-lg border border-game-border text-game-text-dim hover:text-game-text text-xs disabled:opacity-40 disabled:hover:text-game-text-dim"
                title={source === 'bsnap' ? 'Reload the snapshot from its first round' : 'Re-seed the scene'}
              >{source === 'bsnap' ? '↻ Reset' : '↻ Rebuild'}</button>
            </div>
            <div className="text-[11px] text-game-text-dim tabular-nums">
              live: <span className="text-blue-300">{live.heroes} heroes</span> · <span className="text-red-300">{live.foes} foes</span> · round {live.round}
            </div>

            {/* Grab-and-place: drag a token to a spot; empty-ground drags still pan.
                Pause first so a placed unit doesn't immediately walk off. */}
            <div className="space-y-1">
              <button
                onClick={() => setRepositionMode((v) => !v)}
                className={['w-full h-8 rounded-lg border text-xs font-medium', repositionMode ? 'border-game-primary bg-game-primary/15 text-game-primary' : 'border-game-border text-game-text-dim hover:text-game-text'].join(' ')}
              >{repositionMode ? '✥ Reposition: ON' : '✥ Reposition units'}</button>
              {repositionMode && (
                <div className="text-[10px] text-game-muted leading-snug">Drag a unit to move it; drag empty ground to pan. Pause to keep it put; hide this panel to reach units behind it.</div>
              )}
            </div>

            {/* Perf test: freeze normal play (advance only the battle under test) */}
            {source === 'compose' ? (
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pauseNormalPlay}
                  onChange={(e) => setPauseNormalPlay(e.target.checked)}
                  className="mt-0.5 accent-game-primary"
                />
                <span className="text-[11px] leading-snug">
                  <span className="text-game-text">Pause normal play</span>
                  <span className="block text-[10px] text-game-muted">Advance only the battle — freeze spawns, trickle, world clock &amp; per-unit systems. Isolates render for perf profiling; roster held (no respawns).</span>
                </span>
              </label>
            ) : (
              <div className="text-[10px] text-game-muted leading-snug">Normal play is always paused in BSNAP replay — only the battle advances.</div>
            )}

            {/* BSNAP replay source */}
            {source === 'bsnap' && (
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-widest text-game-muted">Snapshot token</span>
                <textarea
                  value={bsnapText}
                  onChange={(e) => setBsnapText(e.target.value)}
                  placeholder="Paste a BSNAP.<…> token — the ⎘-state button in a battle copies one."
                  spellCheck={false}
                  className="w-full h-24 text-[10px] font-mono p-2 rounded-lg border border-game-border bg-game-bg text-game-text-dim resize-none"
                />
                <button
                  onClick={loadBsnap}
                  disabled={!bsnapText.trim()}
                  className="w-full h-8 rounded-lg border border-game-border text-xs text-game-text-dim hover:text-game-text disabled:opacity-40 disabled:hover:text-game-text-dim"
                >Load snapshot</button>
                {bsnapStatus && <div className="text-[11px] text-game-accent leading-snug">{bsnapStatus}</div>}
                <p className="text-[10px] text-game-text-dim leading-snug">
                  Advances one engine round per tick — a faithful, byte-identical replay of <span className="font-mono">npm run bsnap</span>. Play/pause, follow a token, inspect. Does not touch your save.
                </p>
              </div>
            )}

            {/* Compose source — heroes / map / monsters */}
            {source === 'compose' && (<>
            {/* Heroes */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-game-muted flex-1">Heroes</span>
                <button className={rowBtn} onClick={() => setHeroes((n) => Math.max(0, n - 1))}>−</button>
                <span className="w-8 text-center tabular-nums">{heroes}</span>
                <button className={rowBtn} onClick={() => setHeroes((n) => n + 1)}>+</button>
              </div>
            </div>

            {/* Map */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-widest text-game-muted">Map</span>
              <select
                value={mapId}
                onChange={(e) => setMapId(e.target.value)}
                className="w-full h-8 rounded-md border border-game-border bg-game-bg px-2 text-xs"
              >
                <option value="custom">Custom square</option>
                {realMaps.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.openWorldSize ?? 50}²)</option>
                ))}
              </select>
              {mapId === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="range" min={20} max={200} step={2} value={customSize} onChange={(e) => setCustomSize(Number(e.target.value))} className="flex-1" />
                  <span className="w-12 text-right text-xs tabular-nums text-game-text-dim">{customSize}²</span>
                </div>
              )}
            </div>

            {/* Monsters */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-game-muted flex-1">Monsters</span>
                <span className="text-[10px] text-game-text-dim tabular-nums">{totalMonsters} total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <select value={picker} onChange={(e) => setPicker(e.target.value)} className="flex-1 h-8 rounded-md border border-game-border bg-game-bg px-2 text-xs min-w-0">
                  {monsters.map((m) => (
                    <option key={m.id} value={m.id}>Lv{m.level} · {m.name}</option>
                  ))}
                </select>
                <button className={rowBtn} onClick={() => addToField(picker, 1)} title="Add one to the field">＋</button>
              </div>
              {draftIds.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-game-primary/30 bg-game-primary/10 p-2">
                  <span className="text-[10px] uppercase tracking-widest text-game-primary">Local draft name</span>
                  {draftIds.map((id) => (
                    <label key={id} className="flex items-center gap-2">
                      <span className="w-14 truncate text-[10px] text-game-text-dim">{id}</span>
                      <input
                        value={MONSTER_REGISTRY[id]?.name ?? id}
                        onChange={(e) => renameDraft(id, e.target.value)}
                        className="min-w-0 flex-1 h-8 rounded-md border border-game-border bg-game-bg px-2 text-xs text-game-text"
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {Object.keys(comp).length === 0 && <div className="text-[11px] text-game-text-dim italic">No monsters — add some above.</div>}
                {Object.entries(comp).map(([id, n]) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs">{MONSTER_REGISTRY[id]?.name ?? id}</span>
                    <button className={rowBtn} onClick={() => removeFromField(id, 10)}>−10</button>
                    <button className={rowBtn} onClick={() => removeFromField(id, 1)}>−1</button>
                    <span className="w-8 text-center tabular-nums text-xs">{n}</span>
                    <button className={rowBtn} onClick={() => addToField(id, 1)}>+1</button>
                    <button className={rowBtn} onClick={() => addToField(id, 10)}>+10</button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-game-text-dim leading-snug border-t border-game-border/40 pt-2">
              Monster ± adds/removes on the live field (positions kept). Changing heroes, map or size re-seeds the scene. Set it up paused, then ▶ Play. Does not touch your save.
            </p>
            </>)}
          </div>
        )}
      </div>
    </div>
  )
}
