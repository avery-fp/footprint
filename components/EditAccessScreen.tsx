'use client'

import { useState } from 'react'

/**
 * Same-page email-code login for the editor. Rendered by /[slug]/home when
 * no fp_edit_{slug} cookie is present and no ?token= unlock is in the URL.
 *
 * Step 1: enter owner email → POST /api/edit-access/start (always returns
 *          generic success; never leaks ownership).
 * Step 2: enter 6-digit code → POST /api/edit-access/verify; on success the
 *          cookie is set server-side and the page reloads into the editor.
 */
export default function EditAccessScreen({ slug }: { slug: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const trimmed = email.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/edit-access/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      setNotice(data?.message || 'If this email owns this Footprint, we sent a code.')
      setStep('code')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/edit-access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: email.trim(), code: trimmed }),
      })
      if (res.ok) {
        window.location.href = `/${encodeURIComponent(slug)}/home`
        return
      }
      setError('Invalid or expired code.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function useDifferentEmail() {
    setStep('email')
    setCode('')
    setError(null)
    setNotice(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: '#d4c5a9',
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 14,
    letterSpacing: '0.04em',
    outline: 'none',
  }
  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: '#d4c5a9',
    color: '#0c0c10',
    border: 'none',
    borderRadius: 4,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: '0.06em',
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
    textTransform: 'lowercase',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 11,
    letterSpacing: '0.06em',
    color: '#777780',
    textTransform: 'lowercase',
  }
  const linkStyle: React.CSSProperties = {
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 12,
    color: '#777780',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    letterSpacing: '0.04em',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0c0c10',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 380, width: '100%' }}>
        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <p style={{ ...labelStyle, margin: 0 }}>edit footprint</p>
            <p
              style={{
                margin: '12px 0 28px 0',
                fontFamily: "'DM Mono', 'Courier New', monospace",
                fontSize: 14,
                lineHeight: 1.6,
                color: '#d4c5a9',
                letterSpacing: '0.02em',
              }}
            >
              enter the email used to claim footprint.onl/{slug}.
            </p>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
            <button type="submit" disabled={busy} style={{ ...buttonStyle, marginTop: 16 }}>
              {busy ? 'sending…' : 'send code'}
            </button>
            {error && (
              <p style={{ ...labelStyle, marginTop: 16, color: '#c87878' }}>{error}</p>
            )}
            <div style={{ marginTop: 32, textAlign: 'center' }}>
              <a href={`/${encodeURIComponent(slug)}`} style={linkStyle}>
                back to public footprint
              </a>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <p style={{ ...labelStyle, margin: 0 }}>enter code</p>
            <p
              style={{
                margin: '12px 0 28px 0',
                fontFamily: "'DM Mono', 'Courier New', monospace",
                fontSize: 14,
                lineHeight: 1.6,
                color: '#d4c5a9',
                letterSpacing: '0.02em',
              }}
            >
              {notice || 'check your email for the 6-digit code.'}
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{ ...inputStyle, textAlign: 'center', fontSize: 22, letterSpacing: '0.4em' }}
            />
            <button type="submit" disabled={busy} style={{ ...buttonStyle, marginTop: 16 }}>
              {busy ? 'verifying…' : 'continue'}
            </button>
            {error && (
              <p style={{ ...labelStyle, marginTop: 16, color: '#c87878' }}>{error}</p>
            )}
            <div
              style={{
                marginTop: 32,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <button type="button" onClick={useDifferentEmail} style={linkStyle}>
                use different email
              </button>
              <a href={`/${encodeURIComponent(slug)}`} style={linkStyle}>
                back to public footprint
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
