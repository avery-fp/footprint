'use client'

import { useEffect, useState } from 'react'

const GENERIC_ERROR = 'couldn’t open'

export default function ReturnPage() {
  const [identifier, setIdentifier] = useState('')
  const [ownerKey, setOwnerKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const searchParams = new URL(window.location.href).searchParams
    const username = searchParams.get('username')
    if (username) setIdentifier(username)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!identifier.trim() || !/^\d{6,8}$/.test(ownerKey)) {
      setError(GENERIC_ERROR)
      return
    }

    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/owner/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, ownerKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.destination) {
        window.location.href = data.destination
        return
      }
      setError(GENERIC_ERROR)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#0c0c10] text-[#d4c5a9] flex items-center justify-center px-6 py-10">
      <form onSubmit={submit} className="w-full max-w-[320px]" noValidate>
        <h1 className="font-mono text-[18px] leading-none lowercase tracking-[0.02em] mb-10">return</h1>

        <label className="block font-mono text-[11px] lowercase tracking-[0.06em] text-white/42 mb-2">
          username
        </label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => { setIdentifier(e.target.value); setError('') }}
          placeholder="username"
          autoComplete="username"
          autoCapitalize="none"
          className="w-full rounded-[4px] border border-white/[0.1] bg-white/[0.04] px-4 py-3.5 font-mono text-[14px] text-[#d4c5a9] outline-none placeholder:text-white/18"
          autoFocus
        />
        <p className="mt-2 mb-6 font-mono text-[11px] lowercase tracking-[0.04em] text-white/28">FP# works too</p>

        <label className="block font-mono text-[11px] lowercase tracking-[0.06em] text-white/42 mb-2">
          owner key
        </label>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          value={ownerKey}
          onChange={(e) => { setOwnerKey(e.target.value.replace(/\D/g, '').slice(0, 8)); setError('') }}
          placeholder="••••••"
          autoComplete="off"
          className="w-full rounded-[4px] border border-white/[0.1] bg-white/[0.04] px-4 py-3.5 font-mono text-[14px] text-[#d4c5a9] outline-none placeholder:text-white/18"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-7 w-full rounded-[4px] bg-[#d4c5a9] px-4 py-3.5 font-mono text-[13px] lowercase tracking-[0.06em] text-[#0c0c10] transition disabled:opacity-60"
        >
          open →
        </button>

        {error && (
          <p className="mt-4 font-mono text-[11px] lowercase tracking-[0.04em] text-[#c87878]">
            {GENERIC_ERROR}
          </p>
        )}
      </form>
    </main>
  )
}
