/**
 * TASTE AGENT — The creative core of the pipeline.
 *
 * noun in → mint payload out.
 *
 * This is the most critical agent. It decides what a room looks like.
 * Every output must produce pages indistinguishable from footprint.onl/ae.
 *
 * Flow:
 *   1. Claude generates a creative brief from the noun (includes is_moment flag)
 *   2. Image sourcing routes by is_moment:
 *      - MOMENT (is_moment=true): Google CSE (dateRestrict=d1) → Unsplash → Bing
 *      - EVERGREEN (is_moment=false): Unsplash → Bing
 *   3. Claude Haiku scores all candidate images 1-10 on ae standard
 *      - Only images scoring 7+ pass through
 *   4. Spotify Search finds a matching track
 *   5. Best image becomes the wallpaper
 *   6. Returns a complete MintPayload ready for /api/aro/mint
 */

import { getConfig } from '../env.js'
import type { TasteInput, CreativeBrief, MintPayload, DarwinFeedback } from '../types.js'

// ─── Claude: generate creative brief ────────────────────

const SYSTEM_PROMPT = `You are the creative director for footprint.onl — a $10 digital identity product.
Each footprint is a curated page: images + music on a dark, minimal canvas.

The quality bar is footprint.onl/ae. Study its aesthetic:
- Clean, lowercase display name (just "æ")
- Midnight dark theme with blurred wallpaper background
- 6-8 high-quality, curated images — editorial, not stock
- One Spotify embed for vibe
- Minimal or empty bio
- Every element feels intentionally chosen by a person with great taste

You output creative briefs that produce this exact quality level.
You ONLY output valid JSON. No markdown, no explanation.`

function buildUserPrompt(noun: string, feedback?: DarwinFeedback): string {
  let prompt = `Create a footprint room for: "${noun}"

Output valid JSON:
{
  "slug": "2-3 word slug, lowercase, hyphens, memorable",
  "display_name": "aesthetic lowercase name for the page header",
  "bio": "one short line or empty string — less is more",
  "theme_id": "midnight",
  "is_moment": false,
  "image_queries": ["4-6 specific search queries for Unsplash/image search"],
  "wallpaper_query": "one atmospheric/moody query for the blurred background",
  "music_query": "spotify search query for a track that matches the vibe",
  "embed_queries": []
}

Rules:
- is_moment: true if the noun is a live/recent event, game, award show, breaking news, trending topic, or anything time-sensitive where photos from the last 24-48h matter. false for evergreen topics (cities, genres, aesthetics, people in general).
- slug: 2-4 words, lowercase, hyphens. Must feel like a curated room name.
- display_name: what appears at the top of the page. Lowercase. Think: "æ", "drake", "tokyo nights". Not: "Drake's Album", "TOKYO".
- bio: empty string for most topics. Only add if truly needed.
- theme_id: "midnight" for 70% of rooms. "ocean" for water/calm. "ember" for warm/cultural. "forest" for nature. "violet" for creative/music.
- image_queries: These search Unsplash first (high-quality editorial photos), then Bing as fallback.
  - Be specific but natural: "courtside basketball photography" NOT "lebron james editorial photography"
  - Unsplash excels at: aesthetic, moody, editorial photography. Lean into that.
  - For trending/niche topics, include the specific proper noun so Bing fallback can find it.
  - First query = hero image (will be large tile)
  - Vary angles: close-ups, wide shots, details, atmosphere
- wallpaper_query: finds the blurred background. Atmospheric, moody, textural.
  - Example: "dark arena atmosphere" or "neon city rain night"
- music_query: search Spotify. Match the vibe perfectly.
  - Example: "drake night owl dark ambient" or "tokyo lo-fi city pop"
- embed_queries: usually empty []. Only add YouTube URLs if truly essential.`

  if (feedback) {
    prompt += `\n\nDarwin feedback from recent performance:
- Top converting themes: ${feedback.top_themes.join(', ')}
- Top categories: ${feedback.top_categories.join(', ')}
- Avoid: ${feedback.avoid_themes.join(', ')}
- Best surfaces: ${feedback.best_surfaces.join(', ')}
- Recommendations: ${feedback.recommendations.join('; ')}
Adjust your creative direction based on this data.`
  }

  return prompt
}

