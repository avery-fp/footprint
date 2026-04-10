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
      href="/login?redirect=%2Fhome"
      className="fixed inset-x-0 bottom-6 z-50 px-4 text-center text-white/25 hover:text-white/50 transition-all duration-500 text-[13px] tracking-[0.1em]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 1s ease, transform 1s ease, color 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      make yours
    </Link>
  )
}
