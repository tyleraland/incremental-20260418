// Combat Tactic Engine — active time scale (finer rounds).
//
// "Per-round" quantities (move distance, cooldowns, channel/zone durations,
// status durations, basic-attack cadence, DoT ticks, draw timeout) are authored
// at a logical 1× rate. Running the sim at a *finer* round rate — more, smaller
// rounds per real second — makes motion smoother and spreads combat events out,
// but must not change the real-time pace: a unit should still cross the same
// ground per second, skills recharge in the same seconds, etc.
//
// `timeScale = N` means "N engine rounds == one logical round": move 1/N as far
// per round, recharge cooldowns over N× as many rounds, basic-attack every N
// rounds, age statuses over N× rounds, tick DoT every N rounds. The net real-time
// behaviour is unchanged; only the granularity is finer.
//
// Like the arena bounds, the engine runs one battle at a time, so each entry
// point sets the active scale up front and the per-round helpers read it here.
// Defaults to 1 (no scaling) so any path that forgets to set it behaves exactly
// as before — keeping the whole engine suite and snapshot replays unaffected.

let activeScale = 1

export function setTimeScale(scale: number): void {
  activeScale = Math.max(1, Math.floor(scale))
}

export function timeScale(): number {
  return activeScale
}

// Scale a per-logical-round duration (cooldown, channel, status, dwell) to rounds.
export function scaleRounds(rounds: number): number {
  return rounds * activeScale
}

// True on the round where a per-logical-round *discrete* event should fire (a basic
// attack, a DoT tick), spread by `phase` so staggered actors don't all fire on the
// same finer-round. At scale 1 this is every round (unchanged).
export function onBeat(round: number, phase = 0): boolean {
  return ((round + phase) % activeScale) === 0
}
