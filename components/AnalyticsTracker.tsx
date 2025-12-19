'use client'

import { useEffect } from 'react'

interface AnalyticsTrackerProps {
  footprintId: string
}

/**
 * Analytics Tracker Component
 * 
 * A client-side component that fires a view event when
 * the page loads. Placed on public footprint pages to
 * track visitor stats.
 * 
 * The tracking is fire-and-forget - we don't wait for a response
 * and failures are silently ignored. This ensures analytics
 * never slow down or break the page experience.
 * 
 * Privacy considerations:
 * - We hash IP addresses before storing
 * - We don't use cookies or persistent identifiers
 * - Users can see their own analytics but not visitor details
 */
export default function AnalyticsTracker({ footprintId }: AnalyticsTrackerProps) {
  useEffect(() => {
    // Fire the view event
    // Using setTimeout to ensure it doesn't block the initial render
    const timer = setTimeout(() => {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ footprint_id: footprintId }),
      }).catch(() => {
        // Silently ignore errors - analytics shouldn't break the page
      })
    }, 100)

    return () => clearTimeout(timer)
  }, [footprintId])

  // This component doesn't render anything
  return null
}
