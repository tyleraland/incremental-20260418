import { useState } from 'react'
import { createPortal } from 'react-dom'
import { type Trait, type TraitCategory } from '@/stores/useGameStore'

const CATEGORY_COLORS: Record<TraitCategory, string> = {
  'damage-type': 'bg-red-950 text-red-300 border-red-800/60',
  'element':     'bg-orange-950 text-orange-300 border-orange-800/60',
  'stat':        'bg-yellow-950 text-yellow-300 border-yellow-800/60',
  'item-type':   'bg-violet-950 text-violet-300 border-violet-800/60',
  'environment': 'bg-emerald-950 text-emerald-300 border-emerald-800/60',
  'class':       'bg-blue-950 text-blue-300 border-blue-800/60',
  'proficiency': 'bg-indigo-950 text-indigo-300 border-indigo-800/60',
  'general':     'bg-gray-800 text-gray-400 border-gray-600/60',
}

export function traitColor(trait: Trait): string {
  return trait.colorClass ?? CATEGORY_COLORS[trait.category] ?? CATEGORY_COLORS.general
}

function TraitPopup({ trait, onClose }: { trait: Trait; onClose: () => void }) {
  const color = traitColor(trait)
  const categoryLabel = trait.category.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-game-surface border border-game-border rounded-2xl p-5 w-full max-w-xs shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${color}`}>
            {trait.label}
          </span>
          <span className="text-xs text-game-muted uppercase tracking-widest">{categoryLabel}</span>
          <button
            className="ml-auto text-game-muted text-xl leading-none hover:text-game-text"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="text-game-text-dim text-sm leading-relaxed">{trait.description}</p>
      </div>
    </div>,
    document.body
  )
}

export function TraitBubble({ trait }: { trait: Trait }) {
  const [open, setOpen] = useState(false)
  const color = traitColor(trait)

  return (
    <>
      <button
        className={`text-xs px-2.5 py-0.5 rounded-full border font-medium transition-opacity active:opacity-70 ${color}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        {trait.label}
      </button>
      {open && <TraitPopup trait={trait} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Renders a flex-wrap row of trait bubbles. */
export function TraitRow({ traits, className = '' }: { traits: Trait[]; className?: string }) {
  if (traits.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {traits.map((t) => <TraitBubble key={t.id} trait={t} />)}
    </div>
  )
}
