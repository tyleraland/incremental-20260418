# Save guide (`src/save/`)

Saves are `v1:<base64>` envelopes of independently-versioned slices (`src/lib/save.ts`).
Each `SliceCodec` owns `serialize`/`deserialize`/`empty` and optional `migrate`.

## Contracts
- Missing slice -> `empty()`.
- Corrupt envelope -> `{}` safe no-op.
- `App.tsx` loads on mount, autosaves every 60s and on tab-hide.
- Add a persistent concern as a codec in `src/save/*Codec.ts` and register it in `ALL_CODECS` (`src/save/index.ts`).

## State tiers
- Persistent: units, inventory, learned recipes, location familiarity/seen, codex, per-species intel (`intelCodec` — revealed armor/dodge/kit fields, §3.7 intel mask), location stats, unit stats/history, party tactics, ticks, battle cooldown/spawn state, item sockets, `savedAt`.
- Runtime: location registry materialized from data, event log, `lastTickAt`, offline summary.
- Ephemeral UI: separate localStorage keys for tabs, selections, expand state, camera nonces, etc.

## Battles
Battles persist through `battlesCodec` as the engine's `BSNAP.<base64>` token (`serializeBattle`).
Serialization lives in the engine snapshot layer; the save system only composes it.

`exportSave`/`importSave` round-trip the whole envelope from Time -> Debug.

## Progression mode slots
- `progressionMode: 'sandbox' | 'curated'` persists in `worldCodec`.
- Each mode has its own save slot (`save:sandbox` / `save:curated`) plus the `save-active-mode` marker.
- `persistSave` writes only the active slot.
- `resetSave` wipes only the active slot.
- `switchProgressionMode(target)` flushes the current game, then loads the target slot or seeds a fresh game.
- `bootstrapProgressionMode` resolves URL > marker > default so the boot seed matches the loaded slot.
