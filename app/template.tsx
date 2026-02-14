'use client'

import { useEffect, useRef } from 'react'

export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.opacity = '0'
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.style.transition = 'opacity 0.4s ease'
          ref.current.style.opacity = '1'
        }
      })
    }
  }, [])

  return <div ref={ref}>{children}</div>
}
