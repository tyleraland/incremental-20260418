import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore, PACK_SLOTS, type Unit } from '@/stores/useGameStore'
import { consumableDef, isConsumable } from '@/data/consumables'

// §consumables — the hero's carry pack, visualized as a slot grid and configured
// through a per-item rule editor. Distinct from the loot-carry strip (kept
// separate for now). A pack entry (`Unit.pack`) is a reserved slot for one item:
// `target` is how many to keep stocked (filled from the stash in town), `count`
// is what's currently carried. A use rule (`Unit.consumableRules`) makes the hero
// auto-use it mid-fight. The rule editor is built as a reusable shell — HP works
// today; other triggers are scaffolded for later (and for special-tactic configs).

const GRID_SLOTS = PACK_SLOTS   // 20 — laid out as an inventory grid

// Trigger catalog for the rule editor. Only 'hp-below' is wired; the rest are
// visible-but-disabled so the shape of the system is legible (and reusable).
type TriggerKind = 'hp-below' | 'poisoned' | 'buff-expired' | 'ally-down'
const TRIGGERS: { kind: TriggerKind; label: string; hint: string; ready: boolean }[] = [
  { kind: 'hp-below',     label: 'HP below…',        hint: 'Drink when this hero drops under a HP %.',           ready: true },
  { kind: 'poisoned',     label: 'When poisoned',     hint: 'Use a cure (e.g. antidote) when a poison lands.',     ready: false },
  { kind: 'buff-expired', label: 'When a buff fades',  hint: 'Re-apply when a chosen buff wears off.',             ready: false },
  { kind: 'ally-down',    label: 'When an ally falls', hint: 'Use (e.g. a town warp) when a party member is KO\'d.', ready: false },
]

// ── Quantity stepper: −/+ with a selectable step so a high-level hero can move
// counts by 1, 10, or 100. ─────────────────────────────────────────────────────
function CarryStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [step, setStep] = useState(10)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, value - step))}
          className="w-9 h-9 rounded-lg border border-game-border text-game-text text-lg leading-none hover:bg-game-border/50">−</button>
        <div className="flex-1 text-center">
          <div className="text-lg font-mono text-game-text tabular-nums">{value}</div>
          <div className="text-[9px] uppercase tracking-wider text-game-text-dim">carry target</div>
        </div>
        <button onClick={() => onChange(value + step)}
          className="w-9 h-9 rounded-lg border border-game-border text-game-text text-lg leading-none hover:bg-game-border/50">+</button>
      </div>
      <div className="flex items-center justify-center gap-1">
        <span className="text-[9px] uppercase tracking-wider text-game-text-dim mr-1">step</span>
        {[1, 10, 100].map((s) => (
          <button key={s} onClick={() => setStep(s)}
            className={`text-[10px] px-2 py-0.5 rounded border tabular-nums ${step === s ? 'border-game-primary/60 bg-game-primary/10 text-game-text' : 'border-game-border text-game-text-dim hover:text-game-text'}`}>{s}</button>
        ))}
      </div>
    </div>
  )
}

