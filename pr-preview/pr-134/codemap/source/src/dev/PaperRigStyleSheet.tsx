import { compilePaperRigView } from '@/render/paperRig/compile'
import { PaperRigAsset, type PaperRigArtStyle } from '@/render/paperRig/PaperRigAsset'
import { PAPER_RIG_SPECIMENS, type PaperRigSpecimenId } from '@/render/paperRig/specimens'

const SPECIMENS: readonly { id: PaperRigSpecimenId; label: string }[] = [
  { id: 'horse', label: 'Horse' },
  { id: 'humanoid', label: 'Human' },
  { id: 'rhino', label: 'Rhino' },
]

const STYLES: readonly { id: PaperRigArtStyle; label: string; description: string }[] = [
  {
    id: 'rim-ink',
    label: 'Inked pale cutout',
    description: 'RimWorld-like read: bold silhouette, pale body mass, sparse solid-value anatomy.',
  },
  {
    id: 'stencil-5',
    label: 'Five-band stencil',
    description: 'Camera depth quantized into five fully opaque cut-paper values.',
  },
]

const VIEWS = Object.fromEntries(Object.entries(PAPER_RIG_SPECIMENS).map(([id, spec]) => [
  id,
  compilePaperRigView(spec, 45, 60),
])) as Record<PaperRigSpecimenId, ReturnType<typeof compilePaperRigView>>

export default function PaperRigStyleSheet() {
  return (
    <main data-paper-rig-style-sheet className="min-h-screen bg-[#181a1b] px-3 py-8 text-stone-100 sm:px-7">
      <header className="mx-auto mb-7 max-w-6xl text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">paper-rig/1 · style bake</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-4xl">Three silhouettes, two opaque treatments</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-400">
          Orthographic projection at 60° elevation, facing north-east. Every visible layer is a solid fill.
        </p>
      </header>

      <div className="mx-auto max-w-6xl space-y-8">
        {STYLES.map((style) => (
          <section key={style.id} data-style-row={style.id}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-semibold text-stone-100">{style.label}</h2>
              <p className="text-xs text-stone-400">{style.description}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-5">
              {SPECIMENS.map((specimen) => (
                <figure
                  key={specimen.id}
                  data-style-card={`${style.id}-${specimen.id}`}
                  className="overflow-hidden rounded-xl border border-stone-600 bg-[#e7e5dd] shadow-[0_5px_0_#0d0e0f]"
                >
                  <div className="aspect-square p-1 sm:p-4">
                    <PaperRigAsset specimen={specimen.id} view={VIEWS[specimen.id]} artStyle={style.id} />
                  </div>
                  <figcaption className="border-t border-stone-400 bg-[#d4d1c8] px-2 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-stone-800 sm:text-sm">
                    {specimen.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
