export function normalizeMusicString(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\[.*?\]\s*/g, ' ')
    .replace(/\b(remaster(ed)?|deluxe|explicit|clean|single|radio edit|version|mono|stereo)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function confidenceScore(expected: string, actual: string): number {
  const a = normalizeMusicString(expected)
  const b = normalizeMusicString(actual)

  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.88

  const aw = a.split(/\s+/).filter(Boolean)
  const bw = b.split(/\s+/).filter(Boolean)
  const bwSet = new Set(bw)
  const intersection = aw.filter((word) => bwSet.has(word)).length
  const union = new Set(aw.concat(bw)).size

  return union ? intersection / union : 0
}
