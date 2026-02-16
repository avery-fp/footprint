/**
 * TASTE AGENT — The creative core of the pipeline.
 *
 * noun in → mint payload out.
 *
 * This is the most critical agent. It decides what a room looks like.
 * Every output must produce pages indistinguishable from footprint.onl/ae.
 *
 * Flow:
 *   1. Claude generates a creative brief from the noun
 *   2. Bing Image Search finds high-quality editorial images
 *   3. Spotify Search finds a matching track
 *   4. Best image becomes the wallpaper
 *   5. Returns a complete MintPayload ready for /api/aro/mint
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
  "image_queries": ["4-6 specific image search queries"],
  "wallpaper_query": "one atmospheric/moody query for the blurred background",
  "music_query": "spotify search query for a track that matches the vibe",
  "embed_queries": []
}

Rules:
- slug: 2-4 words, lowercase, hyphens. Must feel like a curated room name.
- display_name: what appears at the top of the page. Lowercase. Think: "æ", "drake", "tokyo nights". Not: "Drake's Album", "TOKYO".
- bio: empty string for most topics. Only add if truly needed.
- theme_id: "midnight" for 70% of rooms. "ocean" for water/calm. "ember" for warm/cultural. "forest" for nature. "violet" for creative/music.
- image_queries: CRITICAL. These search Bing Images. Each query must find EDITORIAL, AESTHETIC photos.
  - Add "editorial photography" or "aesthetic" to queries
  - Be specific: "lebron james courtside editorial photography" NOT "basketball"
  - Target real photography, not illustrations or stock
  - First query = hero image (will be large tile)
  - Vary angles: close-ups, wide shots, details, atmosphere
- wallpaper_query: finds the blurred background. Should be atmospheric, moody, textural.
  - Example: "dark basketball arena atmosphere photography"
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

  // Sanitize slug
  brief.slug = brief.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  return brief
}

// ─── Bing: image search ─────────────────────────────────

interface BingImage {
  contentUrl: string
  thumbnailUrl: string
  width: number
  height: number
}

async function searchImages(query: string, count: number = 8): Promise<string[]> {
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
    console.error(`Bing search failed for "${query}": ${response.status}`)
    return []
  }

  const data = await response.json()
  const images: BingImage[] = data.value || []

  // Filter for quality: minimum 600px, prefer square-ish aspect ratios
  return images
    .filter(img => img.width >= 600 && img.height >= 600)
    .map(img => img.contentUrl)
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
  console.log(`  [taste] brief: slug=${brief.slug}, theme=${brief.theme_id}, ${brief.image_queries.length} image queries`)

  // Run image searches in parallel (one per query)
  console.log(`  [taste] searching images...`)
  const imageResults = await Promise.all(
    brief.image_queries.map(q => searchImages(q, 3))
  )

  // Flatten and dedupe, take best 6-8
  const seen = new Set<string>()
  const allImages: string[] = []
  for (const batch of imageResults) {
    for (const url of batch) {
      if (!seen.has(url) && allImages.length < 8) {
        seen.add(url)
        allImages.push(url)
      }
    }
  }

  if (allImages.length === 0) {
    throw new Error(`No images found for "${noun}" — cannot mint without visuals`)
  }

  console.log(`  [taste] found ${allImages.length} images`)

  // Wallpaper: search separately for atmospheric background
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
    image_urls: allImages,
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

  console.log(`  [taste] payload ready: ${payload.slug} (${allImages.length} images, wallpaper=${!!wallpaper_url}, music=${!!music_url})`)
  return payload
}
