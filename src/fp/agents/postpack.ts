/**
 * POSTPACK AGENT — Generates native content per surface.
 *
 * Takes a minted room + screenshots → outputs platform-native
 * captions, hashtags, and image selections for each surface.
 *
 * Surfaces: reddit, twitter, instagram, tiktok, pinterest
 */

import { getConfig } from '../env.js'
import type { PostpackInput, PostpackContent } from '../types.js'

// Format preferences per surface
const SURFACE_CONFIG: Record<string, { image_format: string; max_caption: number; style: string }> = {
  reddit:    { image_format: '16x9', max_caption: 300,  style: 'conversational, genuine, no hashtags in caption' },
  twitter:   { image_format: '16x9', max_caption: 280,  style: 'concise, witty, use 2-3 hashtags' },
  instagram: { image_format: '4x5',  max_caption: 2200, style: 'aesthetic, use line breaks, 15-20 hashtags at end' },
  tiktok:    { image_format: '9x16', max_caption: 150,  style: 'gen-z casual, hook first line, trending hashtags' },
  pinterest: { image_format: '4x5',  max_caption: 500,  style: 'descriptive, keyword-rich, aspirational' },
}

const SURFACES = Object.keys(SURFACE_CONFIG)

async function generateCaptions(input: PostpackInput): Promise<Record<string, { caption: string; hashtags: string[] }>> {
  const config = getConfig()

  const prompt = `Generate social media captions for a footprint.onl room.

Room: "${input.display_name}"
Bio: "${input.bio}"
Category: ${input.category}
URL: ${input.room_url}

footprint.onl is a $10 digital identity product — a curated personal page with images and music.
The CTA is always: "make yours at footprint.onl" or link to the room.

Generate captions for EACH surface. Output valid JSON:
{
  "reddit": { "caption": "...", "hashtags": [] },
  "twitter": { "caption": "...", "hashtags": ["tag1", "tag2"] },
  "instagram": { "caption": "...", "hashtags": ["tag1", "tag2", "..."] },
  "tiktok": { "caption": "...", "hashtags": ["tag1", "tag2"] },
  "pinterest": { "caption": "...", "hashtags": ["tag1", "tag2"] }
}

Style per surface:
${Object.entries(SURFACE_CONFIG).map(([s, c]) => `- ${s}: ${c.style} (max ${c.max_caption} chars)`).join('\n')}

Rules:
- Never say "check out" or "click the link" — be natural
- Reddit: post as sharing something cool you found, not advertising
- Twitter: short, punchy, make people curious
- Instagram: aesthetic, use ✦ and · as separators, hashtags on separate lines
- TikTok: hook in first 5 words
- Pinterest: SEO-friendly, descriptive
- Always include the room URL naturally
- No emojis overload — keep it clean`

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
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text || ''

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in postpack response')

  return JSON.parse(jsonMatch[0])
}

// ─── Main: generate ─────────────────────────────────────

export async function generate(input: PostpackInput): Promise<PostpackContent[]> {
  console.log(`  [postpack] generating content for ${SURFACES.length} surfaces...`)

  const captions = await generateCaptions(input)
  const packs: PostpackContent[] = []

  for (const surface of SURFACES) {
    const surfaceConfig = SURFACE_CONFIG[surface]
    const captionData = captions[surface]
    if (!captionData) continue

    const imageFormat = surfaceConfig.image_format
    const imageUrl = input.screenshots[imageFormat] || Object.values(input.screenshots)[0] || ''

    packs.push({
      surface,
      caption: captionData.caption,
      hashtags: captionData.hashtags || [],
      image_format: imageFormat,
      image_url: imageUrl,
      cta_url: input.room_url,
    })
  }

  console.log(`  [postpack] generated ${packs.length} postpacks`)
  return packs
}
