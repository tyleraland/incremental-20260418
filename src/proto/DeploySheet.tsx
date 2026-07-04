import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, getDerivedStats, type Unit } from '@/stores/useGameStore'
import { useProtoStore } from './protoStore'

// ── Deploy sheets ─────────────────────────────────────────────────────────────
//
// §orchestration: the two deployment flows, both ending in the same one-tap
// confirm. Location-first ("Deploy Heroes Here" on a location scope) opens the
// HERO picker; hero-first ("Move" on a hero/party scope) opens the DESTINATION
// picker. Bottom sheets, so the battlefield stays visible behind the decision.

function Sheet({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative max-h-[75%] rounded-t-2xl border-t border-x border-game-border bg-game-surface flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-game-text truncate">{title}</div>
            {sub && <div className="text-[10px] text-game-muted truncate">{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-game-border text-game-text-dim hover:text-game-text text-sm">✕</button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-3">{children}</div>
        <div className="shrink-0 p-3 pt-2 border-t border-game-border/60 safe-area-bottom">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

const first = (u: Unit) => u.name.split(' ')[0]

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-game-text-dim mb-1">{children}</div>
}

// ── Location-first: pick heroes to deploy to a site ──────────────────────────--
function HeroPicker({ locId }: { locId: string }) {
  const units       = useGameStore((s) => s.units)
  const locations   = useGameStore((s) => s.locations)
  const equipment   = useGameStore((s) => s.equipment)
  const assignUnits = useGameStore((s) => s.assignUnits)
  const close       = useProtoStore((s) => s.closeDeploySheet)
  const loc = locations.find((l) => l.id === locId)
  const [picked, setPicked] = useState<string[]>([])
  if (!loc) return null

  const cityIds = new Set(locations.filter((l) => l.traits.includes('city')).map((l) => l.id))
  const busy    = (u: Unit) => u.recoveryTicksLeft > 0
  const here    = units.filter((u) => u.locationId === locId && !(u.travelPath && u.travelPath.length))
  const rest    = units.filter((u) => u.locationId !== locId || (u.travelPath && u.travelPath.length))
  const inTown  = rest.filter((u) => !busy(u) && u.locationId && cityIds.has(u.locationId))
  const idle    = rest.filter((u) => !busy(u) && !u.locationId)
  const afield  = rest.filter((u) => !busy(u) && u.locationId && !cityIds.has(u.locationId))
  const unavailable = rest.filter(busy)

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const confirm = () => {
    if (picked.length === 0) return
    assignUnits(picked, locId)
    useGameStore.setState({ selectedUnitIds: picked })
    useProtoStore.getState().setScopeFocus('hero')
    close()
  }

  const chip = (u: Unit, disabled = false) => {
    const on = picked.includes(u.id)
    const maxHp = getDerivedStats(u, equipment).maxHp
    return (
      <button
        key={u.id}
        disabled={disabled}
        onClick={() => toggle(u.id)}
        className={['flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border transition-colors',
          disabled ? 'border-game-border/40 text-game-muted opacity-50'
          : on ? 'border-game-primary bg-game-primary/20 text-game-text ring-1 ring-game-primary/40'
          : 'border-game-border text-game-text hover:border-game-primary/50'].join(' ')}
      >
        <span className={on ? 'text-game-primary' : 'text-game-muted'}>{on ? '☑' : '☐'}</span>
        <span className="truncate">{first(u)}</span>
        <span className="text-game-text-dim">Lv {u.level}</span>
        <span className="text-game-muted tabular-nums">{Math.floor((u.health / Math.max(1, maxHp)) * 100)}%</span>
      </button>
    )
  }

  return (
    <Sheet
      title={`Deploy heroes → ${loc.name}`}
      sub="pick who goes — they hunt together on arrival"
      onClose={close}
      footer={
        <button
          onClick={confirm}
          disabled={picked.length === 0}
          className={['w-full text-sm font-semibold px-3 py-2.5 rounded-lg border transition-colors',
            picked.length ? 'border-game-primary/70 bg-game-primary/20 text-game-text hover:bg-game-primary/30'
            : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
        >➤ Deploy {picked.length || ''} {picked.length === 1 ? 'hero' : 'heroes'} to {loc.name}</button>
      }
    >
      {here.length > 0 && (
        <div>
          <GroupLabel>Already here</GroupLabel>
          <div className="flex flex-wrap gap-1.5">
            {here.map((u) => (
              <span key={u.id} className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg border border-game-green/40 bg-game-green/10 text-game-text-dim">
                <span className="w-1.5 h-1.5 rounded-full bg-game-green" />{first(u)}
              </span>
            ))}
          </div>
        </div>
      )}
      {inTown.length > 0 && <div><GroupLabel>In town</GroupLabel><div className="flex flex-wrap gap-1.5">{inTown.map((u) => chip(u))}</div></div>}
      {idle.length > 0 && <div><GroupLabel>Idle</GroupLabel><div className="flex flex-wrap gap-1.5">{idle.map((u) => chip(u))}</div></div>}
      {afield.length > 0 && <div><GroupLabel>Hunting elsewhere</GroupLabel><div className="flex flex-wrap gap-1.5">{afield.map((u) => chip(u))}</div></div>}
      {unavailable.length > 0 && <div><GroupLabel>Unavailable</GroupLabel><div className="flex flex-wrap gap-1.5">{unavailable.map((u) => chip(u, true))}</div></div>}
    </Sheet>
  )
}

// ── Hero-first: pick a destination for the selection ─────────────────────────--
const REGION_LABEL: Record<string, string> = {
  world: 'Overworld', 'geffen-dungeon': 'Geffen Dungeon', aerie: 'Sky Aerie', 'fixed-encounters': 'Fixed Encounters',
}

function LocationPicker({ unitIds }: { unitIds: string[] }) {
  const units       = useGameStore((s) => s.units)
  const locations   = useGameStore((s) => s.locations)
  const assignUnits = useGameStore((s) => s.assignUnits)
  const close       = useProtoStore((s) => s.closeDeploySheet)
  const [picked, setPicked] = useState<string | null>(null)
  const movers = units.filter((u) => unitIds.includes(u.id))
  const names = movers.length === 1 ? first(movers[0]) : `${movers.length} heroes`

  // Group destinations by map page; overworld first.
  const regions = [...new Set(locations.map((l) => l.region))].sort((a, b) => (a === 'world' ? -1 : b === 'world' ? 1 : a.localeCompare(b)))

  const confirm = () => {
    if (!picked) return
    assignUnits(unitIds, picked)
    const loc = locations.find((l) => l.id === picked)
    if (loc && loc.region !== useGameStore.getState().mapPageId) useGameStore.getState().setMapPage(loc.region)
    useGameStore.setState({ selectedLocationId: picked })
    close()
  }

  return (
    <Sheet
      title={`Move ${names}`}
      sub="pick a destination — heroes at the same place hunt as a party"
      onClose={close}
      footer={
        <button
          onClick={confirm}
          disabled={!picked}
          className={['w-full text-sm font-semibold px-3 py-2.5 rounded-lg border transition-colors',
            picked ? 'border-game-primary/70 bg-game-primary/20 text-game-text hover:bg-game-primary/30'
            : 'border-game-border text-game-muted cursor-not-allowed'].join(' ')}
        >➤ Send {names} → {picked ? locations.find((l) => l.id === picked)?.name : '…'}</button>
      }
    >
      {regions.map((r) => (
        <div key={r}>
          <GroupLabel>{REGION_LABEL[r] ?? r}</GroupLabel>
          <div className="space-y-1">
            {locations.filter((l) => l.region === r).map((l) => {
              const count = units.filter((u) => u.locationId === l.id).length
              const on = picked === l.id
              const isCity = l.traits.includes('city')
              return (
                <button
                  key={l.id}
                  onClick={() => setPicked(on ? null : l.id)}
                  className={['w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    on ? 'border-game-primary bg-game-primary/15 ring-1 ring-game-primary/40' : 'border-game-border bg-game-bg hover:border-game-primary/50'].join(' ')}
                >
                  <span className="w-5 text-center text-sm shrink-0">{isCity ? '⌂' : '⌖'}</span>
                  <span className="text-xs text-game-text flex-1 truncate">{l.name}</span>
                  {count > 0 && <span className="text-[10px] text-game-green shrink-0">{count} hero{count > 1 ? 'es' : ''}</span>}
                  {l.monsterIds.length > 0 && !isCity && <span className="text-[10px] text-game-muted shrink-0">{l.monsterIds.length} foe types</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </Sheet>
  )
}

export function DeploySheetHost() {
  const sheet = useProtoStore((s) => s.deploySheet)
  if (!sheet) return null
  return sheet.kind === 'pick-heroes'
    ? <HeroPicker locId={sheet.locId} />
    : <LocationPicker unitIds={sheet.unitIds} />
}
