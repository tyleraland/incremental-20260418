// DeploySheet (src/proto/DeploySheet.tsx) — wiring smoke tests only. These
// assert on STORE OUTCOMES (locationId ends up right) via accessible
// name/role, not on markup/labels/CSS, so they survive a future UI overhaul
// as long as the underlying deploy contract (assignUnits gets called with the
// right hero(es)/destination) still holds. Deeper grouping/store mechanics
// (open-world walk vs instant, travel, recovery ticking) are already covered
// at the store level (travel.test.ts, open-world.test.ts, health.test.ts).
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { DeploySheetHost } from '@/proto/DeploySheet'
import { useGameStore } from '@/stores/useGameStore'
import { useProtoStore } from '@/proto/protoStore'
import type { Location } from '@/types'
import { makeUnit, resetStore } from '../helpers'

const LOCATIONS: Location[] = [
  { id: 'prontera', name: 'Prontera City', region: 'world', description: '', traits: ['city'], monsterIds: [], familiarityMax: 100, connections: ['geffen'] },
  { id: 'geffen', name: 'Geffen City', region: 'world', description: '', traits: ['city'], monsterIds: [], familiarityMax: 100, connections: ['prontera'] },
]

const locationOf = (id: string) => useGameStore.getState().units.find((u) => u.id === id)?.locationId

beforeEach(() => {
  resetStore({
    locations: LOCATIONS,
    units: [
      makeUnit({ id: 'idle1', name: 'Idle Hero', locationId: null }),
      makeUnit({ id: 'busy1', name: 'Busy Hero', locationId: 'geffen', recoveryTicksLeft: 20 }),
    ],
  })
  useProtoStore.setState({ deploySheet: null })
})
afterEach(() => { cleanup(); useProtoStore.setState({ deploySheet: null }) })

describe('DeploySheet (shell)', () => {
  it('deploys a picked hero to the opening location', () => {
    useProtoStore.getState().openDeploySheet({ kind: 'pick-heroes', locId: 'prontera' })
    render(<DeploySheetHost />)
    fireEvent.click(screen.getByRole('button', { name: 'Idle Hero' }))
    fireEvent.click(screen.getByRole('button', { name: /Deploy 1 hero to Prontera City/ }))
    expect(locationOf('idle1')).toBe('prontera')
  })

  it('lets a busy (off-site) hero be picked and deployed — not gated by recovery', () => {
    useProtoStore.getState().openDeploySheet({ kind: 'pick-heroes', locId: 'prontera' })
    render(<DeploySheetHost />)
    fireEvent.click(screen.getByRole('button', { name: 'Busy Hero' }))
    fireEvent.click(screen.getByRole('button', { name: /Deploy 1 hero to Prontera City/ }))
    expect(locationOf('busy1')).toBe('prontera')
  })

  it('deploys to a switched destination, not the site that opened the sheet', () => {
    useProtoStore.getState().openDeploySheet({ kind: 'pick-heroes', locId: 'prontera' })
    render(<DeploySheetHost />)
    fireEvent.click(screen.getByRole('button', { name: /Destination: Prontera City/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Geffen City' }))
    fireEvent.click(screen.getByRole('button', { name: 'Idle Hero' }))
    fireEvent.click(screen.getByRole('button', { name: /Deploy 1 hero to Geffen City/ }))
    expect(locationOf('idle1')).toBe('geffen')
  })

  it('Move flow (hero-first pick-location) assigns the selection to the chosen destination', () => {
    useProtoStore.getState().openDeploySheet({ kind: 'pick-location', unitIds: ['idle1'] })
    render(<DeploySheetHost />)
    fireEvent.click(screen.getByRole('button', { name: 'Geffen City' }))
    fireEvent.click(screen.getByRole('button', { name: /Send Idle → Geffen City/ }))
    expect(locationOf('idle1')).toBe('geffen')
  })
})
