'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function MakeYoursCTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isLoggedIn) return
    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [isLoggedIn])

  if (isLoggedIn) return null

  return (
    <Link
      href="/signup"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white/25 hover:text-white/50 transition-all duration-500 text-[13px] tracking-[0.1em]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, 8px)',
        transition: 'opacity 1s ease, transform 1s ease, color 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      make yours
    </Link>
  )
}
