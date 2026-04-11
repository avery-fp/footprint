'use client'

import OAuthButton from '@/components/auth/OAuthButton'

/**
 * Minimal auth entry — black page, one Google button.
 *
 * No title. No pitch. No "sign up". Just:
 * Continue with Google → account sheet → boom, you are in.
 */
export default function HomeEntry() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ width: 'min(88vw, 320px)' }}>
        <OAuthButton
          provider="google"
          label="continue with google"
          redirectAfterAuth="/home"
        />
      </div>
    </div>
  )
}
