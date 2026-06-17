import { useState } from 'react'
import { useGameStore, MONSTER_REGISTRY, type Location } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'
import { useProtoStore, STORY_PATHS } from './protoStore'

const ELEMENT_DOT: Record<string, string> = {
  fire: 'bg-orange-400', lightning: 'bg-yellow-300', ice: 'bg-sky-300', earth: 'bg-amber-600',
  wind: 'bg-green-400', water: 'bg-blue-400', neutral: 'bg-game-text-dim',
}

// ── Location Detail ────────────────────────────────────────────────────────--
//
// The locale view's other half: what a single location IS and how you shape it.
// Live meters (familiarity, attunement) up top; a kittens-style upgrade economy
// where you spend "attunement" — a currency that trickles in with play time — on
// small persistent boosts (vendors, drop rate, fewer spawns…); and a branching
// story choice. Mock economy (see protoStore) but it reads like the eventual
// location-management screen.

function Meter({ label, pct, value, color }: { label: string; pct: number; value: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="uppercase tracking-wider text-game-text-dim">{label}</span>
        <span className="text-game-text tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-game-border overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

// Friendly names for the dungeon sub-regions a world location can open into.
const REGION_NAMES: Record<string, string> = { 'geffen-dungeon': 'Geffen Dungeon', aerie: 'Sky Aerie' }

export function LocationDetail({ location }: { location: Location }) {
  const units               = useGameStore((s) => s.units)
  const locations           = useGameStore((s) => s.locations)
  const locationFamiliarity = useGameStore((s) => s.locationFamiliarity)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const setMapPage          = useGameStore((s) => s.setMapPage)
  const battle              = useGameStore((s) => s.battles[location.id])
  const monsterSeen         = useGameStore((s) => s.monsterSeen)
  const assignUnits         = useGameStore((s) => s.assignUnits)
  const selectedUnitIds     = useGameStore((s) => s.selectedUnitIds)
  // Heroes in the current selection that aren't already stationed here.
  const toDeploy = units.filter((u) => selectedUnitIds.includes(u.id) && u.locationId !== location.id)

  // "Enter <Region>" — a world location can open into a dungeon map page.
  const entryRegion = location.dungeonEntryRegion
  function enterRegion() {
    if (!entryRegion) return
    const first = locations.find((l) => l.region === entryRegion)
    setMapPage(entryRegion)
    if (first) setSelectedLocation(first.id)
  }

  const storyChoice = useProtoStore((s) => s.storyChoice)
  const chooseStory = useProtoStore((s) => s.chooseStory)

  const [codexId, setCodexId] = useState<string | null>(null)

  const famPct = Math.round(((locationFamiliarity[location.id] ?? 0) / location.familiarityMax) * 100)
  const here = units.filter((u) => u.locationId === location.id)
  // Tap a hero chip to add/remove them from the current selection (so this group
  // doubles as a selection surface — you can see who's picked and adjust).
  const toggleSel = (id: string) => useGameStore.setState((s) => ({
    selectedUnitIds: s.selectedUnitIds.includes(id) ? s.selectedUnitIds.filter((x) => x !== id) : [...s.selectedUnitIds, id],
  }))

  // Foes: live count per monster type on the field now, else the location's pool.
  const liveCount: Record<string, number> = {}
  for (const c of battle?.combatants ?? []) {
    if (c.team === 'enemy' && c.alive) { const mid = c.id.split('#')[0]; liveCount[mid] = (liveCount[mid] ?? 0) + 1 }
  }
  const foeIds = (battle ? Object.keys(liveCount) : location.monsterIds).filter((id) => MONSTER_REGISTRY[id])
  const chosen = storyChoice[location.id]

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold text-game-text">{location.name}</div>
        <p className="text-xs text-game-text-dim leading-snug mt-0.5">{location.description}</p>
      </div>

      {/* enter a dungeon sub-region (its own map page) */}
      {entryRegion && (
        <button
          onClick={enterRegion}
          className="w-full flex items-center gap-2 rounded-md border border-rose-700/50 bg-rose-950/20 px-2.5 py-2 text-left hover:border-rose-600/70"
        >
          <span className="text-base">◆</span>
          <span className="text-xs text-game-text flex-1">Enter {REGION_NAMES[entryRegion] ?? entryRegion}</span>
          <span className="text-[11px] text-rose-300">descend ›</span>
        </button>
      )}

      {/* Heroes — everyone stationed here, plus any selected hero staged for a
          deploy. Color reads the two axes at a glance: present (green) ·
          selected (primary ring) · proposed-deploy (blue ghost, matching the
          blue Deploy button below). Tap a chip to add/remove from the selection. */}
      {(here.length > 0 || toDeploy.length > 0) && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Heroes</div>
          <div className="flex flex-wrap gap-1.5">
            {here.map((u) => {
              const sel = selectedUnitIds.includes(u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => toggleSel(u.id)}
                  title={sel ? 'On site · selected' : 'On site'}
                  className={[
                    'flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors',
                    sel
                      ? 'border-game-primary bg-game-primary/20 text-game-text ring-1 ring-game-primary/40'
                      : 'border-game-green/40 bg-game-green/10 text-game-text hover:border-game-green/70',
                  ].join(' ')}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-game-green shrink-0" />
                  <span className="truncate">{u.name.split(' ')[0]}</span>
                  <span className="text-game-text-dim">Lv {u.level}</span>
                </button>
              )
            })}
            {toDeploy.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleSel(u.id)}
                title={`${u.name.split(' ')[0]} is elsewhere — Deploy here to bring them in (tap to unselect)`}
                className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-dashed border-blue-400/60 bg-blue-500/10 text-blue-100 hover:border-blue-300 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <span className="truncate">{u.name.split(' ')[0]}</span>
                <span className="text-blue-300/80">Lv {u.level}</span>
              </button>
            ))}
          </div>
          {toDeploy.length > 0 && (
            <button
              onClick={() => assignUnits(toDeploy.map((u) => u.id), location.id)}
              className="mt-2 w-full text-sm font-semibold px-3 py-2 rounded-md border border-blue-400/70 bg-blue-500/25 text-blue-50 hover:bg-blue-500/40 hover:border-blue-300 transition-colors shadow-sm"
            >
              ➤ Deploy {toDeploy.length > 1 ? `${toDeploy.length} ` : ''}here
            </button>
          )}
        </div>
      )}

      {/* meters */}
      <div className="space-y-2">
        <Meter label="Familiarity" pct={famPct} value={`${famPct}%`} color="bg-game-accent" />
      </div>

      {/* site upgrades — placeholder (attunement economy scrapped for now;
          kept as a stub so the management surface still reads, see BACKLOG.md) */}
      <div className="rounded-md border border-dashed border-game-border bg-game-bg/40 px-2.5 py-2">
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-0.5">Site upgrades</div>
        <div className="text-[11px] text-game-muted">Spend a location currency on vendors / drop rate / spawns — design TBD.</div>
      </div>

      {/* story path */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Story path</div>
        <div className="space-y-1">
          {STORY_PATHS.map((p) => {
            const picked = chosen === p.id
            return (
              <button
                key={p.id}
                onClick={() => chooseStory(location.id, p.id)}
                className={['w-full text-left rounded-md border px-2.5 py-2 transition-colors',
                  picked ? 'border-game-primary/60 bg-game-primary/10' : 'border-game-border bg-game-bg hover:border-game-primary/40'].join(' ')}
              >
                <div className="flex items-center gap-1.5">
                  <span className={['w-3 h-3 rounded-full border shrink-0', picked ? 'border-game-primary bg-game-primary' : 'border-game-text-dim'].join(' ')} />
                  <span className="text-xs font-medium text-game-text">{p.name}</span>
                </div>
                {picked && <div className="text-[10px] text-game-text-dim leading-snug mt-1 pl-5">{p.blurb}</div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* inhabitants — compact chips; tap one to inspect its monster card */}
      {foeIds.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Inhabitants</div>
          <div className="flex flex-wrap gap-1.5">
            {foeIds.map((id) => {
              const m = MONSTER_REGISTRY[id]
              return (
                <button
                  key={id}
                  onClick={() => setCodexId(id)}
                  className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-game-border bg-game-bg text-game-text hover:border-game-primary/50"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ELEMENT_DOT[m.element] ?? ELEMENT_DOT.neutral}`} />
                  <span className="truncate">{m.name}</span>
                  <span className="text-game-text-dim">Lv {m.level}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <button onClick={() => setSelectedLocation(null)} className="text-[11px] text-game-text-dim hover:text-game-text">clear selection</button>

      {codexId && MONSTER_REGISTRY[codexId] && (
        <MonsterCodex monster={MONSTER_REGISTRY[codexId]} seenCount={monsterSeen[codexId] ?? 0} onClose={() => setCodexId(null)} />
      )}
    </div>
  )
}
