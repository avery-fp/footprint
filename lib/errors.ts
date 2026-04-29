// ═══════════════════════════════════════════
// Human-readable error mapping
// No raw error codes shown to users. Ever.
// ═══════════════════════════════════════════

const ERROR_MAP: Record<string, string> = {
  // Postgres / Supabase
  '23505': 'That name is already claimed. Try another.',
  'PGRST116': 'Something went wrong. Try again.',
  'PGRST301': 'Something went wrong. Try again.',

  // Auth
  'auth/invalid-email': 'Enter a valid email address.',
  'Invalid email or password': 'Invalid email or password.',
  'Invalid or expired link': 'That link has expired. Request a new one.',
  'Token is required': 'That link has expired. Request a new one.',

  // Signup
  'All fields required': 'Please fill in all fields.',
  'Invalid email': 'Enter a valid email address.',
  'Invalid username': 'Names can only contain letters, numbers, and hyphens.',
  'Password must be at least 6 characters': 'Password must be at least 6 characters.',
  'Username taken': 'That name is already claimed. Try another.',
  'Failed to create account': 'Something went wrong on our end. Try again in a moment.',
  'Failed to create page': 'Something went wrong on our end. Try again in a moment.',

  // Upload
  'Invalid file type. Use JPG, PNG, GIF, or WebP.': 'We support JPG, PNG, GIF, and WebP.',
  'Unsupported file type': 'We support JPG, PNG, GIF, MP4, and WebM.',
  'File too large. Maximum size is 5MB.': 'That file is too large. Keep images under 5MB.',
  'Upload failed': 'Upload hiccuped. Try again.',
  '8 video limit reached': 'You can upload up to 8 videos.',

  // Payment / Promo
  'Invalid promo code': "That code didn't work. Check the spelling.",
  'Promo code expired': 'That code has expired.',
  'Payment not confirmed': 'Payment is processing. You\'ll get a confirmation shortly.',
  'Username was claimed while you were paying': 'That name was taken while you were paying. Try another.',
  'No serials available': 'Something went wrong on our end. Try again in a moment.',

  // Publish
  'Failed to publish': 'Something went wrong. Try again.',
  'No footprint found': 'Something went wrong. Try signing in again.',
  'Username required': 'Choose a username first.',

  // Generic
  'network error': 'Connection lost. Check your internet and try again.',
  'Failed': 'Something went wrong. Try again.',
  'Login failed': 'Something went wrong. Try again.',
  'Verification failed': 'Something went wrong. Try again.',
  'Something went wrong': 'Something went wrong. Try again.',
}

// Username validation messages (from check-username)
const USERNAME_REASONS: Record<string, string> = {
  'taken': 'That name is already claimed. Try another.',
  'reserved': 'That name is reserved.',
  '2-20 characters': 'Names must be 2-20 characters.',
  '2-30 characters': 'Names must be 2-30 characters.',
  '2-40 characters': 'Names must be 2-40 characters.',
  'lowercase letters, numbers, underscores only': 'Names can only contain letters, numbers, and underscores.',
  'letters, numbers, dots, dashes only': 'Names can only contain letters, numbers, dots, and dashes.',
  'letters, numbers, dashes only': 'Names can only contain letters, numbers, and dashes.',
}

/**
 * Convert any error into a human-friendly message.
 * Never returns raw error codes or stack traces.
 */
export function humanError(error: any): string {
  if (!error) return 'Something went wrong. Try again.'

  // Handle string errors directly
  if (typeof error === 'string') {
    return ERROR_MAP[error] || error
  }

  // Try known fields
  const code = error?.code || ''
  const message = error?.message || error?.error || ''

  // Check code first, then message
  if (code && ERROR_MAP[code]) return ERROR_MAP[code]
  if (message && ERROR_MAP[message]) return ERROR_MAP[message]

  // File size errors (dynamic messages)
  if (typeof message === 'string') {
    if (message.includes('File too large') || message.includes('too large')) {
      return 'That file is too large. Keep images under 10MB and videos under 50MB.'
    }
    if (message.includes('Unsupported') || message.includes('file type')) {
      return 'We support JPG, PNG, GIF, MP4, and WebM.'
    }
    if (message.includes('rate') || message.includes('Rate') || message.includes('429')) {
      return 'Too many attempts. Wait a moment.'
    }
    if (message.includes('timeout') || message.includes('Timeout') || message.includes('ETIMEDOUT')) {
      return 'Request timed out. Try again.'
    }
    if (message.includes('network') || message.includes('Network') || message.includes('fetch')) {
      return 'Connection lost. Check your internet and try again.'
    }
  }

  return 'Something went wrong. Try again.'
}

/**
 * Get human-friendly username availability reason
 */
export function humanUsernameReason(reason: string): string {
  return USERNAME_REASONS[reason] || reason
}
