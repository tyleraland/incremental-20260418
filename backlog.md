# Backlog

- **Per-tick encounter reinforcement**: mid-encounter monster arrivals drawn from pool each tick with low probability (Poisson arrival model); see `isEncounterComplete` in `src/lib/encounter.ts` for the extension point

- **Per-unit/per-slot distance**: currently distance is a single scalar per encounter (`encounterDistance[locationId]`). A richer model tracks distance per unit and per monster slot, enabling: different units arriving at different times (marching order); ranged units shooting first while melee units close; monsters with aggro or threat mechanics switching targets based on who just entered range; priority behavior interacting with who is closest. Adds complexity to targeting — design threat/priority around arrival order and slot-level distance.

- **Flee + distance interaction**: while fleeing, distance is currently frozen. A natural extension: during flee, the party gains distance each tick at `PARTY_APPROACH_SPEED` (moving away from monsters), and monsters lose ground at their `moveSpeed`. Damage could be reduced proportionally as distance opens — specifically, monsters with `range > 0` would continue attacking through the flee until distance exceeds their range. This rewards the Avoid behavior for ranged threats and creates a meaningful tradeoff vs. pure flee.
