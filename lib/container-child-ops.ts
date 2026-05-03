interface Child {
  id: string
  [key: string]: unknown
}

/**
 * Remove child with given id. Returns a new array; no-ops if id not found.
 */
export function removeChild<T extends Child>(children: T[], id: string): T[] {
  return children.filter(c => c.id !== id)
}