async function generateBrief(noun: string, feedback?: DarwinFeedback): Promise<CreativeBrief> {
  const config = getConfig()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(noun, feedback) }],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Claude API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text
  if (!content) throw new Error('Empty Claude response')

  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${content.slice(0, 200)}`)

  const brief: CreativeBrief = JSON.parse(jsonMatch[0])

  // Validate required fields
  if (!brief.slug || !brief.display_name || !brief.image_queries?.length || !brief.music_query) {
    throw new Error(`Incomplete brief: missing required fields`)
  }

  // Default is_moment to false if not provided
  brief.is_moment = brief.is_moment === true

  // Sanitize slug
  brief.slug = brief.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  return brief
}

// ─── Unsplash: PRIMARY image source ─────────────────────
//
// Unsplash images are already ae-tier. Free API, no filtering needed.
// 50 req/hr on the free plan — more than enough for pipeline use.

interface UnsplashPhoto {
  urls: { regular: string; full: string; small: string }
  width: number
  height: number
  description: string | null
  alt_description: string | null
}

async function searchUnsplash(query: string, count: number = 10): Promise<string[]> {
  const config = getConfig()

  const params = new URLSearchParams({
    query,
    per_page: String(count),
    orientation: 'landscape',
  })

  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { 'Authorization': `Client-ID ${config.UNSPLASH_ACCESS_KEY}` },
  })

  if (!response.ok) {
    console.error(`  [taste] Unsplash failed for "${query}": ${response.status}`)
    return []
  }

  const data = await response.json()
  const photos: UnsplashPhoto[] = data.results || []

  // Unsplash "regular" URLs are 1080w — perfect for tiles.
  // No quality filtering needed — Unsplash curates its own library.
  return photos.map(p => p.urls.regular)
}

// ─── Bing: FALLBACK image source ────────────────────────
//
// Used when Unsplash doesn't have enough results
// (niche topics, trending events, specific people).

interface BingImage {
  contentUrl: string
  thumbnailUrl: string
  width: number
  height: number
}

async function searchBing(query: string, count: number = 8): Promise<string[]> {
  const config = getConfig()

  const params = new URLSearchParams({
    q: query,
    count: String(count),
    imageType: 'Photo',
    size: 'Large',
    safeSearch: 'Moderate',
  })

  const response = await fetch(`https://api.bing.microsoft.com/v7.0/images/search?${params}`, {
    headers: { 'Ocp-Apim-Subscription-Key': config.BING_API_KEY },
  })

  if (!response.ok) {
    console.error(`  [taste] Bing failed for "${query}": ${response.status}`)
    return []
  }

  const data = await response.json()
  const images: BingImage[] = data.value || []

  // Filter for quality: minimum 600px
  return images
    .filter(img => img.width >= 600 && img.height >= 600)
    .map(img => img.contentUrl)
}

// ─── Google Custom Search: for moment/event nouns ───────
//
// Time-sensitive topics (games, award shows, breaking news) need
// images from the last 24h. Google CSE with dateRestrict=d1 does this.
// Falls back to Unsplash if Google returns < 4 results.

interface GoogleSearchItem {
  link: string
  image?: { width: number; height: number }
}

async function searchGoogle(query: string, count: number = 10): Promise<string[]> {
  const config = getConfig()

  if (!config.GOOGLE_API_KEY || !config.GOOGLE_CX) {
    console.log(`  [taste] Google CSE not configured, skipping`)
    return []
  }

  const params = new URLSearchParams({
    key: config.GOOGLE_API_KEY,
    cx: config.GOOGLE_CX,
    q: query,
    searchType: 'image',
    num: String(Math.min(count, 10)),
    dateRestrict: 'd1',
    imgSize: 'large',
  })

  try {
    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)

    if (!response.ok) {
      console.error(`  [taste] Google CSE failed for "${query}": ${response.status}`)
      return []
    }

    const data = await response.json()
    const items: GoogleSearchItem[] = data.items || []

    return items
      .filter(item => item.image && item.image.width >= 600 && item.image.height >= 400)
      .map(item => item.link)
  } catch (err) {
    console.error(`  [taste] Google CSE error:`, err)
    return []
  }
}

