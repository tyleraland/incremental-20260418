// Unit naming. Names are stored full ("First Last"); compact UI shows initials.

export const FIRST_NAMES = [
  'Brom','Cass','Dara','Fen','Gale','Holt','Issa','Jorn','Kara','Lexa',
  'Mack','Nira','Orin','Pell','Quinn','Roan','Sela','Tarn','Vex','Wren','Zora',
]

export const LAST_NAMES = [
  'Ashdown','Briar','Cobble','Dunmere','Everhart','Fallow','Greaves','Holloway',
  'Ironwood','Larkin','Marsh','Nettle','Oakes','Pyke','Ravenswood','Stonefield',
  'Thorne','Underhill','Vance','Whitlock',
]

// Two-letter initials, e.g. "Aldric Thorne" → "AT". Falls back to the first
// two letters for single-word names.
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Picks a "First Last" not already in `used`. Falls back to a numbered recruit
// once the name space is exhausted.
export function randomFullName(used: Set<string>): string {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
  for (let i = 0; i < 40; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
    if (!used.has(name)) return name
  }
  return `Recruit ${used.size + 1}`
}
