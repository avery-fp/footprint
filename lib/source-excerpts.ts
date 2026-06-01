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
  availability: string | null
  condition: string | null
}

export interface SourceExcerptResult {
  preview: LinkPreview | null
  domain: string | null
  excerpt_items: SourceExcerptItem[]
  product: SourceProduct | null
  category: 'feed' | 'product' | 'article' | 'generic'
  fallback_reason: string | null
  published_at: string | null
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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function metaContent(html: string, key: string, attr: 'property' | 'name'): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`, 'i'),
  ]
  for (const re of patterns) {
    const match = html.match(re)
    if (match?.[1]) return decodeEntities(match[1]).trim() || null
  }
  return null
}

function meta(html: string, key: string): string | null {
  return metaContent(html, key, 'property') || metaContent(html, key, 'name')
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

function isXUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com\//i.test(url)
}

function cleanHtmlText(value: string): string | null {
  return cleanString(decodeEntities(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')), 500)
}

async function resolveXPublicExcerpt(sourceUrl: string, domain: string | null): Promise<SourceExcerptResult | null> {
  const oembedUrl = `https://publish.x.com/oembed?url=${encodeURIComponent(sourceUrl)}&omit_script=true&dnt=true&theme=dark`
  try {
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(4000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)' },
    })
    if (!response.ok) return null
    const data = await response.json()
    const html = typeof data?.html === 'string' ? data.html : ''
    const text =
      cleanHtmlText(html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '') ||
      cleanHtmlText(html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '') ||
      cleanString(data?.title, 220)
    const date = cleanHtmlText(html.match(/&mdash;[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '')
    const author = cleanString(data?.author_name, 120)
    if (!text && !author) return null
    return {
      preview: {
        url: sourceUrl,
        canonical: cleanString(data?.url, 2048) || sourceUrl,
        title: text || author,
        description: [author, date].filter(Boolean).join(' · ') || null,
        image: null,
        siteName: 'X',
        type: 'rich',
      },
      domain,
      excerpt_items: [],
      product: null,
      category: 'article',
      fallback_reason: null,
      published_at: date,
    }
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

function findTypedNode(node: any, types: Set<string>, depth = 0): any | null {
  if (!node || typeof node !== 'object' || depth > 7) return null
  if (types.has(nodeType(node))) return node
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findTypedNode(child, types, depth + 1)
      if (found) return found
    }
  }
  if (Array.isArray(node['@graph'])) return findTypedNode(node['@graph'], types, depth + 1)
  return null
}

function findProductNode(node: any, depth = 0): any | null {
  if (!node || typeof node !== 'object' || depth > 9) return null
  if (nodeType(node) === 'product') return node
  if (node.name && (node.offers || node.price || node.priceCurrency || node.images || node.image) && (node.description || node.brand || node.seller)) {
    return node
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProductNode(child, depth + 1)
      if (found) return found
    }
  }
  if (Array.isArray(node['@graph'])) return findProductNode(node['@graph'], depth + 1)
  for (const value of Object.values(node).slice(0, 80)) {
    const found = findProductNode(value, depth + 1)
    if (found) return found
  }
  return null
}

function lastUrlPart(value: unknown): string | null {
  const cleaned = cleanString(value, 120)
  if (!cleaned) return null
  const tail = cleaned.split('/').filter(Boolean).pop() || cleaned
  return tail.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
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
  const availability = lastUrlPart(offer?.availability || product.availability)
  const condition = lastUrlPart(offer?.itemCondition || product.itemCondition || product.condition)
  const parsed = {
    name,
    image,
    description,
    price,
    priceCurrency,
    brand: cleanString(typeof brand === 'object' ? brand?.name : brand, 120),
    seller: cleanString(typeof seller === 'object' ? seller?.name : seller, 120),
    availability,
    condition,
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

function parseJsonLdArticleDate(html: string): string | null {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  const articleTypes = new Set(['article', 'blogposting', 'newsarticle'])
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim()
    try {
      const parsed = JSON.parse(decodeEntities(raw))
      const article = findTypedNode(parsed, articleTypes)
      const date = cleanString(article?.datePublished || article?.dateModified, 80)
      if (date) return date
    } catch {}
  }
  return null
}

function parseArticleDate(html: string): string | null {
  return cleanString(
    meta(html, 'article:published_time') ||
      meta(html, 'article:modified_time') ||
      meta(html, 'datePublished') ||
      meta(html, 'date') ||
      parseJsonLdArticleDate(html),
    80
  )
}

function parseOpenGraphProduct(html: string, sourceUrl: string, preview: LinkPreview | null): SourceProduct | null {
  const type = meta(html, 'og:type')
  const price = cleanString(meta(html, 'product:price:amount') || meta(html, 'product:price') || meta(html, 'og:price:amount'), 60)
  const priceCurrency = cleanString(meta(html, 'product:price:currency') || meta(html, 'og:price:currency'), 12)
  const availability = lastUrlPart(meta(html, 'product:availability') || meta(html, 'og:availability'))
  const condition = lastUrlPart(meta(html, 'product:condition') || meta(html, 'og:condition'))
  const hasProductSignal = /product/i.test(type || '') || !!(price || priceCurrency || availability || condition)
  if (!hasProductSignal) return null

  const parsed = {
    name: cleanString(preview?.title || meta(html, 'og:title') || meta(html, 'twitter:title'), 180),
    image: resolveHttpUrl(meta(html, 'og:image') || meta(html, 'twitter:image') || '', sourceUrl),
    description: cleanString(preview?.description || meta(html, 'og:description') || meta(html, 'description'), 320),
    price,
    priceCurrency,
    brand: cleanString(meta(html, 'product:brand') || meta(html, 'og:brand'), 120),
    seller: cleanString(meta(html, 'product:retailer_item_id') ? null : meta(html, 'product:seller'), 120),
    availability,
    condition,
  }
  return parsed.name || parsed.image || parsed.description || parsed.price ? parsed : null
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
  return { preview: null, domain, excerpt_items: [], product: null, category: 'generic', fallback_reason, published_at: null }
}

export async function resolveSourceExcerpt(url: string): Promise<SourceExcerptResult> {
  const checked = validateFetchUrl(url)
  const sourceUrl = checked.parsed?.href || url
  const domain = domainFor(sourceUrl)
  if (!checked.valid) return emptyResult(domain, 'invalid_or_private_url')

  try {
    if (isXUrl(sourceUrl)) {
      const xExcerpt = await resolveXPublicExcerpt(sourceUrl, domain)
      if (xExcerpt) return xExcerpt
    }

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
        published_at: null,
      }
    }
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return emptyResult(domain, 'unsupported_content_type')
    }
    const html = await response.text()
    const preview = extractLinkPreview(html, sourceUrl)
    const published_at = parseArticleDate(html)
    const product = parseJsonLdProduct(html, sourceUrl) || parseOpenGraphProduct(html, sourceUrl, preview) || parseEmbeddedProduct(html, sourceUrl)
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
    return { preview, domain, excerpt_items, product, category, fallback_reason, published_at }
  } catch {
    return emptyResult(domain, 'fetch_failed')
  }
}
