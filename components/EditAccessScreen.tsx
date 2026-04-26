'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Same-page email-code login for the editor. Rendered by /[slug]/home when
 * no fp_edit_{slug} cookie is present and no ?token= unlock is in the URL.
 *
 * The screen is supposed to hold state for the user across the inevitable
 * tab-switch to their inbox. So:
 *
 *  - URL params take first priority on first paint:
 *      ?email=…          prefill the email
 *      ?email=…&sent=1   jump directly to step 2 (code entry)
 *      ?code=…           prefill the code (does not auto-submit)
 *    After the first paint we strip these from the URL so a refresh
 *    doesn't keep re-applying stale params.
 *  - sessionStorage is the secondary source: if you submit your email,
 *    the page remembers (slug, email, step) until verify succeeds. A
 *    refresh, an inbox tab-switch, or a parent re-render that briefly
 *    unmounts this component all return you to the code-entry screen
 *    with email remembered.
 *  - Defaults if neither URL nor sessionStorage carry state: step 1.
 *
 * Fixed in this version:
 *  - The previous two-useEffect (restore + persist) pattern raced on
 *    mount: the persist effect fired with the old default state before
 *    the restore effect's setState landed, clobbering sessionStorage.
 *    Now state is initialized synchronously via useState's lazy init,
 *    and a useRef gates the first persist write so we never overwrite
 *    a freshly-read value with the defaults.
 *  - The two forms now have distinct keys so React fully unmounts the
 *    email form before mounting the code form. No DOM reuse, no autofill
 *    confusion, no stale focus.
 */
const SS_KEY = (slug: string) => `fp_edit_access:${slug}`

type Persisted = { step: 'email' | 'code'; email: string }

function readSession(slug: string): Persisted | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SS_KEY(slug))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p && (p.step === 'email' || p.step === 'code') && typeof p.email === 'string') return p
  } catch {}
  return null
}

function writeSession(slug: string, p: Persisted) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(SS_KEY(slug), JSON.stringify(p)) } catch {}
}

function clearSession(slug: string) {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(SS_KEY(slug)) } catch {}
}

type InitialState = {
  step: 'email' | 'code'
  email: string
  code: string
  hadUrlParams: boolean
}

function initialState(slug: string): InitialState {
  if (typeof window === 'undefined') {
    return { step: 'email', email: '', code: '', hadUrlParams: false }
  }
  const params = new URL(window.location.href).searchParams
  const urlEmail = (params.get('email') || '').trim().toLowerCase()
  const urlSent = params.get('sent') === '1'
  const urlCode = (params.get('code') || '').replace(/\D/g, '').slice(0, 6)
  const hadUrlParams = !!(urlEmail || urlSent || urlCode)

  const ss = readSession(slug)

  // URL is the freshest signal (the user just clicked a link in their
  // inbox). Honor it. sessionStorage fills in anything URL didn't say.
  const email = urlEmail || ss?.email || ''
  const step: 'email' | 'code' =
    urlSent ? 'code' :
    ss?.step === 'code' && (urlEmail ? urlEmail === ss.email : true) ? 'code' :
    'email'

  return { step, email, code: urlCode, hadUrlParams }
}

export default function EditAccessScreen({ slug }: { slug: string }) {
  const initial = useRef<InitialState>(undefined as unknown as InitialState)
  if (initial.current === undefined) initial.current = initialState(slug)

  const [step, setStep] = useState<'email' | 'code'>(initial.current.step)
  const [email, setEmail] = useState<string>(initial.current.email)
  const [code, setCode] = useState<string>(initial.current.code)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendNotice, setResendNotice] = useState<string | null>(null)
  const firstWrite = useRef(true)

  // Strip URL params after the first paint so a refresh doesn't keep
  // re-applying them, and keep the address bar clean.
  useEffect(() => {
    if (!initial.current.hadUrlParams) return
    const u = new URL(window.location.href)
    let changed = false
    for (const k of ['email', 'sent', 'code']) {
      if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true }
    }
    if (changed) window.history.replaceState({}, '', u.toString())
  }, [])

  // Persist on every step/email change. Skip the very first run so the
  // initial render's defaults can never overwrite a freshly-read
  // sessionStorage value (which would happen if the lazy init somehow
  // didn't pick it up — defensive). Subsequent writes carry through
  // every actual transition.
  useEffect(() => {
    if (firstWrite.current) {
      firstWrite.current = false
      // If we have a non-default initial state, mirror it into ss now
      // so a strict-mode unmount/remount finds it.
      if (step !== 'email' || email !== '') writeSession(slug, { step, email })
      return
    }
    writeSession(slug, { step, email })
  }, [slug, step, email])

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/edit-access/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: trimmed }),
      })
      // start always returns 200 generic on the happy path; we move to
      // step 2 unconditionally so the user can paste a code if one
      // arrives, regardless of whether they were the actual owner.
      await res.json().catch(() => ({}))
      setEmail(trimmed)
      setStep('code')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/edit-access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: email.trim().toLowerCase(), code: trimmed }),
      })
      if (res.ok) {
        clearSession(slug)
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
    setResendNotice(null)
  }

  // One-click "send a new code" without leaving step 2. We already have
  // the email persisted, so just re-fire start. Server is rate-limited
  // (3 codes / 10 min per slug+email), so spam is bounded.
  async function resendCode() {
    if (busy) return
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setResendNotice(null)
    setCode('')
    try {
      const res = await fetch('/api/edit-access/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email: trimmed }),
      })
      await res.json().catch(() => ({}))
      setResendNotice('new code sent. check your email.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── styles ──
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
    boxSizing: 'border-box',
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
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 11,
    letterSpacing: '0.06em',
    color: '#777780',
    textTransform: 'lowercase',
  }
  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 18,
    lineHeight: 1.3,
    color: '#d4c5a9',
    letterSpacing: '0.02em',
    textTransform: 'lowercase',
  }
  const subtitleStyle: React.CSSProperties = {
    margin: '8px 0 24px 0',
    fontFamily: "'DM Mono', 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 1.6,
    color: '#888890',
    letterSpacing: '0.02em',
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

  // ── render ──
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
          <form key="step-email" onSubmit={sendCode} noValidate>
            <p style={{ ...labelStyle, margin: '0 0 12px 0' }}>edit footprint</p>
            <h1 style={titleStyle}>enter your email</h1>
            <p style={subtitleStyle}>
              the email used to claim footprint.onl/{slug}.
            </p>
            <input
              key="email-input"
              type="email"
              name="email"
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
          <form key="step-code" onSubmit={verifyCode} noValidate>
            <p style={{ ...labelStyle, margin: '0 0 12px 0' }}>edit footprint</p>
            <h1 style={titleStyle}>enter code</h1>
            <p style={subtitleStyle}>
              {email
                ? <>we sent a 6-digit code to <span style={{ color: '#d4c5a9' }}>{email}</span>.</>
                : 'enter the 6-digit code from your email.'}
            </p>
            <input
              key="code-input"
              type="text"
              name="otp"
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
              <div style={{ marginTop: 16 }}>
                <p style={{ ...labelStyle, margin: 0, color: '#c87878' }}>{error}</p>
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={busy}
                  style={{ ...linkStyle, marginTop: 8 }}
                >
                  send a new code
                </button>
              </div>
            )}
            {resendNotice && !error && (
              <p style={{ ...labelStyle, marginTop: 16, color: '#888890' }}>{resendNotice}</p>
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
