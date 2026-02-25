'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function DashboardPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    async function redirect() {
      try {
        const roomsRes = await fetch('/api/rooms')
        const roomsData = await roomsRes.json()

        if (roomsRes.ok && roomsData.rooms?.length > 0) {
          const primary = roomsData.rooms.find((r: any) => r.is_primary) || roomsData.rooms[0]
          router.replace(`/${primary.slug}/home`)
        } else {
          // No rooms yet — send to build/onboarding
          router.replace('/build')
        }
      } catch {
        setError('Failed to load. Try refreshing.')
      }
    }

    redirect()
  }, [router])

  return (
    <ErrorBoundary context="dashboard">
      <div className="min-h-screen flex items-center justify-center">
        {error ? (
          <p className="text-white/40 text-sm">{error}</p>
        ) : (
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
        )}
      </div>
    </ErrorBoundary>
  )
}
