import { useEffect, useState, type CSSProperties } from 'react'
import { TOKEN_SKINS } from '@/render/skins'
import type { BodyShape } from '@/render/appearance'

// Shared dev preview: a live paper-skin token driven through an animation STATE
// MACHINE, using the exact CSS the battlefield uses (index.css) — so what you see
// here is what a token does in play. Reused by the Monster Lab (?monsterlab) and
// the Asset Workshop (?workshop).
//
//   idle    — the resting pose + `animate-idle`: the continuous [data-idle]
//             breathe/sway loop (a no-op for bodies without idle parts).
//   walk    — `moving` + `animate-walk`: the lean + the [data-walk] foot shuffle.
//   attack  — `animate-lunge` + `animate-atk` (+ --atk-x/y, --lunge-x/y): the head
//             /limbs jab and the whole token lunges, then settles back to idle.
//             `animate-idle` stays on (a standing attacker keeps breathing in play;
//             the atk rules out-cascade idle on parts tagged for both).
//   hit     — `animate-hit` (+ --hit-x/y): the token recoils from a frontal blow.
//
// The one-shot states (attack/hit) LOOP by swapping the a/b class pair on an
// interval — the same retrigger the live game uses for consecutive rounds — so a
// 0.3s animation reads as a repeating cycle. The body is authored facing +x, so
// the token faces right and the jab/lunge/recoil read along that axis.

export type AnimState = 'idle' | 'walk' | 'attack' | 'hit'
export const ALL_ANIM_STATES: AnimState[] = ['idle', 'walk', 'attack', 'hit']
const STATE_LABEL: Record<AnimState, string> = { idle: 'Idle', walk: 'Walk', attack: 'Attack', hit: 'Hit' }

export function BodyAnimPreview({
  shape,
  states = ALL_ANIM_STATES,
  size = 96,
}: {
  shape: BodyShape
  states?: AnimState[]
  size?: number
}) {
  const [state, setState] = useState<AnimState>('idle')
  const [flip, setFlip] = useState(false)
  // Keep the selected state valid if the caller's `states` list changes.
  useEffect(() => { if (!states.includes(state)) setState('idle') }, [states, state])
  // Loop the one-shot states (attack/hit) by re-triggering on a class-parity swap.
  useEffect(() => {
    if (state !== 'attack' && state !== 'hit') return
    setFlip((f) => !f)
    const id = setInterval(() => setFlip((f) => !f), state === 'hit' ? 700 : 560)
    return () => clearInterval(id)
  }, [state, shape])

  const Body = TOKEN_SKINS.paper
  const cls =
    state === 'walk' ? 'animate-walk'
    : state === 'attack' ? `animate-idle ${flip ? 'animate-lunge-a animate-atk-a' : 'animate-lunge-b animate-atk-b'}`
    : state === 'hit' ? `animate-idle ${flip ? 'animate-hit-a' : 'animate-hit-b'}`
    : 'animate-idle'
  const style =
    state === 'attack' ? ({ '--atk-x': '13px', '--atk-y': '0px', '--lunge-x': '26%', '--lunge-y': '0%' } as CSSProperties)
    : state === 'hit' ? ({ '--hit-x': '-15%', '--hit-y': '0%' } as CSSProperties)
    : undefined

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div
        className="relative shrink-0 rounded-lg border border-neutral-700 bg-[#141019] grid place-items-center overflow-hidden"
        style={{ width: size + 24, height: size + 24 }}
      >
        <div className={cls} style={style}>
          <Body
            glyph=""
            tone="enemy"
            bodyShape={shape}
            creature
            alive
            selected={false}
            facingDeg={0}
            moving={state === 'walk'}
            dims={{ width: `${size}px`, height: `${size}px`, fontSize: '0px' }}
          />
        </div>
      </div>
      <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
        {states.map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            className={[
              'px-3 py-1.5 text-xs border-r border-neutral-700 last:border-r-0',
              state === s ? 'bg-emerald-500/20 text-emerald-200 font-medium' : 'text-neutral-400 hover:bg-white/5',
            ].join(' ')}
          >{STATE_LABEL[s]}</button>
        ))}
      </div>
    </div>
  )
}
