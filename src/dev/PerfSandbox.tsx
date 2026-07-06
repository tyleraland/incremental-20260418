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
import { useGameStore, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { BattleView } from '@/components/BattleView'
import { advanceRound } from '@/engine'
import { TICKS_PER_SECOND } from '@/lib/time'
import { seedSimBattle, loadBsnapScene } from './simBattle'

type SandboxSource = 'compose' | 'bsnap'

const SANDBOX_LOC = 'perf-sandbox'

// Monsters offered in the "add" picker, cheapest (lowest level) first.
const MONSTERS = Object.values(MONSTER_REGISTRY).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

export default function PerfSandbox() {
  const [heroes, setHeroes] = useState(4)
  const [comp, setComp] = useState<Record<string, number>>({ slime: 12 })
  const [picker, setPicker] = useState(MONSTERS[0]?.id ?? '')
  const [mapId, setMapId] = useState('custom')     // 'custom' | a real open-world location id
  const [customSize, setCustomSize] = useState(60)
  const [panelOpen, setPanelOpen] = useState(true)

  // Scene source: composed density scene vs a pasted BSNAP replay.
  const [source, setSource] = useState<SandboxSource>('compose')
  const [bsnapText, setBsnapText] = useState('')
  const [bsnapStatus, setBsnapStatus] = useState<string | null>(null)
  // The tick loop is installed once (mount) but must read the CURRENT source each
  // tick — a ref keeps it live without re-installing the interval.
  const sourceRef = useRef(source)
  sourceRef.current = source

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

  // Tear down and re-seed the whole scene from the current controls. Stands the
  // battle up EMPTY (cap 0) then spawns the exact composition, so per-type counts
  // are honoured; then bumps the cap to the total so the store's trickle refills
  // kills back to that density. Cheap — do it on any control change (start paused,
  // so composing never fights live motion).
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
      monsters: Object.entries(comp).map(([id, count]) => ({ id, count })),
      base,
      customSize,
    })
  }, [heroes, comp, mapId, customSize, realMaps])

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
  // disabled under ?sandbox). One step per interval, honouring pause. In BSNAP
  // mode we advance the snapshot's own combatants directly (a faithful replay —
  // byte-identical to `npm run bsnap`), bypassing the store's open-world spawn/
  // reconcile machinery; in Compose mode the store tick drives spawns + trickle.
  useEffect(() => {
    useGameStore.setState({ paused: true })
    const id = setInterval(() => {
      const s = useGameStore.getState()
      if (s.paused) return
      if (sourceRef.current === 'bsnap') {
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

  // Re-seed whenever a Compose control changes (and once on mount). Skipped in
  // BSNAP mode so tweaking a control never clobbers a loaded replay.
  useEffect(() => { if (source === 'compose') rebuild() }, [rebuild, source])

  const bump = (id: string, d: number) =>
    setComp((c) => {
      const n = Math.max(0, (c[id] ?? 0) + d)
      const next = { ...c }
      if (n === 0) delete next[id]
      else next[id] = n
      return next
    })

  const totalMonsters = Object.values(comp).reduce((s, n) => s + n, 0)
  const rowBtn = 'w-7 h-7 shrink-0 flex items-center justify-center rounded-md border border-game-border text-game-text hover:bg-white/10 text-sm leading-none'

  return (
    <div className="fixed inset-0 flex flex-col bg-game-bg text-game-text">
      {/* the real battlefield fills the screen */}
      <div className="flex-1 min-h-0 flex flex-col">
        <BattleView locationId={SANDBOX_LOC} />
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
                  {MONSTERS.map((m) => (
                    <option key={m.id} value={m.id}>Lv{m.level} · {m.name}</option>
                  ))}
                </select>
                <button className={rowBtn} onClick={() => bump(picker, 1)} title="Add one">＋</button>
              </div>
              <div className="space-y-1">
                {Object.keys(comp).length === 0 && <div className="text-[11px] text-game-text-dim italic">No monsters — add some above.</div>}
                {Object.entries(comp).map(([id, n]) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs">{MONSTER_REGISTRY[id]?.name ?? id}</span>
                    <button className={rowBtn} onClick={() => bump(id, -1)}>−</button>
                    <span className="w-8 text-center tabular-nums text-xs">{n}</span>
                    <button className={rowBtn} onClick={() => bump(id, 1)}>+</button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-game-text-dim leading-snug border-t border-game-border/40 pt-2">
              Composing rebuilds the scene (positions reset) — set it up paused, then ▶ Play. Does not touch your save.
            </p>
            </>)}
          </div>
        )}
      </div>
    </div>
  )
}
