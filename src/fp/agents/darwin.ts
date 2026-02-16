/**
 * DARWIN AGENT — Measures conversions, feeds back to taste.
 *
 * Reads deployment stats from GET /api/aro/stats.
 * Analyzes which themes, categories, and surfaces convert best.
 * Produces DarwinFeedback that steers future taste decisions.
 *
 * Runs weekly on cron. Feedback is passed to taste.curate().
 */

import { getConfig } from '../env.js'
import type { DarwinFeedback } from '../types.js'

interface StatsResponse {
  totals: { posts: number; clicks: number; conversions: number }
  by_channel: Record<string, { posts: number; clicks: number; conversions: number }>
  by_pack: Record<string, { posts: number; clicks: number; conversions: number }>
  by_surface: Record<string, { posts: number; clicks: number; conversions: number }>
  recent: any[]
  days: number
}

// ─── Fetch stats ────────────────────────────────────────

async function fetchStats(days: number): Promise<StatsResponse> {
  const config = getConfig()

  const params = new URLSearchParams({
    aro_key: config.ARO_KEY,
    days: String(days),
  })

  const response = await fetch(`${config.FP_BASE_URL}/api/aro/stats?${params}`)

  if (!response.ok) {
    throw new Error(`Stats API error ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

// ─── Extract theme/category from event metadata ─────────

function extractMeta(events: any[]): { themes: Record<string, number>; categories: Record<string, number> } {
  const themes: Record<string, number> = {}
  const categories: Record<string, number> = {}

  for (const event of events) {
    const notes = event.notes || ''
    const captionTone = event.caption_tone || ''

    // Try to extract theme from pack_id or notes
    const themeMatch = notes.match(/theme[=:](\w+)/i) || captionTone.match(/theme[=:](\w+)/i)
    if (themeMatch) {
      const theme = themeMatch[1]
      themes[theme] = (themes[theme] || 0) + (event.conversions || 0)
    }

    // Category from pack_id pattern (e.g., "sports-nba-2026")
    const packId = event.pack_id || ''
    const catMatch = packId.match(/^(culture|sports|music|fashion|tech|art)/i)
    if (catMatch) {
      const cat = catMatch[1].toLowerCase()
      categories[cat] = (categories[cat] || 0) + (event.conversions || 0)
    }
  }

  return { themes, categories }
}

// ─── Rank by conversion rate ────────────────────────────

function rankByConversionRate(
  data: Record<string, { posts: number; clicks: number; conversions: number }>
): string[] {
  return Object.entries(data)
    .filter(([_, v]) => v.posts >= 2)  // Minimum sample size
    .sort((a, b) => {
      const rateA = a[1].clicks > 0 ? a[1].conversions / a[1].clicks : 0
      const rateB = b[1].clicks > 0 ? b[1].conversions / b[1].clicks : 0
      return rateB - rateA
    })
    .map(([k]) => k)
}

// ─── Generate recommendations ───────────────────────────

function generateRecommendations(stats: StatsResponse, meta: ReturnType<typeof extractMeta>): string[] {
  const recs: string[] = []
  const { totals, by_surface } = stats

  // Overall conversion rate
  const overallRate = totals.clicks > 0 ? totals.conversions / totals.clicks : 0

  if (overallRate < 0.01) {
    recs.push('Conversion rate below 1% — experiment with more visually striking rooms')
  }

  if (overallRate > 0.05) {
    recs.push('Strong conversion rate — maintain current creative direction')
  }

  // Surface-specific
  const surfaceRanked = rankByConversionRate(by_surface)
  if (surfaceRanked.length > 0) {
    recs.push(`Top surface: ${surfaceRanked[0]} — increase deployment volume there`)
  }

  const worstSurface = surfaceRanked[surfaceRanked.length - 1]
  if (worstSurface && by_surface[worstSurface]?.posts >= 5 && by_surface[worstSurface]?.conversions === 0) {
    recs.push(`${worstSurface} has zero conversions — consider pausing or changing strategy`)
  }

  // Theme recommendations
  const topThemes = Object.entries(meta.themes)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)

  if (topThemes.length > 0) {
    recs.push(`Top-converting theme: ${topThemes[0]}`)
  }

  // Volume check
  if (totals.posts < 10) {
    recs.push('Low sample size — increase deployment volume for reliable data')
  }

  return recs
}

// ─── Main: analyze ──────────────────────────────────────

export async function analyze(days: number = 30): Promise<DarwinFeedback> {
  console.log(`  [darwin] analyzing ${days} days of data...`)

  const stats = await fetchStats(days)
  const meta = extractMeta(stats.recent)

  const { totals, by_surface } = stats

  // Top themes by conversion count
  const topThemes = Object.entries(meta.themes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)

  // Top categories
  const topCategories = Object.entries(meta.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)

  // Themes to avoid (zero conversions with enough data)
  const avoidThemes = Object.entries(meta.themes)
    .filter(([_, v]) => v === 0)
    .map(([k]) => k)

  // Best surfaces
  const bestSurfaces = rankByConversionRate(by_surface).slice(0, 3)

  // Overall conversion rate
  const conversionRate = totals.clicks > 0 ? totals.conversions / totals.clicks : 0

  const recommendations = generateRecommendations(stats, meta)

  const feedback: DarwinFeedback = {
    top_themes: topThemes.length > 0 ? topThemes : ['midnight'],
    top_categories: topCategories.length > 0 ? topCategories : ['culture', 'music'],
    avoid_themes: avoidThemes,
    conversion_rate: Math.round(conversionRate * 10000) / 10000,
    best_surfaces: bestSurfaces.length > 0 ? bestSurfaces : ['reddit', 'twitter'],
    sample_size: totals.posts,
    recommendations,
  }

  console.log(`  [darwin] analysis complete:`)
  console.log(`    posts=${totals.posts} clicks=${totals.clicks} conversions=${totals.conversions}`)
  console.log(`    rate=${(conversionRate * 100).toFixed(2)}%`)
  console.log(`    top themes: ${feedback.top_themes.join(', ')}`)
  console.log(`    best surfaces: ${feedback.best_surfaces.join(', ')}`)
  console.log(`    recommendations: ${recommendations.length}`)

  return feedback
}