// ─── Image search: routes by is_moment ──────────────────

const TARGET_IMAGES = 8
const MIN_IMAGES = 4

async function searchImages(query: string, count: number = 10, isMoment: boolean = false): Promise<string[]> {
  if (isMoment) {
    // MOMENT PATH: Google first (dateRestrict=d1) → Unsplash fallback → Bing fallback
    console.log(`  [taste] moment search: Google CSE first for "${query}"`)
    const googleResults = await searchGoogle(query, count)

    if (googleResults.length >= MIN_IMAGES) {
      return googleResults
    }

    // Google didn't have enough — fall back to Unsplash
    if (googleResults.length > 0) {
      console.log(`  [taste] Google returned ${googleResults.length} for "${query}", supplementing with Unsplash`)
    } else {
      console.log(`  [taste] Google empty for "${query}", falling back to Unsplash`)
    }

    const unsplashResults = await searchUnsplash(query, count)
    const combined = [...googleResults, ...unsplashResults]

    if (combined.length >= MIN_IMAGES) {
      return combined
    }

    // Still not enough — add Bing
    console.log(`  [taste] ${combined.length} images so far, adding Bing fallback`)
    const bingResults = await searchBing(query, count)
    return [...combined, ...bingResults]
  }

  // EVERGREEN PATH: Unsplash first → Bing fallback (original behavior)
  const unsplashResults = await searchUnsplash(query, count)

  if (unsplashResults.length >= MIN_IMAGES) {
    return unsplashResults
  }

  if (unsplashResults.length > 0) {
    console.log(`  [taste] Unsplash returned ${unsplashResults.length} for "${query}", supplementing with Bing`)
  } else {
    console.log(`  [taste] Unsplash empty for "${query}", falling back to Bing`)
  }

  const bingResults = await searchBing(query, count)
  return [...unsplashResults, ...bingResults]
}

// ─── Aesthetic scoring via Claude Haiku ──────────────────
//
// Every candidate image URL is scored 1-10 on the ae standard.
// Only images scoring 7+ make it into the final payload.
// This ensures every room hits ae quality regardless of source.

interface AeScoreEntry {
  url: string
  score: number
}

async function scoreAesthetics(imageUrls: string[]): Promise<string[]> {
  if (imageUrls.length === 0) return []

  const config = getConfig()

  const scoringPrompt = `You are the aesthetic curator for footprint.onl/ae.
Score each image URL 1-10 on ae standard:
- 10: editorial, moody, camera-roll worthy, no text/logos/watermarks
- 7-9: strong photo, minor imperfections
- 4-6: generic stock feel, busy composition
- 1-3: logos, watermarks, graphics, clipart, screenshots of UIs

Image URLs to score:
${imageUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}

Return ONLY valid JSON, no markdown:
{ "ranked": [{ "url": "...", "score": N }] }
Only include images scoring 7+.
Order by score descending.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: scoringPrompt }],
      }),
    })

    if (!response.ok) {
      console.error(`  [taste] ae scoring failed (${response.status}), passing all images through`)
      return imageUrls
    }

    const data = await response.json()
    const content = data.content?.[0]?.text
    if (!content) {
      console.error(`  [taste] ae scoring returned empty, passing all images through`)
      return imageUrls
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error(`  [taste] ae scoring returned non-JSON, passing all images through`)
      return imageUrls
    }

    const result: { ranked: AeScoreEntry[] } = JSON.parse(jsonMatch[0])
    const passed = (result.ranked || []).filter(e => e.score >= 7)

    console.log(`  [taste] ae scoring: ${passed.length}/${imageUrls.length} passed (7+ threshold)`)

    if (passed.length === 0) {
      // If nothing passed scoring, return originals rather than empty
      console.log(`  [taste] ae scoring too strict — passing top half through`)
      return imageUrls.slice(0, Math.ceil(imageUrls.length / 2))
    }

    return passed.map(e => e.url)
  } catch (err) {
    console.error(`  [taste] ae scoring error, passing all images through:`, err)
    return imageUrls
  }
}

// ─── Spotify: track search ──────────────────────────────

let spotifyToken: { token: string; expires: number } | null = null

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyToken.expires) {
    return spotifyToken.token
  }

  const config = getConfig()
  const auth = Buffer.from(`${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`).toString('base64')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) throw new Error(`Spotify auth failed: ${response.status}`)

  const data = await response.json()
  spotifyToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }
  return spotifyToken.token
}

async function searchSpotify(query: string): Promise<string | null> {
  try {
    const token = await getSpotifyToken()

    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: '5',
    })

    const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!response.ok) return null

    const data = await response.json()
    const tracks = data.tracks?.items
    if (!tracks?.length) return null

    // Pick the most popular track
    const best = tracks.reduce((a: any, b: any) => (b.popularity > a.popularity ? b : a))
    return `https://open.spotify.com/track/${best.id}`
  } catch (err) {
    console.error('Spotify search failed:', err)
    return null
  }
}

