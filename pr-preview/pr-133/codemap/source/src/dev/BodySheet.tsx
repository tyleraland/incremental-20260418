import type { CSSProperties, ReactNode } from 'react'
import { TOKEN_SKINS } from '@/render/skins'
import { BODY_SHAPES, type BodyShape } from '@/render/appearance'

// Dev-only per-BODY contact sheet (`?bodyshot=<shape>`, or `?bodyshot=all` for
// every creature): the monster-authoring review loop, one screenshot per body.
// Where ?gallery=1 reviews the whole language at a glance, this sheet reviews
// ONE creature's full animation state machine as deterministic STILLS — the
// REAL index.css keyframes paused at authored phases (never a reimplementation):
//
//   idle    — the three breathe/sway poses (rest → inhale → exhale undershoot)
//             frozen at 0% / 42% / 72%, plus one live looping cell.
//   attack  — the jab/trail + lunge frozen at wind / strike / recover.
//   hit     — the recoil frozen at brace / peak / settle.
//   walk    — the two opposite gait phases.
//   + facing wheel, scale ladder, far-LOD merge, KO crumple.
//
// Freezing works by pausing the animations (`.fz`) and pinning their progress
// with a negative delay: idle keyframes already take their duration/delay from
// --idle-dur/--idle-delay, so vars alone pin them; the fixed-duration atk/walk/
// lunge/hit keyframes are re-timed to a 1s cycle via `.fz1s` + --fz-t. Because
// the sheet drives the production CSS, a keyframe retune shows up here without
// touching this file. Screenshot via `npm run body-shot` (SHAPE=<shape> env).

const CREATURES = BODY_SHAPES.filter((s) => s !== 'humanoid')

function Cell({ label, size = 96, children }: { label: string; size?: number; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-lg border border-neutral-800 bg-[#141019]"
        style={{ width: size + 28, height: size + 28 }}
      >{children}</div>
      <span className="text-[9px] text-neutral-500 leading-none">{label}</span>
    </div>
  )
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-[11px] uppercase tracking-widest text-neutral-400 mb-2">{title}</h2>
      <div className="flex flex-wrap gap-2 items-end">{children}</div>
    </div>
  )
}

const dims = (px: number) => ({ width: `${px}px`, height: `${px}px`, fontSize: '0px' })

function ShapeSheet({ shape }: { shape: BodyShape }) {
  const Body = TOKEN_SKINS.paper
  const tone = shape === 'paperDoll' ? 'player' : 'enemy'
  const token = (px = 96, over: { facingDeg?: number | null; moving?: boolean; simple?: boolean; alive?: boolean } = {}) => (
    <Body
      glyph="" tone={tone} bodyShape={shape} creature={shape !== 'paperDoll'} selected={false}
      alive={over.alive ?? true} facingDeg={over.facingDeg === undefined ? 0 : over.facingDeg}
      moving={over.moving} simple={over.simple} dims={dims(px)}
    />
  )
  // Pin the idle loop at a phase t (of a 1s cycle): the idle rules read their
  // duration/delay from vars, so setting them + pausing is exact.
  const idleAt = (t: number) => (
    <div className="animate-idle fz" style={{ '--idle-dur': '1s', '--idle-delay': `${-t}s` } as CSSProperties}>{token()}</div>
  )
  const atkAt = (t: number) => (
    <div
      className="animate-lunge-a animate-atk-a fz fz1s"
      style={{ '--fz-t': `${-t}s`, '--lunge-x': '26%', '--lunge-y': '0%', '--atk-x': '13px', '--atk-y': '0px' } as CSSProperties}
    >{token()}</div>
  )
  const hitAt = (t: number) => (
    <div className="animate-hit-a fz fz1s" style={{ '--fz-t': `${-t}s`, '--hit-x': '-15%', '--hit-y': '0%' } as CSSProperties}>{token()}</div>
  )
  const walkAt = (t: number) => (
    <div className="animate-walk fz fz1s" style={{ '--fz-t': `${-t}s` } as CSSProperties}>{token(96, { moving: true })}</div>
  )
  return (
    <div className="mb-10">
      <h1 className="text-sm font-bold text-neutral-200 mb-3">body: {shape}</h1>
      <Row title="idle — the 3 breathe/sway poses (frozen) + the live loop">
        <Cell label="rest (0%)">{idleAt(0)}</Cell>
        <Cell label="inhale (42%)">{idleAt(0.42)}</Cell>
        <Cell label="exhale (72%)">{idleAt(0.72)}</Cell>
        <Cell label="live">
          <div className="animate-idle">{token()}</div>
        </Cell>
      </Row>
      <Row title="attack — jab/trail + lunge (frozen at wind · strike · recover)">
        <Cell label="wind (15%)">{atkAt(0.15)}</Cell>
        <Cell label="strike (40%)">{atkAt(0.40)}</Cell>
        <Cell label="recover (75%)">{atkAt(0.75)}</Cell>
      </Row>
      <Row title="hit — recoil (frozen at brace · peak · settle)">
        <Cell label="brace (10%)">{hitAt(0.10)}</Cell>
        <Cell label="peak (30%)">{hitAt(0.30)}</Cell>
        <Cell label="settle (70%)">{hitAt(0.70)}</Cell>
      </Row>
      <Row title="walk — opposite gait phases (frozen)">
        <Cell label="step A (25%)">{walkAt(0.25)}</Cell>
        <Cell label="step B (75%)">{walkAt(0.75)}</Cell>
        <Cell label="lean only">{token(96, { moving: true })}</Cell>
      </Row>
      <Row title="facing wheel (15° quantized in play)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <Cell key={deg} label={`${deg}°`} size={56}>{token(56, { facingDeg: deg })}</Cell>
        ))}
      </Row>
      <Row title="scale ladder · far-LOD merge · KO crumple">
        {[20, 32, 48].map((px) => <Cell key={px} label={`${px}px`} size={px}>{token(px)}</Cell>)}
        <Cell label="far-LOD" size={56}>{token(56, { simple: true })}</Cell>
        <Cell label="KO" size={56}>{token(56, { alive: false, facingDeg: null })}</Cell>
      </Row>
    </div>
  )
}

export default function BodySheet() {
  const raw = new URLSearchParams(window.location.search).get('bodyshot') ?? 'all'
  const picked = (BODY_SHAPES as readonly string[]).includes(raw) ? [raw as BodyShape] : CREATURES
  return (
    <div data-bodysheet className="min-h-full bg-[#0d0b11] p-4 pt-14">
      {picked.map((s) => <ShapeSheet key={s} shape={s} />)}
      {/* Freeze rig: pause every animation in a .fz cell (incl. descendants), and
          re-time the fixed-duration atk/walk/lunge/hit keyframes onto a 1s cycle
          whose progress is pinned by --fz-t (a negative delay). !important so the
          page wins over the index.css shorthands regardless of load order. */}
      <style>{[
        '.fz, .fz * { animation-play-state: paused !important; }',
        '.fz1s, .fz1s [data-atk], .fz1s [data-walk] {',
        '  animation-duration: 1s !important;',
        '  animation-delay: var(--fz-t, 0s) !important;',
        '  animation-iteration-count: infinite !important;',
        '}',
      ].join('\n')}</style>
    </div>
  )
}
