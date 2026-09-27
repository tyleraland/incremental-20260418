// WorldNode (the shell's map-cell component, src/proto/ProtoStage.tsx) —
// ported from classic Map.tsx's LocationCell empty-location tests (now
// deleted). WorldNode already identifies a cell by its `title` attribute
// (same as classic), and — unlike classic's numeric "0" badge — never renders
// a presence indicator at all for an empty location (dots only, gated on
// `here.length > 0`), so there's no badge text to assert against; we assert
// the dot-badge container is simply absent.
import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { WorldNode } from '@/proto/ProtoStage'
import type { Location } from '@/types'

afterEach(() => cleanup())

const noop = () => {}
// A real id from LOCATION_COORDS — WorldNode renders nothing for an id it
// doesn't have a placed coordinate for.
const TEST_LOCATION: Location = {
  id: 'geffen-city', name: 'Test Forest', region: 'world',
  description: '', traits: [], monsterIds: ['wolf'], familiarityMax: 100, connections: [],
}

const node = (loc: Location, units: import('@/types').Unit[] = []) => (
  <WorldNode
    loc={loc} units={units} equipment={[]} zoom={1}
    selected={false} questReady={false} onTap={noop} onDive={noop}
  />
)

describe('WorldNode — empty location (shell map)', () => {
  it('renders a cell for an empty location, identifiable by its name title', () => {
    render(node({ ...TEST_LOCATION, name: 'Empty Spot' }))
    expect(screen.getByTitle('Empty Spot')).toBeInTheDocument()
  })

  it('does not show a presence badge when the location is empty', () => {
    const { container } = render(node({ ...TEST_LOCATION, name: 'Vacant Forest' }))
    // The presence-dot badge only renders when `here.length > 0` — assert its
    // wrapper (identified by its bg/border classes) is entirely absent.
    expect(container.querySelector('.bg-game-bg\\/90')).not.toBeInTheDocument()
  })
})
