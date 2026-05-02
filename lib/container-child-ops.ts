interface Child {
  id: string
  position: number
  source: 'library' | 'links'
  [key: string]: unknown
}

/**
 * Swap child at `idx` with its neighbor in direction `dir` (-1 left, +1 right).
 * Returns a new array with positions reassigned 0, 1, 2…
 * No-ops at boundaries.
 */
export function moveChild<T extends Child>(children: T[], idx: number, dir: -1 | 1): T[] {
  const swap = idx + dir
  if (swap < 0 || swap >= children.length) return children
  const arr = [...children]
  ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
  return arr.map((c, i) => ({ ...c, position: i }))
}

/**
 * Remove child with given id. Returns a new array; no-ops if id not found.
 */
export function removeChild<T extends Child>(children: T[], id: string): T[] {
  return children.filter(c => c.id !== id)
}
