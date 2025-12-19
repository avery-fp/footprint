'use client'

import { useState, useEffect } from 'react'
import AnalyticsChart from './AnalyticsChart'

interface AnalyticsPanelProps {
  footprintId: string
}

interface AnalyticsData {
  total_views: number
  unique_visitors: number
  views_over_time: { date: string; views: number }[]
  top_referrers: { domain: string; count: number }[]
}

/**
 * Analytics Panel Component
 * 
 * A compact analytics view for the editor sidebar.
 * Shows key metrics at a glance:
 * - Total views
 * - Unique visitors
 * - Views over time chart
 * - Top referrers
 * 
 * Data refreshes on mount and can be manually refreshed.
 * The design is intentionally minimal - users who want deep analytics
 * can click through to a full analytics page (future feature).
 */
export default function AnalyticsPanel({ footprintId }: AnalyticsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAnalytics()
  }, [footprintId])

  async function fetchAnalytics() {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/analytics?footprint_id=${footprintId}`)
      
      if (!res.ok) {
        throw new Error('Failed to load analytics')
      }

      const analyticsData = await res.json()
      setData(analyticsData)

    } catch (err) {
      setError('Could not load analytics')
    } finally {
      setLoading(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted,rgba(255,255,255,0.4))]">
            Analytics
          </span>
        </div>
        <div className="h-32 rounded-lg bg-[var(--glass,rgba(255,255,255,0.08))] animate-pulse" />
      </div>
    )
  }

  // Error state
  if (error || !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted,rgba(255,255,255,0.4))]">
            Analytics
          </span>
          <button
            onClick={fetchAnalytics}
            className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            Retry
          </button>
        </div>
        <div className="text-sm text-[var(--text-muted)]">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-widest uppercase text-[var(--text-muted,rgba(255,255,255,0.4))]">
          Analytics
        </span>
        <button
          onClick={fetchAnalytics}
          className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          ↻
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[var(--glass,rgba(255,255,255,0.08))] p-3">
          <div className="text-2xl font-light">{data.total_views.toLocaleString()}</div>
          <div className="font-mono text-xs text-[var(--text-muted)] mt-1">Views</div>
        </div>
        <div className="rounded-lg bg-[var(--glass,rgba(255,255,255,0.08))] p-3">
          <div className="text-2xl font-light">{data.unique_visitors.toLocaleString()}</div>
          <div className="font-mono text-xs text-[var(--text-muted)] mt-1">Visitors</div>
        </div>
      </div>

      {/* Chart */}
      {data.views_over_time.length > 0 && (
        <div className="rounded-lg bg-[var(--glass,rgba(255,255,255,0.08))] p-3">
          <div className="font-mono text-xs text-[var(--text-muted)] mb-3">Last 30 days</div>
          <AnalyticsChart data={data.views_over_time} height={100} />
        </div>
      )}

      {/* Top referrers */}
      {data.top_referrers.length > 0 && (
        <div className="rounded-lg bg-[var(--glass,rgba(255,255,255,0.08))] p-3">
          <div className="font-mono text-xs text-[var(--text-muted)] mb-3">Top referrers</div>
          <div className="space-y-2">
            {data.top_referrers.slice(0, 5).map((ref) => (
              <div key={ref.domain} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{ref.domain}</span>
                <span className="font-mono text-xs text-[var(--text-muted)] ml-2">
                  {ref.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for new footprints */}
      {data.total_views === 0 && (
        <div className="text-center py-4 text-sm text-[var(--text-muted)]">
          No views yet. Share your link!
        </div>
      )}
    </div>
  )
}
