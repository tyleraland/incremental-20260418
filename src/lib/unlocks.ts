import type { Unit } from '@/types'
import { INITIAL_UNITS } from '@/data/units'

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

// Bootstrap the mode for a brand-new game (no save yet) from `?mode=curated`. A
// persisted save's worldCodec wins over this on load.
export function bootstrapProgressionMode(): ProgressionMode {
  if (typeof window === 'undefined') return DEFAULT_PROGRESSION_MODE
  return new URLSearchParams(window.location.search).get('mode') === 'curated' ? 'curated' : DEFAULT_PROGRESSION_MODE
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
