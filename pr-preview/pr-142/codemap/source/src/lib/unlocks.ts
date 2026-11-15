import type { Unit } from '@/types'
import { INITIAL_UNITS } from '@/data/units'
import { ACTIVE_MODE_KEY } from '@/lib/save'

// ── Progression modes (feature unfolding) ─────────────────────────────────────--
//
// The game runs in one of two stances:
//   • 'sandbox' — the default, and what the game has always been. Everything is
//     open: the full pre-built party, every recipe, every skill. Ideal for
//     development and for players who want the whole toy box at once.
//   • 'curated' — a deliberate new-player onramp. You start as a single unclassed
//     Novice with almost nothing, and content *unfolds* as you play: pick a class
//     (the city class-change quests) to open that class's skills, learn recipes,
//     reveal locations. Sandbox is the *absence* of these gates; curated turns
//     them on.
//
// Gating is centralised here so callers stay dumb — a UI asks `isSkillUnlocked()`
// rather than re-deriving the rules. The rules are plain data (this project
// prefers three concrete lines over a premature unlock engine); when the proto
// quest layer graduates into the real save, completed-quest ids become another
// input here. See BACKLOG → "Feature unfolding".
export type ProgressionMode = 'sandbox' | 'curated'

export const DEFAULT_PROGRESSION_MODE: ProgressionMode = 'sandbox'

// Which mode the store should boot into: an explicit `?mode=` URL override wins,
// else the last-active mode marker (the slot a reload should restore), else the
// default. loadPersistedSave resolves the same way, so boot seed and loaded slot
// agree. A `?mode=` value other than sandbox/curated is ignored.
export function bootstrapProgressionMode(): ProgressionMode {
  if (typeof window === 'undefined') return DEFAULT_PROGRESSION_MODE
  const url = new URLSearchParams(window.location.search).get('mode')
  if (url === 'curated' || url === 'sandbox') return url
  try {
    const saved = localStorage.getItem(ACTIVE_MODE_KEY)
    if (saved === 'curated' || saved === 'sandbox') return saved
  } catch { /* localStorage unavailable */ }
  return DEFAULT_PROGRESSION_MODE
}

// ── Curated starting state ────────────────────────────────────────────────────--
//
// What a curated game begins with. Everything not seeded here is gated and must be
// unfolded through play. (Sandbox keeps the full INITIAL_* seeds — see the store's
// freshGameSeed.)
export const CURATED_START = {
  // One unclassed recruit. Pell is already level 2, so a city class-change path is
  // available immediately — the first deliberate choice a new player makes.
  startUnitIds: ['u7'] as string[],
  // A single field consumable to learn the crafting loop on; the rest unfold.
  recipes: ['recipe-herb-salve'] as string[],
  // Start knowing only the home city and its neighbour — other sites reveal later.
  locationFamiliarity:  { 'prontera-city': 80, 'geffen-city': 30 } as Record<string, number>,
  locationMonstersSeen: { 'prontera-city': ['slime'] } as Record<string, string[]>,
  monsterSeen:          { slime: 5 } as Record<string, number>,
}

// The single Novice a curated game opens with, placed in the starting city.
export function curatedStartUnits(): Unit[] {
  return INITIAL_UNITS.filter((u) => CURATED_START.startUnitIds.includes(u.id))
}

// ── Skill unfolding (by class) ────────────────────────────────────────────────--
//
// In curated mode a hero may only learn skills in their class's kit; a Novice
// (class null) has none until they walk a class-change path. Prerequisite gating
// (SkillDef.requires) still applies on top of this. Sandbox ignores all of it.
export const CLASS_SKILL_KITS: Record<string, string[]> = {
  Fighter: ['sword-mastery-1h', 'sword-mastery-2h', 'bash', 'hammer-fall', 'shield-wall', 'defensive-stance', 'toughness', 'taunt', 'last-stand', 'boost-agility'],
  Ranger:  ['keen-eyes', 'eagle-eyes', 'arrow-shower', 'ankle-snare', 'poison', 'evasion', 'beast-companion'],
  Mage:    ['arcane-knowledge', 'spellweaving', 'fire-bolt', 'frost-bolt', 'earth-bolt', 'lightning-bolt', 'fireball', 'firewall', 'lightning-storm', 'freeze', 'molasses', 'dispel', 'evasion'],
  Cleric:  ['arcane-knowledge', 'heal', 'aoe-heal', 'bless', 'boost-agility', 'molasses', 'dispel', 'sight', 'evasion'],
  Rogue:   ['keen-eyes', 'cloak', 'back-stab', 'arrow-shower', 'ankle-snare', 'sight', 'poison', 'summon-skeletons'],
}

// Skills every hero (Novice included) may always train in curated mode. Empty for
// now — a Novice's whole arc is choosing a class — but this is the hook for a
// shared basic ("First Aid", "Sprint") later.
export const UNIVERSAL_SKILLS: string[] = []

// Is `skillId` unfolded for `unit`? Sandbox: always. Curated: a universal skill,
// one already learned (you never lose access to what you trained), or one in the
// unit's class kit (a classless Novice has only the universals).
export function isSkillUnlocked(
  mode: ProgressionMode,
  skillId: string,
  unit: Pick<Unit, 'class' | 'learnedSkills'>,
): boolean {
  if (mode === 'sandbox') return true
  if (UNIVERSAL_SKILLS.includes(skillId)) return true
  if ((unit.learnedSkills[skillId] ?? 0) > 0) return true
  const kit = unit.class ? CLASS_SKILL_KITS[unit.class] : undefined
  return kit ? kit.includes(skillId) : false
}

// ── Region unfolding (map pages) ──────────────────────────────────────────────--
//
// Some map pages are dev/testing-only and never shown in a normal game: the
// fixed-round encounter arenas live in a `'fixed-encounters'` dungeon reached
// from Prontera, but only in sandbox. In curated the normal overworld is just the
// open-world locations. Gating the *entry* (the only way into the page) keeps the
// whole region out of curated.
export const SANDBOX_ONLY_REGIONS = ['fixed-encounters']

export function isRegionUnlocked(mode: ProgressionMode, region: string): boolean {
  return mode === 'sandbox' || !SANDBOX_ONLY_REGIONS.includes(region)
}

// ── Directive unfolding (party doctrine) ──────────────────────────────────────--
//
// Directives (DIRECTIVE_REGISTRY, src/engine/directives.ts) are the party-scope
// planner lever — later-game content than unit tactics, so in curated they
// unfold as the party's best hero levels up (a coarse "your captain has grown
// into doctrine" ramp; thresholds ⏱ tune with the curated onramp). Skirmish is
// the always-on default. Sandbox: everything open, as with every other gate.
// An id missing from this table is treated as locked in curated (safe default
// for future directives until a threshold is chosen).
export const DIRECTIVE_UNLOCK_LEVEL: Record<string, number> = {
  'skirmish': 0,
  'protect': 5,
  'hold-the-line': 5,
  'pull-to-camp': 7,
  'assassinate': 9,
}

export function isDirectiveUnlocked(
  mode: ProgressionMode,
  directiveId: string,
  units: Pick<Unit, 'level'>[],
): boolean {
  if (mode === 'sandbox') return true
  const need = DIRECTIVE_UNLOCK_LEVEL[directiveId] ?? Infinity
  return need <= 0 || units.some((u) => u.level >= need)
}
