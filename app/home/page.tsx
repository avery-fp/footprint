'use client'

import { useEffect, useRef, useState } from 'react'

export default function HomeDraftStartPage() {
  const startedRef = useRef(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    async function startDraft() {
      try {
        const res = await fetch('/api/draft/create', { method: 'POST' })
        const data = await res.json()
        if (res.ok && data?.tempSlug) {
          window.location.href = `/${data.tempSlug}/home`
          return
        }
      } catch {
        // Fall through to the quiet retry state.
      }
      setError(true)
    }

    startDraft()
  }, [])

  return (
    <main className="min-h-[100dvh] bg-[#050505] text-white flex items-center justify-center px-6 font-mono">
      <div className="text-center space-y-4">
        <div className="mx-auto h-6 w-6 rounded-full border border-white/10 border-t-white/50 animate-spin" />
        <p className="text-sm text-white/35">{error ? 'try again' : 'preparing your draft'}</p>
        {error && (
          <button
            type="button"
            onClick={() => {
              setError(false)
              startedRef.current = false
              window.location.reload()
            }}
            className="border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-white/50 transition hover:bg-white/[0.10] hover:text-white/75"
          >
            restart
          </button>
        )}
      </div>
    </main>
  )
}
