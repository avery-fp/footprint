import Link from 'next/link'
import { AUTH_ENTRY } from '@/lib/routes'

/**
 * /auth/retry — neutral destination for any failed auth handshake.
 *
 * Replaces the old /ae fallback. Ae's room is never an auth error page
 * for strangers. One CTA: try again.
 */
export const dynamic = 'force-dynamic'

export default function AuthRetryPage() {
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
        gap: '32px',
        padding: '32px',
        fontFamily: 'inherit',
      }}
    >
      <p
        className="font-mono"
        style={{
          fontSize: '12px',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        that link didn&apos;t work
      </p>
      <Link
        href={AUTH_ENTRY}
        className="font-mono"
        style={{
          padding: '14px 32px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.3)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: '12px',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          textDecoration: 'none',
        }}
      >
        try again
      </Link>
    </div>
  )
}
