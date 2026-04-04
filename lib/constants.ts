// Shared product constants (safe for client and server)
export const FOOTPRINT_PRICE_CENTS = 1000
export const FOOTPRINT_PRICE_DISPLAY = `$${FOOTPRINT_PRICE_CENTS / 100}`

/**
 * Slugs that conflict with application routes and must never be claimed as usernames.
 * Single source of truth — used by signup, publish, and import-draft.
 */
export const RESERVED_SLUGS = [
  'admin', 'api', 'auth', 'app',
  'build', 'checkout', 'claim',
  'dashboard', 'deed', 'docs',
  'example',
  'help', 'home',
  'login',
  'mail',
  'publish',
  'remix',
  'settings', 'signin', 'signup', 'success', 'support',
  'welcome', 'www',
  'aro', 'about',
] as const