// ─── Main: curate ───────────────────────────────────────

export async function curate(input: TasteInput): Promise<MintPayload> {
  const config = getConfig()
  const { noun, feedback } = input

  console.log(`  [taste] generating brief for "${noun}"...`)
  const brief = await generateBrief(noun, feedback)
  console.log(`  [taste] brief: slug=${brief.slug}, theme=${brief.theme_id}, is_moment=${brief.is_moment}, ${brief.image_queries.length} image queries`)

  // Run image searches in parallel (one per query)
  // Routing depends on is_moment: Google-first for moments, Unsplash-first for evergreen
  const sourceLabel = brief.is_moment ? 'Google CSE → Unsplash → Bing' : 'Unsplash → Bing fallback'
  console.log(`  [taste] searching images (${sourceLabel})...`)
  const imageResults = await Promise.all(
    brief.image_queries.map(q => searchImages(q, 3, brief.is_moment))
  )

  // Flatten and dedupe, take best 6-8
  const seen = new Set<string>()
  const allImages: string[] = []
  for (const batch of imageResults) {
    for (const url of batch) {
      if (!seen.has(url) && allImages.length < TARGET_IMAGES) {
        seen.add(url)
        allImages.push(url)
      }
    }
  }

  if (allImages.length === 0) {
    throw new Error(`No images found for "${noun}" — cannot mint without visuals`)
  }

  console.log(`  [taste] found ${allImages.length} candidate images, running ae scoring...`)

  // Aesthetic scoring: Claude Haiku rates each image 1-10, only 7+ pass
  const scoredImages = await scoreAesthetics(allImages)
  console.log(`  [taste] ${scoredImages.length} images passed ae scoring`)

  if (scoredImages.length === 0) {
    throw new Error(`No images passed ae scoring for "${noun}" — quality too low`)
  }

  // Wallpaper: Unsplash-first search for atmospheric background
  console.log(`  [taste] searching wallpaper...`)
  const wallpaperResults = await searchImages(brief.wallpaper_query, 3)
  const wallpaper_url = wallpaperResults[0] || undefined // Falls back to first image in mint route

  // Spotify track
  console.log(`  [taste] searching spotify...`)
  const music_url = await searchSpotify(brief.music_query) || undefined

  if (music_url) {
    console.log(`  [taste] found track: ${music_url}`)
  }

  // Assemble the mint payload
  const payload: MintPayload = {
    aro_key: config.ARO_KEY,
    slug: brief.slug,
    room_name: brief.display_name,
    image_urls: scoredImages,
    embed_urls: brief.embed_queries || [],
    wallpaper_url,
    music_url,
    theme_id: brief.theme_id || 'midnight',
    display_name: brief.display_name,
    bio: brief.bio || '',
    metadata: {
      source: 'culture-pipeline',
      noun,
      category: input.category || 'general',
      urgency: input.urgency || 0,
    },
  }

  console.log(`  [taste] payload ready: ${payload.slug} (${scoredImages.length} images, wallpaper=${!!wallpaper_url}, music=${!!music_url})`)
  return payload
}
