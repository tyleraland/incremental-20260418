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

## Phase 2 — inter-map portals + walk-to-travel
- [ ] **Portal markers** read clearly on the field (glowing ◈ gateways at map edges).
- [ ] **Walk-to-travel.** In Time → Deploy, switch to **Open-world travel**. Select a
      hero on an open-world map and Deploy them to a directly-linked neighbour (e.g.
      Prontera Field → Harpy Roost): they should march to the portal and hop across,
      not teleport. 'Instant' mode keeps the teleport.
- [ ] **Off-screen travel** still completes when you're watching a different battle.
- [ ] World topology feels right (Prontera hub; fields chain off it and back). Tune
      `WORLD_EDGES` in `src/data/locations.ts` if a link is missing/wrong.

## Phase 3 — routing wired into the proto's logistics (default UI)
NOTE: the default 'Tactician' (proto) UI already has the full logistics sim (mock
loot, return-on-pack-full, town deposit, loot/supply sharing). Phase 3 wires its
resupply trips to the Phase 2 portal routing instead of building a second system.
- [ ] **Walk-home loop (proto).** Time → Deploy → **Open-world travel**. Deploy a hero
      to a hunting field; as their pack fills (Logistics board's Carried column), they
      should **walk** home through portals to the return town, deposit into the stash,
      then walk back — not teleport. ('Instant' keeps the teleport.)
- [ ] **Return town.** Honors the hero's chosen `returnTown`, else nearest city. Set it
      in the per-hero Logistics lens.
- [ ] **No loot regression.** Engine kill loot still lands in the guild stash directly
      (the core no longer diverts it), so quest/bounty item-collection progress is
      unaffected. Confirm a collection quest still advances while hunting.
- [ ] **Group return.** With group-return on, one hero's trigger should send the whole
      field's party home together (walking).

## Phase 2+ design inputs (gather while validating)
- [ ] **World topology for portals/routing.** `Location.connections` is empty. Decide
      which maps connect and where each portal sits (intended chain, cities as hubs).
      Your read of the map layout is the input for routing in Phase 3.
- [ ] **Logistics home town(s).** Which city a hunting field's heroes should haul loot
      back to by default (Phase 3 defaults to nearest city by graph distance).
