// Dev-only density sandbox (`?sandbox=1`): an interactive perf/density rig. Pick
// a hero count, compose an exact monster mix (any type, ±), choose a real map (its
// terrain + size) or a custom square, and play/pause the sim — a manual way to
// dial in "how many tokens on which map" and watch fps + behaviour. Built on the
// same real BattleView + engine + store the game uses, so what you measure here is
// what ships. It NEVER touches the save: App.tsx skips load/autosave/catch-up when
// `?sandbox=1` is set (same gate as `?perf`), and this page owns its own fixed-
// cadence tick loop. Reachable in sandbox mode (or a DEV build) from the ☰ Menu →
// Developer. Sibling of the deterministic `?perf` scene (src/dev/perfSeed.ts).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGameStore, spawnMonsterAt, type Unit } from '@/stores/useGameStore'
import { INITIAL_UNITS } from '@/data/units'
import { MONSTER_REGISTRY } from '@/data/monsters'
import { BattleView } from '@/components/BattleView'
import { TICKS_PER_SECOND } from '@/lib/time'
import type { Location } from '@/types'

const SANDBOX_LOC = 'perf-sandbox'

// A random point a few cells off the edges, retried a handful of times so a
// monster never lands inside a wall — a local copy of the store's scatterPos (not
// exported), good enough for placement here.
type Rect = { x: number; y: number; w: number; h: number }
function scatterPos(size: number, barriers: Rect[]): { x: number; y: number } {
  const m = Math.min(4, size / 2 - 0.5)
  const roll = () => ({ x: m + Math.random() * (size - 2 * m), y: m + Math.random() * (size - 2 * m) })
  let p = roll()
  for (let i = 0; i < 12 && barriers.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); i++) p = roll()
  return p
}

// Monsters offered in the "add" picker, cheapest (lowest level) first.
const MONSTERS = Object.values(MONSTER_REGISTRY).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

export default function PerfSandbox() {
  const [heroes, setHeroes] = useState(4)
  const [comp, setComp] = useState<Record<string, number>>({ slime: 12 })
  const [picker, setPicker] = useState(MONSTERS[0]?.id ?? '')
  const [mapId, setMapId] = useState('custom')     // 'custom' | a real open-world location id
  const [customSize, setCustomSize] = useState(60)
  const [panelOpen, setPanelOpen] = useState(true)

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
    const store = useGameStore.getState()
    const base = mapId === 'custom' ? null : realMaps.find((l) => l.id === mapId) ?? null
    const size = base ? base.openWorldSize ?? 60 : customSize
    const present = Object.entries(comp).filter(([, n]) => n > 0)
    const total = present.reduce((s, [, n]) => s + n, 0)
    const monsterIds = present.map(([id]) => id)

    // Fully-kitted heroes (blank recruits carry no class/skills, so the engine would
    // only do basic-attack work) — clone the starters, cycling through the classes.
    const templates = INITIAL_UNITS.filter((u) => u.class)
    const roster: Unit[] = []
    for (let i = 0; i < heroes; i++) {
      const tpl = templates[i % templates.length]
      roster.push({ ...structuredClone(tpl), id: `sbx-hero-${i}`, name: `${tpl.name.split(' ')[0]} ${i + 1}` })
    }

    // Synthetic location: copy a real map's terrain/size (mapGen/scenario/traits ride
    // along on the spread) or a plain custom square. cap 0 → stand up with no scatter.
    const loc: Location = base
      ? { ...base, id: SANDBOX_LOC, openWorld: true, openWorldCap: 0, openWorldSize: size, monsterIds, connections: [], portals: [] }
      : { id: SANDBOX_LOC, name: 'Sandbox Field', region: 'world', description: 'Perf sandbox', traits: ['plains'], monsterIds, familiarityMax: 100, connections: [], openWorld: true, openWorldCap: 0, openWorldSize: size }

    useGameStore.setState((s) => ({
      units: roster,
      battles: {},
      monsterSpawnTimers: {},
      locations: [...s.locations.filter((l) => l.id !== SANDBOX_LOC), loc],
    }))
    store.assignUnits(roster.map((u) => u.id), SANDBOX_LOC)
    store.tick()   // stands up the empty open battle with the heroes fielded

    const battle = useGameStore.getState().battles[SANDBOX_LOC]
    if (battle) {
      for (const [id, n] of present) for (let k = 0; k < n; k++) spawnMonsterAt(battle, id, scatterPos(size, battle.barriers))
      useGameStore.setState((s) => ({
        // Bump the cap now the field's populated, so trickle refills to this density.
        locations: s.locations.map((l) => (l.id === SANDBOX_LOC ? { ...l, openWorldCap: total } : l)),
        battles: { ...s.battles, [SANDBOX_LOC]: battle },
      }))
    }
    store.enterBattleView(SANDBOX_LOC)   // make it the WATCHED battle (full sim, not off-screen credit)
  }, [heroes, comp, mapId, customSize, realMaps])

  // Start paused so the scene is composed at rest; own the tick loop (App.tsx's is
  // disabled under ?sandbox). One tick per interval, honouring pause.
  useEffect(() => {
    useGameStore.setState({ paused: true })
    const id = setInterval(() => {
      const s = useGameStore.getState()
      if (!s.paused) s.tick()
    }, 1000 / TICKS_PER_SECOND)
    return () => clearInterval(id)
  }, [])

  // Re-seed whenever a control changes (and once on mount).
  useEffect(() => { rebuild() }, [rebuild])

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
          <span className="text-sm font-semibold">Density Sandbox</span>
          <button onClick={() => setPanelOpen((v) => !v)} className="ml-auto text-xs text-game-text-dim hover:text-game-text">{panelOpen ? 'Hide ▲' : 'Show ▼'}</button>
        </header>

        {panelOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4 text-sm">
            {/* Play / pause + live readout */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => useGameStore.getState().togglePause()}
                className={['flex-1 h-9 rounded-lg border text-sm font-medium', paused ? 'border-game-green/60 bg-game-green/15 text-game-green' : 'border-game-gold/60 bg-game-gold/15 text-game-gold'].join(' ')}
              >{paused ? '▶ Play' : '⏸ Pause'}</button>
              <button onClick={rebuild} className="h-9 px-3 rounded-lg border border-game-border text-game-text-dim hover:text-game-text text-xs" title="Re-seed the scene">↻ Rebuild</button>
            </div>
            <div className="text-[11px] text-game-text-dim tabular-nums">
              live: <span className="text-blue-300">{live.heroes} heroes</span> · <span className="text-red-300">{live.foes} foes</span> · round {live.round}
            </div>

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
          </div>
        )}
      </div>
    </div>
  )
}
