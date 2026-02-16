/**
 * CLOCK AGENT — Trend scanner.
 *
 * Scans Bing News for trending topics, scores urgency,
 * outputs nouns ready for the taste agent.
 *
 * Categories: culture, sports, music, fashion, tech, art
 */

import { getConfig } from '../env.js'
import type { ClockNoun } from '../types.js'

const CATEGORIES = ['culture', 'sports', 'music', 'fashion', 'tech', 'art'] as const

// Bing News search queries per category — tuned for footprint-worthy topics
const CATEGORY_QUERIES: Record<string, string[]> = {
  culture: ['viral culture moment today', 'trending pop culture'],
  sports: ['sports highlight today', 'athlete trending moment'],
  music: ['new album release trending', 'music artist viral moment'],
  fashion: ['fashion trend aesthetic', 'streetwear drop trending'],
  tech: ['tech product launch trending', 'viral tech moment'],
  art: ['art exhibition trending', 'viral art design moment'],
}

interface BingNewsArticle {
  name: string
  description: string
  datePublished: string
  category?: string
}

async function searchNews(query: string, count: number = 10): Promise<BingNewsArticle[]> {
  const config = getConfig()

  const params = new URLSearchParams({
    q: query,
    count: String(count),
    freshness: 'Week',
    sortBy: 'Relevance',
    mkt: 'en-US',
  })

  const response = await fetch(`https://api.bing.microsoft.com/v7.0/news/search?${params}`, {
    headers: { 'Ocp-Apim-Subscription-Key': config.BING_API_KEY },
  })

  if (!response.ok) {
    console.error(`Bing News failed for "${query}": ${response.status}`)
    return []
  }

  const data = await response.json()
  return data.value || []
}

/**
 * Extract a clean noun from a news headline.
 * Uses heuristics — strips filler words, focuses on the subject.
 */
function extractNoun(headline: string): string {
  // Remove common filler patterns
  let noun = headline
    .replace(/^(breaking|watch|exclusive|report|opinion|review):\s*/i, '')
    .replace(/\s*[-—|]\s*.+$/, '')  // Remove "— Source Name"
    .replace(/\s*\(.*?\)\s*/g, '')  // Remove parentheticals
    .replace(/[''""\u2018\u2019\u201C\u201D]/g, '')
    .trim()

  // If still too long, take first meaningful chunk
  if (noun.length > 60) {
    const parts = noun.split(/[,;:]/)
    noun = parts[0].trim()
  }

  return noun
}

/**
 * Score urgency based on recency and headline signals.
 * Returns 0–1 where 1 = mint immediately.
 */
function scoreUrgency(article: BingNewsArticle): number {
  let score = 0.5

  // Recency boost
  const ageHours = (Date.now() - new Date(article.datePublished).getTime()) / (1000 * 60 * 60)
  if (ageHours < 6) score += 0.3
  else if (ageHours < 24) score += 0.2
  else if (ageHours < 48) score += 0.1

  // Viral/trending signal words
  const virals = /viral|trending|breaks?( the)? internet|moment|iconic|legendary/i
  if (virals.test(article.name) || virals.test(article.description)) {
    score += 0.15
  }

  // Visual topics get a boost (more image-friendly)
  const visual = /photo|image|look|style|fashion|aesthetic|art|design|performance|concert/i
  if (visual.test(article.name) || visual.test(article.description)) {
    score += 0.1
  }

  return Math.min(1, score)
}

/**
 * Deduplicate nouns by similarity (simple token overlap).
 */
function dedupeNouns(nouns: ClockNoun[]): ClockNoun[] {
  const result: ClockNoun[] = []
  const seenTokens = new Set<string>()

  for (const noun of nouns) {
    const tokens = noun.noun.toLowerCase().split(/\s+/).filter(t => t.length > 3)
    const key = tokens.sort().join(' ')
    if (!seenTokens.has(key)) {
      seenTokens.add(key)
      result.push(noun)
    }
  }

  return result
}

// ─── Main: scan ─────────────────────────────────────────

export async function scan(categories?: string[]): Promise<ClockNoun[]> {
  const cats = categories || [...CATEGORIES]
  console.log(`  [clock] scanning ${cats.length} categories...`)

  // Search all categories in parallel
  const searchPromises = cats.flatMap(category => {
    const queries = CATEGORY_QUERIES[category] || [`${category} trending today`]
    return queries.map(async (query): Promise<ClockNoun[]> => {
      const articles = await searchNews(query, 8)
      return articles.map(article => ({
        noun: extractNoun(article.name),
        urgency: scoreUrgency(article),
        source: 'bing-news',
        category,
        trend_score: scoreUrgency(article),
        snippet: article.description?.slice(0, 200) || '',
      }))
    })
  })

  const results = await Promise.all(searchPromises)
  const allNouns = results.flat()

  // Dedupe, sort by urgency (highest first)
  const deduped = dedupeNouns(allNouns)
  deduped.sort((a, b) => b.urgency - a.urgency)

  console.log(`  [clock] found ${deduped.length} unique nouns (from ${allNouns.length} raw)`)

  return deduped
}
