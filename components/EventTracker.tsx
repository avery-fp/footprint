'use client'

import { useEffect } from 'react'

interface EventTrackerProps {
  footprintId: string
}

/**
 * EventTracker — client component that:
 * 1. Records a 'visit' event on page load
 * 2. Records 'referral_visit' if ?ref= param present
 * 3. Attaches click listeners to tiles for 'tile_click' events
 * 4. Records 'share' events when Web Share API is used
 *
 * Sits invisibly on the public footprint page.
 * All events feed into /api/events → fp_events table → /api/aro-feed.
 */
export default function EventTracker({ footprintId }: EventTrackerProps) {
  useEffect(() => {
    // Don't fire events if footprintId is missing — wastes requests + fills
    // server logs with 400s. This was the bug: pre-fix we received undefined
    // and POSTed with no footprint_id field, which the schema rejected.
    if (!footprintId) return

    // 1. Visit event
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ footprint_id: footprintId, event_type: 'visit' }),
    }).catch(() => {})

    // 2. Referral visit
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          footprint_id: footprintId,
          event_type: 'referral_visit',
          event_data: { referral_code: ref },
        }),
      }).catch(() => {})

      // Store ref for checkout attribution
      sessionStorage.setItem('fp_ref', ref)
    }

    // 3. Tile click tracking via event delegation
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      const tile = target.closest('[data-tile-id]') as HTMLElement | null
      if (tile) {
        const tileId = tile.getAttribute('data-tile-id')
        const tileType = tile.getAttribute('data-tile-type') || 'unknown'
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            footprint_id: footprintId,
            event_type: 'tile_click',
            event_data: { tile_id: tileId, tile_type: tileType },
          }),
        }).catch(() => {})
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [footprintId])

  return null
}
