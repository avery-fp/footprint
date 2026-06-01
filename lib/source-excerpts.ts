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
  category: 'feed' | 'product' | 'article' | 'generic'
  fallback_reason: string | null
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

function resolveImageUrl(raw: unknown, base: string): string | null {
  const value = arrayFirst(raw)
  if (typeof value === 'string') return resolveHttpUrl(value, base)
  if (value && typeof value === 'object') {
    return resolveHttpUrl((value as any).url || (value as any).contentUrl, base)
  }
  return null
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

function parseDateValue(value: string | null): number {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

function normalizeFeedDedupeKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/(www\.)?/g, '')
    .replace(/[?#].*$/g, '')
    .replace(/[^a-z0-9\s:/.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeFeedItems(items: SourceExcerptItem[]): SourceExcerptItem[] {
  const seenUrls = new Set<string>()
  const seenTitles = new Set<string>()
  const out: SourceExcerptItem[] = []

  for (const item of items) {
    const urlKey = canonicalFeedUrl(item)
    const titleKey = normalizeFeedDedupeKey(item.title)

    if (urlKey && seenUrls.has(urlKey)) continue
    if (titleKey && seenTitles.has(titleKey)) continue

    if (urlKey) seenUrls.add(urlKey)
    if (titleKey) seenTitles.add(titleKey)

    out.push(item)
  }

  return out
}

function canonicalFeedUrl(item: SourceExcerptItem): string {
  if (!item.url) return ''
  try {
    const parsed = new URL(item.url)
    parsed.hash = ''
    parsed.searchParams.sort()
    return parsed.href.toLowerCase()
  } catch {
    return normalizeFeedDedupeKey(item.url)
  }
}

function parseFeedItems(xml: string, feedUrl: string): SourceExcerptItem[] {
  const chunks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []

  const items = chunks.map((chunk) => {
    const atomAlternate =
      chunk.match(/<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i)?.[1] ||
      chunk.match(/<link\b(?=[^>]*\bhref=["']([^"']+)["'])(?![^>]*\brel=["'](?:self|hub)["'])[^>]*>/i)?.[1]
    const rssLink = tagValue(chunk, 'link')
    const canonical = tagValue(chunk, 'guid') || tagValue(chunk, 'id')
    const date = cleanString(tagValue(chunk, 'pubDate') || tagValue(chunk, 'updated') || tagValue(chunk, 'published'), 80)
    return {
      title: cleanString(tagValue(chunk, 'title'), 180) || 'Untitled',
      url: resolveHttpUrl(atomAlternate || rssLink || canonical || '', feedUrl),
      date,
      description: cleanString(tagValue(chunk, 'description') || tagValue(chunk, 'summary') || tagValue(chunk, 'content:encoded'), 240),
    }
  }).filter((item) => item.title !== 'Untitled' || item.url)

  return dedupeFeedItems(items)
    .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date))
    .slice(0, 3)
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
  if (node.name && (node.offers || node.price || node.priceCurrency || node.images || node.image) && (node.description || node.brand || node.seller)) {
    return node
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProductNode(child)
      if (found) return found
    }
  }
  if (Array.isArray(node['@graph'])) return findProductNode(node['@graph'])
  return null
}

function productFromNode(product: any, sourceUrl: string): SourceProduct | null {
  const offer = arrayFirst(product.offers || product.offer) as any
  const priceSpec = arrayFirst(offer?.priceSpecification) as any
  const brand = arrayFirst(product.brand) as any
  const seller = arrayFirst(offer?.seller || product.seller) as any
  const name = cleanString(product.name || product.title, 180)
  const image = resolveImageUrl(product.image || product.images || product.featuredImage, sourceUrl)
  const description = cleanString(product.description, 320)
  const price = cleanString(offer?.price || offer?.lowPrice || priceSpec?.price || product.price, 60)
  const priceCurrency = cleanString(offer?.priceCurrency || priceSpec?.priceCurrency || product.priceCurrency, 12)
  const parsed = {
    name,
    image,
    description,
    price,
    priceCurrency,
    brand: cleanString(typeof brand === 'object' ? brand?.name : brand, 120),
    seller: cleanString(typeof seller === 'object' ? seller?.name : seller, 120),
  }
  return parsed.name || parsed.image || parsed.description || parsed.price ? parsed : null
}

function parseProductFromJson(raw: string, sourceUrl: string): SourceProduct | null {
  try {
    const parsed = JSON.parse(decodeEntities(raw))
    const product = findProductNode(parsed)
    return product ? productFromNode(product, sourceUrl) : null
  } catch {
    return null
  }
}

function parseJsonLdProduct(html: string, sourceUrl: string): SourceProduct | null {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim()
    const product = parseProductFromJson(raw, sourceUrl)
    if (product) return product
  }
  return null
}

function parseEmbeddedProduct(html: string, sourceUrl: string): SourceProduct | null {
  const scripts = html.match(/<script\b(?=[^>]*(?:type=["']application\/json["']|id=["']__NEXT_DATA__["']))[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim()
    if (!/"(?:Product|product|offers|price|priceCurrency)"/.test(raw)) continue
    const product = parseProductFromJson(raw, sourceUrl)
    if (product) return product
  }
  return null
}

function emptyResult(domain: string | null, fallback_reason: string | null): SourceExcerptResult {
  return { preview: null, domain, excerpt_items: [], product: null, category: 'generic', fallback_reason }
}

export async function resolveSourceExcerpt(url: string): Promise<SourceExcerptResult> {
  const checked = validateFetchUrl(url)
  const sourceUrl = checked.parsed?.href || url
  const domain = domainFor(sourceUrl)
  if (!checked.valid) return emptyResult(domain, 'invalid_or_private_url')

  try {
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok) return emptyResult(domain, `http_${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
      const excerpt_items = parseFeedItems(await response.text(), sourceUrl)
      return {
        preview: null,
        domain,
        excerpt_items,
        product: null,
        category: excerpt_items.length > 0 ? 'feed' : 'generic',
        fallback_reason: excerpt_items.length > 0 ? null : 'feed_without_useful_items',
      }
    }
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return emptyResult(domain, 'unsupported_content_type')
    }
    const html = await response.text()
    const preview = extractLinkPreview(html, sourceUrl)
    const product = parseJsonLdProduct(html, sourceUrl) || parseEmbeddedProduct(html, sourceUrl)
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
    const hasArticlePreview = !!(preview?.title || preview?.description || preview?.image)
    const category = excerpt_items.length > 0 ? 'feed' : product ? 'product' : hasArticlePreview ? 'article' : 'generic'
    const fallback_reason = category === 'generic' ? 'no_safe_preview_metadata' : null
    return { preview, domain, excerpt_items, product, category, fallback_reason }
  } catch {
    return emptyResult(domain, 'fetch_failed')
  }
}
