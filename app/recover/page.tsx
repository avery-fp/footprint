'use client'

import { FormEvent, useState } from 'react'

export default function RecoverPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)

    try {
      await fetch('/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // Keep the same user-facing response for enumeration resistance.
    } finally {
      setSent(true)
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#050505] text-white flex items-center justify-center px-6 font-mono">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-white/25">footprint</p>
          <h1 className="text-xl text-white/80 font-normal">recover edit link</h1>
        </div>

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email"
          autoComplete="email"
          required
          className="w-full rounded-none border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80 outline-none transition placeholder:text-white/20 focus:border-white/30"
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/60 transition hover:bg-white/[0.10] hover:text-white/80 disabled:opacity-40"
        >
          {submitting ? 'sending' : 'send'}
        </button>

        {sent && (
          <p className="text-sm leading-6 text-white/40">
            if this email has a footprint, an edit link is on its way.
          </p>
        )}
      </form>
    </main>
  )
}
