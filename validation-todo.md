# Open-World Overhaul — Validation TODO

Things to validate by hand on the PR preview before/while later phases land.
Automated checks (CI, the perf harness) can't judge *feel* — these need a human eye.
Preview: https://tyleraland.github.io/incremental-20260418/pr-preview/pr-67/

## Phase 1 — 200×200 fields + boundary perimeter

### Judgment calls (the real risks — calibrate these)
- [ ] **Density / hunting cadence.** Deploy a party to **Prontera Field**, **Southern
      Road**, or **Kanto Beach** (now 200-wide, caps 36/40/44), drop in, watch ~1 min.
      Do heroes find and fight monsters at a satisfying rate, or does it feel *dead*
      with long empty roams? Heroes hunt toward the nearest monster they *spot*, then
      roam when nothing's in sight. If too empty → raise caps (perf has huge headroom,
      smooth to cap 90). **Main thing to settle before Phase 2.**
- [ ] **Reward rate vs. before.** Bigger/sparser = fewer kills/min while watching.
      Confirm loot/exp feels acceptable and **offline/idle** still credits sensibly
      (sampling extrapolates the realized rate, so a slow live rate → slow idle rate).
- [ ] **Perimeter frame.** Pan / pinch-zoom to a **map edge**; confirm the stone
      wall-ring reads well (weight, color, frames the map without looking like a bug).
      Rendering at the true edges is DOM-verified; the *look* needs a human glance.

### Quick confirmations
- [ ] **Perf on a real phone** (harness only tested throttled-mobile emulation, ~45 fps
      @ 200). Smooth panning/zooming a big field + the minimap.
- [ ] **Camera/minimap at 200** — minimap radar readable, follow-cam tracks the party,
      pinch-zoom + free-look usable on a field far bigger than the viewport.
- [ ] **Unchanged identities held** — Harpy Roost still a tight 25-monster swarm; cities
      still feel like towns (heroes milling); Boar Meadow / Dire Wolf Den showcases
      (herd / pack at 30-wide) intact.

## Phase 2+ design inputs (gather while validating)
- [ ] **World topology for portals/routing.** `Location.connections` is empty. Decide
      which maps connect and where each portal sits (intended chain, cities as hubs).
      Your read of the map layout is the input for routing in Phase 3.
- [ ] **Logistics home town(s).** Which city a hunting field's heroes should haul loot
      back to by default (Phase 3 defaults to nearest city by graph distance).
