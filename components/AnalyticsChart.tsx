'use client'

import { useMemo } from 'react'

interface ViewData {
  date: string
  views: number
}

interface AnalyticsChartProps {
  data: ViewData[]
  height?: number
}

/**
 * Analytics Chart Component
 * 
 * A simple, beautiful bar chart for displaying views over time.
 * Built with pure SVG - no chart libraries needed.
 * 
 * Why custom SVG instead of recharts/chart.js?
 * - Smaller bundle size
 * - Perfect control over aesthetics
 * - Matches our design system exactly
 * - No dependency on external libraries
 * 
 * The chart shows the last 30 days with:
 * - Vertical bars for each day
 * - Hover states showing exact values
 * - Smooth animations
 * - Responsive sizing
 */
export default function AnalyticsChart({ data, height = 200 }: AnalyticsChartProps) {
  // Ensure we have 30 days of data (fill gaps with zeros)
  const chartData = useMemo(() => {
    const last30Days: ViewData[] = []
    const today = new Date()
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      
      const existing = data.find(d => d.date === dateStr)
      last30Days.push({
        date: dateStr,
        views: existing?.views || 0,
      })
    }
    
    return last30Days
  }, [data])

  // Calculate max value for scaling
  const maxViews = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.views), 1)
    // Round up to nice number
    return Math.ceil(max / 10) * 10 || 10
  }, [chartData])

  // Chart dimensions
  const padding = { top: 20, right: 10, bottom: 30, left: 40 }
  const chartWidth = 100 // percentage based
  const barWidth = 2.5 // percentage
  const barGap = 0.8 // percentage

  // Format date for tooltip
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            y1={padding.top + (height - padding.top - padding.bottom) * (1 - ratio)}
            x2="100"
            y2={padding.top + (height - padding.top - padding.bottom) * (1 - ratio)}
            stroke="var(--border, rgba(255,255,255,0.1))"
            strokeWidth="0.5"
          />
        ))}

        {/* Bars */}
        {chartData.map((item, index) => {
          const barHeight = (item.views / maxViews) * (height - padding.top - padding.bottom)
          const x = padding.left / 100 * 100 + index * (barWidth + barGap)
          const y = height - padding.bottom - barHeight

          return (
            <g key={item.date} className="group">
              {/* Bar */}
              <rect
                x={`${x}%`}
                y={y}
                width={`${barWidth}%`}
                height={Math.max(barHeight, 1)}
                rx="1"
                fill="var(--accent, #F5F5F5)"
                opacity={item.views > 0 ? 0.8 : 0.2}
                className="transition-opacity duration-150 hover:opacity-100"
              />
              
              {/* Hover area (larger for easier interaction) */}
              <rect
                x={`${x - barGap / 2}%`}
                y={padding.top}
                width={`${barWidth + barGap}%`}
                height={height - padding.top - padding.bottom}
                fill="transparent"
                className="cursor-pointer"
              >
                <title>{`${formatDate(item.date)}: ${item.views} views`}</title>
              </rect>
            </g>
          )
        })}
      </svg>

      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-5 pointer-events-none">
        <span className="font-mono text-xs text-[var(--text-muted,rgba(255,255,255,0.4))]">
          {maxViews}
        </span>
        <span className="font-mono text-xs text-[var(--text-muted,rgba(255,255,255,0.4))]">
          0
        </span>
      </div>

      {/* X-axis labels */}
      <div className="absolute bottom-0 left-10 right-2 flex justify-between pointer-events-none">
        <span className="font-mono text-xs text-[var(--text-muted,rgba(255,255,255,0.4))]">
          30d ago
        </span>
        <span className="font-mono text-xs text-[var(--text-muted,rgba(255,255,255,0.4))]">
          Today
        </span>
      </div>
    </div>
  )
}
