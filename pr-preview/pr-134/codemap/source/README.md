# Incremental

A mobile-first incremental RPG — guild management meets worker placement. Assign units to locations, gather resources, craft gear, and develop your team through abilities and skill trees.

Think Darkest Dungeon's roster management crossed with a simple idle game.

## Current state

Early UI prototype. Playable in browser, but:
- No combat, no resource generation over time, no save/load (state resets on refresh)
- All game data is hardcoded
- See `features.md` for a full list of what's built and what isn't

## Stack

- **Vite + React 18 + TypeScript**
- **Tailwind CSS 3** — custom `game-*` color palette defined in `tailwind.config.cjs`
- **Zustand 4** — single store for all game and UI state
- **@dnd-kit/core** — touch-safe drag-and-drop for unit assignment
- Deployed to **GitHub Pages** via GitHub Actions on push to `main`

## Running locally

```bash
npm install
npm run dev
```

## Deployment

Push to `main` — GitHub Actions builds and deploys to Pages automatically.
