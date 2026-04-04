/**
 * SHARED GLASS TREATMENT — one visual language across all surfaces.
 *
 * Used by: container facade, serial flyout, expanded header bar,
 * and any future glass surface. Change here, changes everywhere.
 */

export const GLASS = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
} as const

/** Glass style object — spread into React style prop */
export const glassStyle = {
  background: GLASS.background,
  border: GLASS.border,
  backdropFilter: GLASS.backdropFilter,
  WebkitBackdropFilter: GLASS.WebkitBackdropFilter,
}
