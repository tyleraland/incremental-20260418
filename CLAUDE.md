# Collaborator Guide

We're iterating fast on UI. No tests yet. Don't over-engineer toward future features — three similar lines beats a premature abstraction.

## Architecture patterns

**Single Zustand store** (`src/stores/useGameStore.ts`) holds all state — game data and UI state alike (expanded rows, active tab, equip context, etc.).

**Derived stats are computed at render time**, never stored. `getDerivedStats(unit, equipment)` reads abilities + equipment bonuses + skill bonuses each time. Same for `getUnitTraits`, `getAvailableSkills`, etc.

**Registries are plain exported objects** — `TRAIT_REGISTRY`, `MONSTER_REGISTRY`, `SKILL_REGISTRY`, `RECIPE_REGISTRY`. Add entries there; the UI reads them.

**Collapsible row pattern** throughout: header always visible, body toggled via `expandedXxxIds: string[]` in the store.

**Portal modals** (`createPortal`) for any popup that needs to escape an overflow container — see `TraitBubble`, `MonsterCodex`.

**Drag-and-drop**: PointerSensor only (no TouchSensor). Apply `touchAction: 'none' as const` in the draggable element's style object — not just during drag — so mobile browsers don't intercept the gesture before it starts.

## Priorities

- Playable feel on mobile first
- Visual iteration speed over correctness
- Tests and refactoring come later
- No persistence layer, no error boundaries, no abstractions the current features don't need