// ── Per-item rule editor (the reusable popup shell) ─────────────────────────────
function RuleEditorModal({ unit, itemId, onClose }: { unit: Unit; itemId: string; onClose: () => void }) {
  const setCarryTarget   = useGameStore((s) => s.setCarryTarget)
  const clearCarryTarget = useGameStore((s) => s.clearCarryTarget)
  const addRule    = useGameStore((s) => s.addConsumableRule)
  const removeRule = useGameStore((s) => s.removeConsumableRule)
  const setThreshold = useGameStore((s) => s.setRuleThreshold)

  const def = consumableDef(itemId)
  const entry = (unit.pack ?? []).find((p) => p.itemId === itemId)
  const rule = (unit.consumableRules ?? []).find((r) => r.itemId === itemId)
  const [trigger, setTrigger] = useState<TriggerKind>('hp-below')
  const target = entry?.target ?? 0
  const pct = Math.round((rule?.threshold ?? 0.4) * 100)

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-game-border bg-game-surface p-4 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{def?.icon ?? '•'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-game-text truncate">{def?.name ?? itemId}</div>
            <div className="text-[11px] text-game-text-dim">carrying <span className="font-mono text-game-gold">{entry?.count ?? 0}</span>{def?.description ? ` · ${def.description}` : ''}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-game-border text-game-text hover:bg-game-border/50">✕</button>
        </div>

        {/* Carry quantity */}
        <div className="rounded-lg border border-game-border bg-game-bg/50 p-3">
          <CarryStepper value={target} onChange={(n) => setCarryTarget(unit.id, itemId, n)} />
          <div className="text-[10px] text-game-muted mt-2 text-center">
            {target === 0 ? 'Reserved slot — kept open, carries 0 until you raise the target.' : 'Tops up from the guild stash when this hero is in town.'}
          </div>
        </div>

        {/* Use rule */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Auto-use rule</span>
            <label className="flex items-center gap-1.5 text-[11px] text-game-text-dim cursor-pointer">
              <input type="checkbox" checked={!!rule} onChange={(e) => e.target.checked ? addRule(unit.id, itemId, 0.4) : removeRule(unit.id, itemId)} />
              enabled
            </label>
          </div>

          {/* Trigger picker — only HP is wired; the rest preview the system. */}
          <div className="space-y-1">
            {TRIGGERS.map((t) => {
              const active = trigger === t.kind
              return (
                <button key={t.kind} disabled={!t.ready} onClick={() => t.ready && setTrigger(t.kind)}
                  className={`w-full text-left rounded-lg border px-2.5 py-1.5 ${active ? 'border-game-primary/60 bg-game-primary/10' : 'border-game-border'} ${t.ready ? 'hover:border-game-primary/40' : 'opacity-45'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-game-text">{t.label}</span>
                    {!t.ready && <span className="text-[9px] px-1 py-0.5 rounded border border-game-border text-game-muted">soon</span>}
                  </div>
                  <div className="text-[10px] text-game-text-dim leading-snug">{t.hint}</div>
                </button>
              )
            })}
          </div>

          {/* HP threshold control — shown when the HP trigger is selected + enabled. */}
          {trigger === 'hp-below' && rule && (
            <div className="rounded-lg border border-game-border bg-game-bg/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-game-text-dim">Use when HP drops below</span>
                <span className="text-sm font-mono text-game-text tabular-nums">{pct}%</span>
              </div>
              <input type="range" min={5} max={95} step={5} value={pct}
                onChange={(e) => setThreshold(unit.id, itemId, Number(e.target.value) / 100)}
                className="w-full accent-game-primary" />
            </div>
          )}
          {trigger === 'hp-below' && !rule && (
            <div className="text-[10px] text-game-muted italic">Enable the rule to set a threshold.</div>
          )}
        </div>

        <button onClick={() => { clearCarryTarget(unit.id, itemId); onClose() }}
          className="w-full text-[11px] py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10">
          Remove from pack
        </button>
      </div>
    </div>,
    document.body,
  )
}

// ── Add-item sheet: pick a stash consumable to reserve a slot for ───────────────
function AddItemSheet({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const setCarryTarget = useGameStore((s) => s.setCarryTarget)
  const miscItems = useGameStore((s) => s.miscItems)
  const inPack = new Set((unit.pack ?? []).map((p) => p.itemId))
  const addable = miscItems.filter((m) => isConsumable(m.id) && !inPack.has(m.id))

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-game-border bg-game-surface p-4 space-y-2 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Add to pack</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-game-border text-game-text hover:bg-game-border/50">✕</button>
        </div>
        {addable.length === 0 ? (
          <div className="text-[11px] text-game-muted italic py-2">No consumables in the guild stash to carry.</div>
        ) : addable.map((m) => {
          const def = consumableDef(m.id)
          return (
            <button key={m.id} onClick={() => { setCarryTarget(unit.id, m.id, 50); onClose() }}
              className="w-full flex items-center gap-2 rounded-lg border border-game-border px-2.5 py-2 hover:border-game-primary/50">
              <span className="text-lg">{def?.icon ?? '•'}</span>
              <span className="text-xs text-game-text flex-1 text-left truncate">{def?.name ?? m.name}</span>
              <span className="text-[10px] text-game-text-dim">stash <span className="font-mono">{m.quantity}</span></span>
            </button>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

export function ConsumablePack({ unit }: { unit: Unit }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const pack = unit.pack ?? []
  const rules = new Set((unit.consumableRules ?? []).map((r) => r.itemId))
  const used = pack.length
  const filled = pack.filter((p) => p.count > 0).length

  // 20 cells: the pack entries first, then empty slots up to the cap.
  const cells = Array.from({ length: GRID_SLOTS }, (_, i) => pack[i] ?? null)

  return (
    <div className="rounded-lg border border-game-border bg-game-bg/60 p-2.5">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-game-text-dim">Pack</span>
        <span className="text-[11px] text-game-text-dim tabular-nums">{used}/{GRID_SLOTS}{filled < used ? ` · ${filled} stocked` : ''}</span>
        {/* compact preview when collapsed */}
        {!expanded && (
          <span className="flex-1 flex items-center gap-1 overflow-hidden">
            {pack.slice(0, 8).map((p) => <span key={p.itemId} className="text-sm">{consumableDef(p.itemId)?.icon ?? '•'}</span>)}
            {pack.length === 0 && <span className="text-[10px] text-game-muted italic">empty — tap to set up</span>}
          </span>
        )}
        <span className="ml-auto text-game-text-dim text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mt-2.5 space-y-2">
          <div className="grid grid-cols-10 gap-1">
            {cells.map((p, i) => {
              if (!p) {
                return (
                  <button key={`e${i}`} onClick={() => setAdding(true)}
                    className="aspect-square rounded border border-dashed border-game-border/50 text-game-muted/50 hover:border-game-primary/50 hover:text-game-text flex items-center justify-center text-xs">+</button>
                )
              }
              const def = consumableDef(p.itemId)
              const ruled = rules.has(p.itemId)
              return (
                <button key={p.itemId} onClick={() => setEditing(p.itemId)}
                  title={`${def?.name ?? p.itemId} — ${p.count}${p.target ? `/${p.target}` : ''}${ruled ? ' · auto-use' : ''}`}
                  className={`relative aspect-square rounded border bg-game-primary/10 flex items-center justify-center ${ruled ? 'border-game-green/60 hover:border-game-green' : 'border-game-primary/40 hover:border-game-primary'}`}>
                  <span className="text-base leading-none">{def?.icon ?? '•'}</span>
                  <span className="absolute -bottom-0.5 right-0 text-[8px] font-mono text-game-text tabular-nums bg-game-bg/80 px-0.5 rounded-sm">{p.count}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-game-muted">Tap a slot to set carry amount + auto-use rule. <span className="inline-block w-2 h-2 rounded-sm border border-game-green/70 align-middle" /> = rule set.</span>
            <button onClick={() => setAdding(true)} className="text-[10px] px-2 py-0.5 rounded border border-game-border text-game-text-dim hover:text-game-text shrink-0">+ Add</button>
          </div>
        </div>
      )}

      {editing && <RuleEditorModal unit={unit} itemId={editing} onClose={() => setEditing(null)} />}
      {adding && <AddItemSheet unit={unit} onClose={() => setAdding(false)} />}
    </div>
  )
}
