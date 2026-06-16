import { useState } from 'react'
import { useGameStore, MONSTER_REGISTRY, type Location } from '@/stores/useGameStore'
import { MonsterCodex } from '@/components/MonsterCodex'
import {
  useProtoStore, attunementAvailable, LOCATION_UPGRADES, upgradeCost, STORY_PATHS,
} from './protoStore'

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

export function LocationDetail({ location }: { location: Location }) {
  const ticks               = useGameStore((s) => s.ticks)
  const units               = useGameStore((s) => s.units)
  const locationFamiliarity = useGameStore((s) => s.locationFamiliarity)
  const setSelectedLocation = useGameStore((s) => s.setSelectedLocation)
  const battle              = useGameStore((s) => s.battles[location.id])
  const monsterSeen         = useGameStore((s) => s.monsterSeen)

  const spent       = useProtoStore((s) => s.attunementSpent)
  const upgrades    = useProtoStore((s) => s.upgrades)
  const buyUpgrade  = useProtoStore((s) => s.buyUpgrade)
  const storyChoice = useProtoStore((s) => s.storyChoice)
  const chooseStory = useProtoStore((s) => s.chooseStory)

  const [codexId, setCodexId] = useState<string | null>(null)

  const available = attunementAvailable(ticks, spent)
  const famPct = Math.round(((locationFamiliarity[location.id] ?? 0) / location.familiarityMax) * 100)
  const here = units.filter((u) => u.locationId === location.id)

  // Foes: live count per monster type on the field now, else the location's pool.
  const liveCount: Record<string, number> = {}
  for (const c of battle?.combatants ?? []) {
    if (c.team === 'enemy' && c.alive) { const mid = c.id.split('#')[0]; liveCount[mid] = (liveCount[mid] ?? 0) + 1 }
  }
  const foeIds = (battle ? Object.keys(liveCount) : location.monsterIds).filter((id) => MONSTER_REGISTRY[id])
  const locUpgrades = upgrades[location.id] ?? {}
  // Progress toward the next attunement point (purely cosmetic feedback).
  const attunePct = ((ticks % 50) / 50) * 100
  const chosen = storyChoice[location.id]

  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold text-game-text">{location.name}</div>
        <p className="text-xs text-game-text-dim leading-snug mt-0.5">{location.description}</p>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {location.openWorld && <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-700/50 bg-emerald-950/30 text-emerald-300">open world</span>}
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-game-border bg-game-bg text-game-text-dim">{location.monsterIds.length} foe types</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-game-border bg-game-bg text-game-text-dim">{here.length} hero{here.length !== 1 ? 'es' : ''} here</span>
        </div>
      </div>

      {/* meters */}
      <div className="space-y-2">
        <Meter label="Familiarity" pct={famPct} value={`${famPct}%`} color="bg-game-accent" />
        <Meter label="Attunement charge" pct={attunePct} value={`+1 soon`} color="bg-game-secondary" />
      </div>

      {/* attunement economy */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Site upgrades</span>
          <span className="text-[11px] text-game-secondary font-medium">✷ {available} attunement</span>
        </div>
        <div className="space-y-1.5">
          {LOCATION_UPGRADES.map((u) => {
            const level = locUpgrades[u.id] ?? 0
            const maxed = level >= u.max
            const cost = upgradeCost(u, level)
            const affordable = available >= cost && !maxed
            return (
              <div key={u.id} className="flex items-center gap-2 rounded-md border border-game-border bg-game-bg px-2.5 py-2">
                <span className="text-lg leading-none">{u.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-game-text">{u.name}</span>
                    <span className="text-[9px] text-game-text-dim">Lv {level}/{u.max}</span>
                  </div>
                  <div className="text-[10px] text-game-text-dim leading-snug">{u.desc}</div>
                </div>
                <button
                  onClick={() => buyUpgrade(location.id, u.id, cost, u.max)}
                  disabled={!affordable}
                  className={['text-[11px] px-2 py-1 rounded shrink-0 transition-colors tabular-nums',
                    maxed ? 'text-game-muted'
                      : affordable ? 'border border-game-secondary/50 text-game-text hover:bg-game-secondary/15'
                      : 'border border-game-border text-game-muted cursor-not-allowed'].join(' ')}
                >{maxed ? 'max' : `✷ ${cost}`}</button>
              </div>
            )
          })}
        </div>
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

      {/* who's here */}
      {here.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">Heroes on site</div>
          <div className="flex flex-wrap gap-1.5">
            {here.map((u) => (
              <button
                key={u.id}
                onClick={() => useGameStore.setState({ selectedUnitIds: [u.id] })}
                className="text-[11px] px-2 py-1 rounded border border-game-border bg-game-bg text-game-text hover:border-game-primary/50"
              >{u.name.split(' ')[0]} · Lv {u.level}</button>
            ))}
          </div>
        </div>
      )}

      {/* foes — tap a card to inspect its monster stats */}
      {foeIds.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1.5">
            {battle ? 'Foes on the field' : 'Native foes'}
          </div>
          <div className="space-y-1">
            {foeIds.map((id) => {
              const m = MONSTER_REGISTRY[id]
              return (
                <button
                  key={id}
                  onClick={() => setCodexId(id)}
                  className="w-full flex items-center gap-2 rounded-md border border-game-border bg-game-bg px-2.5 py-1.5 hover:border-game-primary/50 text-left"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ELEMENT_DOT[m.element] ?? ELEMENT_DOT.neutral}`} />
                  <span className="text-xs text-game-text flex-1 truncate">{m.name}</span>
                  {battle && <span className="text-[10px] text-game-text-dim">×{liveCount[id]}</span>}
                  <span className="text-[10px] text-game-text-dim">Lv {m.level}</span>
                  <span className="text-[10px] text-game-primary">card ›</span>
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
