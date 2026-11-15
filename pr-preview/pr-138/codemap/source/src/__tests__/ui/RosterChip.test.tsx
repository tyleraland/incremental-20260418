// RosterChip (the shell's roster-rail chip, src/proto/ProtoApp.tsx) — ported
// from classic RosterCarousel's KO-indicator test (now deleted). The shell
// renders KO differently than classic did: a "✚" corner badge (title="Knocked
// out — recovering") + a purple HP-ring color, not the literal text "KO" —
// see unitStateColor/RosterChip in ProtoApp.tsx. The underlying KO-state
// transition itself (recoveryTicksLeft counting down, no regen during KO) is
// covered at the store level in health.test.ts.
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { RosterChip } from '@/proto/ProtoApp'
import { makeUnit, resetStore } from '../helpers'

afterEach(() => cleanup())

const noop = () => {}
const chip = (unit: ReturnType<typeof makeUnit>) => (
  <RosterChip unit={unit} selected={false} here={false} following={false} onSelect={noop} onFocus={noop} />
)

describe('RosterChip KO indicator (shell)', () => {
  it('shows the KO corner badge when the unit is in recovery countdown', () => {
    resetStore()
    const u = makeUnit({ id: 'u1', health: 0, recoveryTicksLeft: 5 })
    render(chip(u))
    expect(screen.getByTitle('Knocked out — recovering')).toBeInTheDocument()
  })

  it('does not show the KO badge for a healthy unit', () => {
    resetStore()
    const u = makeUnit({ id: 'u1', health: 100, recoveryTicksLeft: 0 })
    render(chip(u))
    expect(screen.queryByTitle('Knocked out — recovering')).not.toBeInTheDocument()
  })
})
