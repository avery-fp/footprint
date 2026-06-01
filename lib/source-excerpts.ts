import { extractLinkPreview, type LinkPreview } from '@/lib/og'
import { validateFetchUrl } from '@/lib/ssrf'

export interface SourceExcerptItem {
  title: string
  url: string | null
  date: string | null
  description: string | null
}

export interface SourceProduct {
  name: string | null
  image: string | null
  description: string | null
  price: string | null
  priceCurrency: string | null
  brand: string | null
  seller: string | null
}

export interface SourceExcerptResult {
  preview: LinkPreview | null
  domain: string | null
  excerpt_items: SourceExcerptItem[]
  product: SourceProduct | null
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = String(value).replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

function resolveHttpUrl(raw: unknown, base: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = new URL(raw.trim(), base)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function domainFor(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function findFeedUrl(html: string, sourceUrl: string): string | null {
  const linkPattern = /<link\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(html))) {
    const tag = match[0]
    if (!/rel=["'][^"']*alternate/i.test(tag)) continue
    if (!/type=["'](?:application\/rss\+xml|application\/atom\+xml|application\/feed\+json)/i.test(tag)) continue
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
    const url = resolveHttpUrl(href, sourceUrl)
    if (url) return url
  }
  return null
}

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match?.[1]) return null
  return decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
}

function parseFeedItems(xml: string, feedUrl: string): SourceExcerptItem[] {
  const chunks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []
  return chunks.slice(0, 3).map((chunk) => {
    const linkHref = chunk.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]
    const rssLink = tagValue(chunk, 'link')
    return {
      title: cleanString(tagValue(chunk, 'title'), 180) || 'Untitled',
      url: resolveHttpUrl(linkHref || rssLink || '', feedUrl),
      date: cleanString(tagValue(chunk, 'pubDate') || tagValue(chunk, 'updated') || tagValue(chunk, 'published'), 80),
      description: cleanString(tagValue(chunk, 'description') || tagValue(chunk, 'summary'), 240),
    }
  }).filter((item) => item.title !== 'Untitled' || item.url)
}

function arrayFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function nodeType(node: any): string {
  const type = Array.isArray(node?.['@type']) ? node['@type'][0] : node?.['@type']
  return typeof type === 'string' ? type.toLowerCase() : ''
}

function findProductNode(node: any): any | null {
  if (!node || typeof node !== 'object') return null
  if (nodeType(node) === 'product') return node
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProductNode(child)
      if (found) return found
    }
  }
  if (Array.isArray(node['@graph'])) return findProductNode(node['@graph'])
  return null
}

function parseJsonLdProduct(html: string, sourceUrl: string): SourceProduct | null {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim()
    try {
      const parsed = JSON.parse(decodeEntities(raw))
      const product = findProductNode(parsed)
      if (!product) continue
      const offer = arrayFirst(product.offers) as any
      const brand = arrayFirst(product.brand) as any
      const seller = arrayFirst(offer?.seller || product.seller) as any
      return {
        name: cleanString(product.name, 180),
        image: resolveHttpUrl(arrayFirst(product.image), sourceUrl),
        description: cleanString(product.description, 320),
        price: cleanString(offer?.price || offer?.lowPrice, 60),
        priceCurrency: cleanString(offer?.priceCurrency, 12),
        brand: cleanString(typeof brand === 'object' ? brand?.name : brand, 120),
        seller: cleanString(typeof seller === 'object' ? seller?.name : seller, 120),
      }
    } catch {}
  }
  return null
}

export async function resolveSourceExcerpt(url: string): Promise<SourceExcerptResult> {
  const checked = validateFetchUrl(url)
  const sourceUrl = checked.parsed?.href || url
  const domain = domainFor(sourceUrl)
  if (!checked.valid) return { preview: null, domain, excerpt_items: [], product: null }

  try {
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok) return { preview: null, domain, excerpt_items: [], product: null }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { preview: null, domain, excerpt_items: [], product: null }
    }
    const html = await response.text()
    const preview = extractLinkPreview(html, sourceUrl)
    const product = parseJsonLdProduct(html, sourceUrl)
    const feedUrl = findFeedUrl(html, sourceUrl)
    let excerpt_items: SourceExcerptItem[] = []
    if (feedUrl) {
      try {
        const feed = await fetch(feedUrl, {
          signal: AbortSignal.timeout(4000),
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)' },
        })
        if (feed.ok) excerpt_items = parseFeedItems(await feed.text(), feedUrl)
      } catch {}
    }
    return { preview, domain, excerpt_items, product }
  } catch {
    return { preview: null, domain, excerpt_items: [], product: null }
  }
}
