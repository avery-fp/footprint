'use client'

import { useEffect } from 'react'

interface AnalyticsTrackerProps {
  footprintId: string
  serialNumber?: number
}

/**
 * Analytics Tracker Component
 *
 * A client-side component that fires a view event when
 * the page loads. Placed on public footprint pages to
 * track visitor stats.
 *
 * Also captures UTM params for distribution tracking:
 * ?utm_pack=nba-allstar&utm_channel=reddit&utm_surface=r-nba
 *
 * Privacy considerations:
 * - We hash IP addresses before storing
 * - We don't use cookies or persistent identifiers
 * - Users can see their own analytics but not visitor details
 */
export default function AnalyticsTracker({ footprintId, serialNumber }: AnalyticsTrackerProps) {
  useEffect(() => {
    if (!footprintId) return // see EventTracker — undefined ID was the 400 source
    const timer = setTimeout(() => {
      // Fire the view event
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ footprint_id: footprintId }),
      }).catch(() => {})

      // Track UTM params if present (distribution attribution)
      if (serialNumber) {
        const params = new URLSearchParams(window.location.search)
        const utmPack = params.get('utm_pack')
        const utmChannel = params.get('utm_channel')
        const utmSurface = params.get('utm_surface')

        if (utmPack || utmChannel) {
          fetch('/api/aro/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              footprint_id: footprintId,
              serial_number: serialNumber,
              utm_pack: utmPack,
              utm_channel: utmChannel,
              utm_surface: utmSurface,
            }),
          }).catch(() => {})

          // Store UTM params in sessionStorage for checkout attribution
          if (utmPack) sessionStorage.setItem('fp_utm_pack', utmPack)
          if (utmChannel) sessionStorage.setItem('fp_utm_channel', utmChannel)
          if (utmSurface) sessionStorage.setItem('fp_utm_surface', utmSurface)
        }
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [footprintId, serialNumber])

  return null
}
