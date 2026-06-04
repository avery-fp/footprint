'use client'

import { useEffect } from 'react'

const LAST_COORDINATE_KEY = 'fp_pwa:last_coordinate'
const LAST_PATH_KEY = 'fp_pwa:last_path'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    (navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function safePath(value: string | null) {
  if (!value || !value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  return value
}

export default function PwaLaunchRestore() {
  useEffect(() => {
    if (!isStandalone()) return

    const { pathname, search, hash } = window.location
    const current = `${pathname}${search}${hash}`

    if (pathname !== '/') {
      try {
        window.localStorage.setItem(LAST_PATH_KEY, current)
        const [, slug] = pathname.split('/')
        if (slug) window.localStorage.setItem(LAST_COORDINATE_KEY, slug)
      } catch {}
      return
    }

    try {
      const lastPath = safePath(window.localStorage.getItem(LAST_PATH_KEY))
      if (lastPath && lastPath !== current) {
        window.location.replace(lastPath)
        return
      }

      const lastCoordinate = window.localStorage.getItem(LAST_COORDINATE_KEY)
      if (lastCoordinate) window.location.replace(`/${encodeURIComponent(lastCoordinate)}`)
    } catch {}
  }, [])

  return null
}
