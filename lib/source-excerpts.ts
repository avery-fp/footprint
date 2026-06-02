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

export interface SourceExcerptPayload {
  kind: 'profile' | 'post' | 'product' | 'feed' | 'article' | 'media' | 'portal'
  source: string | null
  domain: string | null
  title: string | null
  handle: string | null
  description: string | null
  image: string | null
  url: string | null
  date: string | null
  items: Array<{
    title: string | null
    text: string | null
    description: string | null
    image: string | null
    url: string | null
    date: string | null
  }>
  product: {
    name: string | null
    image: string | null
    description: string | null
    price: string | null
    currency: string | null
    seller: string | null
    brand: string | null
    condition: string | null
    availability: string | null
  } | null
  fallback_reason: string | null
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

const MAX_FEED_ITEMS = 12

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const cleaned = String(value).replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function cleanText(value: unknown, maxLength: number): string | null {
  const cleaned = cleanString(value, maxLength)
  if (!cleaned) return null
  return decodeEntities(cleaned.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
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
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const resolved = resolveImageUrl(item, base)
      if (resolved) return resolved
    }
    return null
  }
  const value = raw
  if (typeof value === 'string') return resolveHttpUrl(value, base)
  if (value && typeof value === 'object') {
    const object = value as any
    const firstEdge = arrayFirst(object.edges) as any
    const nested = object.node || arrayFirst(object.nodes) || firstEdge?.node
    if (nested) {
      const resolved = resolveImageUrl(nested, base)
      if (resolved) return resolved
    }
    return resolveHttpUrl(
      object.url ||
        object.contentUrl ||
        object.src ||
        object.secure_url ||
        object.originalSrc ||
        object.transformedSrc ||
        object.image?.url ||
        object.image?.src,
      base
    )
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

function handleFor(url: string, preview: LinkPreview | null): string | null {
  const author = cleanString((preview as any)?.author || (preview as any)?.author_name, 120)
  if (author) return author.startsWith('@') ? author : `@${author}`
  try {
    const parsed = new URL(url)
    const first = parsed.pathname.split('/').filter(Boolean)[0]
    if (!first || first === 'p' || first === 'reel' || first === 'video') return null
    return first.startsWith('@') ? first : `@${first}`
  } catch {
    return null
  }
}

function sourceKindFor(url: string, result: SourceExcerptResult): SourceExcerptPayload['kind'] {
  if (result.product) return 'product'
  if (result.excerpt_items.length > 0) return 'feed'
  if (isTikTokUrl(url)) return result.preview ? 'media' : 'portal'
  if (isInstagramUrl(url)) {
    if (!result.preview) return 'portal'
    return /\/(?:p|reel)\//i.test(url) ? 'media' : 'profile'
  }
  if (isXUrl(url)) {
    if (!result.preview) return 'portal'
    return /\/status(?:es)?\//i.test(url) ? 'post' : 'profile'
  }
  if (result.category === 'article') return 'article'
  return 'portal'
}

export function buildSourceExcerptPayload(url: string, result: SourceExcerptResult): SourceExcerptPayload {
  const domain = result.domain || domainFor(url)
  const kind = sourceKindFor(url, result)
  const product = result.product
  const source = result.preview?.siteName || domain
  return {
    kind,
    source,
    domain,
    title: product?.name || cleanString(result.preview?.title, 240) || null,
    handle: handleFor(url, result.preview),
    description: product?.description || cleanString(result.preview?.description, 500) || null,
    image: product?.image || resolveHttpUrl(result.preview?.image || '', url),
    url: cleanString(result.preview?.canonical, 2048) || url,
    date: result.published_at,
    items: result.excerpt_items.map((item) => ({
      title: item.title || null,
      text: item.description || null,
      description: item.description || null,
      image: null,
      url: item.url || null,
      date: item.date || null,
    })),
    product: product
      ? {
          name: product.name,
          image: product.image,
          description: product.description,
          price: product.price,
          currency: product.priceCurrency,
          seller: product.seller,
          brand: product.brand,
          condition: product.condition,
          availability: product.availability,
        }
      : null,
    fallback_reason: result.fallback_reason,
  }
}

function isXUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com\//i.test(url)
}

function isTikTokUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?tiktok\.com\//i.test(url) || /(?:^|\/\/)vm\.tiktok\.com\//i.test(url)
}

function isInstagramUrl(url: string): boolean {
  return /(?:^|\/\/)(?:www\.)?instagram\.com\//i.test(url)
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

async function resolveTikTokPublicExcerpt(sourceUrl: string, domain: string | null): Promise<SourceExcerptResult | null> {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(sourceUrl)}`
  try {
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(4000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)' },
    })
    if (!response.ok) return null
    const data = await response.json()
    const title = cleanString(data?.title, 240)
    const author = cleanString(data?.author_name, 120)
    const image = resolveHttpUrl(data?.thumbnail_url || '', sourceUrl)
    if (!title && !author && !image) return null
    return {
      preview: {
        url: sourceUrl,
        canonical: sourceUrl,
        title: title || author || 'TikTok',
        description: author ? `TikTok · ${author}` : 'TikTok',
        image,
        siteName: cleanString(data?.provider_name, 80) || 'TikTok',
        type: cleanString(data?.type, 40) || 'rich',
      },
      domain,
      excerpt_items: [],
      product: null,
      category: 'article',
      fallback_reason: null,
      published_at: null,
    }
  } catch {
    return null
  }
}

function instagramOembedToken(): string | null {
  return (
    cleanString(process.env.INSTAGRAM_OEMBED_ACCESS_TOKEN, 2048) ||
    cleanString(process.env.META_OEMBED_ACCESS_TOKEN, 2048) ||
    cleanString(process.env.FACEBOOK_OEMBED_ACCESS_TOKEN, 2048)
  )
}

async function resolveInstagramPublicExcerpt(sourceUrl: string, domain: string | null): Promise<SourceExcerptResult> {
  const accessToken = instagramOembedToken()
  if (!accessToken) return emptyResult(domain, 'instagram_oembed_not_configured')
  const oembedUrl =
    `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(sourceUrl)}` +
    `&omitscript=true&access_token=${encodeURIComponent(accessToken)}`
  try {
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(4000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)' },
    })
    if (!response.ok) return emptyResult(domain, `instagram_oembed_http_${response.status}`)
    const data = await response.json()
    const title = cleanString(data?.title, 240)
    const author = cleanString(data?.author_name, 120)
    const image = resolveHttpUrl(data?.thumbnail_url || '', sourceUrl)
    if (!title && !author && !image) return emptyResult(domain, 'instagram_oembed_empty')
    return {
      preview: {
        url: sourceUrl,
        canonical: sourceUrl,
        title: title || author || 'Instagram',
        description: author ? `Instagram · ${author}` : 'Instagram',
        image,
        siteName: cleanString(data?.provider_name, 80) || 'Instagram',
        type: cleanString(data?.type, 40) || 'rich',
      },
      domain,
      excerpt_items: [],
      product: null,
      category: 'article',
      fallback_reason: null,
      published_at: null,
    }
  } catch {
    return emptyResult(domain, 'instagram_oembed_fetch_failed')
  }
}

function tagAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? decodeEntities(match[1] || match[2] || match[3] || '').trim() || null : null
}

function uniqueUrls(urls: Array<string | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

function findFeedUrls(html: string, sourceUrl: string): string[] {
  const urls: Array<string | null> = []
  const linkPattern = /<link\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(html))) {
    const tag = match[0]
    const rel = tagAttr(tag, 'rel') || ''
    const type = tagAttr(tag, 'type') || ''
    if (!/\balternate\b/i.test(rel)) continue
    if (!/(application\/rss\+xml|application\/atom\+xml|application\/feed\+json|application\/json|text\/xml|application\/xml)/i.test(type)) continue
    urls.push(resolveHttpUrl(tagAttr(tag, 'href'), sourceUrl))
  }
  return uniqueUrls(urls)
}

function feedFallbackUrls(sourceUrl: string): string[] {
  try {
    const parsed = new URL(sourceUrl)
    parsed.search = ''
    parsed.hash = ''
    const origin = parsed.origin
    const candidates = ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml'].map((path) => `${origin}${path}`)
    const path = parsed.pathname.replace(/\/+$/, '')
    if (path && path !== '') {
      candidates.push(`${origin}${path}/feed`, `${origin}${path}/rss`, `${origin}${path}.rss`, `${origin}${path}.xml`)
    }
    return uniqueUrls(candidates)
  } catch {
    return []
  }
}

function isFeedContentType(contentType: string): boolean {
  return /(xml|rss|atom|feed\+json|application\/json)/i.test(contentType)
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
    .slice(0, MAX_FEED_ITEMS)
}

function parseJsonFeedItems(json: string, feedUrl: string): SourceExcerptItem[] {
  try {
    const data = JSON.parse(json)
    const rawItems = Array.isArray(data?.items) ? data.items : []
    const items = rawItems.map((item: any) => ({
      title: cleanString(item.title || item.summary || item.content_text, 180) || 'Untitled',
      url: resolveHttpUrl(item.url || item.external_url || item.id || '', feedUrl),
      date: cleanString(item.date_published || item.date_modified, 80),
      description: cleanString(item.summary || item.content_text || item.content_html, 240),
    })).filter((item: SourceExcerptItem) => item.title !== 'Untitled' || item.url)
    return dedupeFeedItems(items)
      .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date))
      .slice(0, MAX_FEED_ITEMS)
  } catch {
    return []
  }
}

function parseFeedBody(body: string, feedUrl: string, contentType: string): SourceExcerptItem[] {
  if (/feed\+json|application\/json/i.test(contentType) || body.trim().startsWith('{')) {
    const jsonItems = parseJsonFeedItems(body, feedUrl)
    if (jsonItems.length) return jsonItems
  }
  return parseFeedItems(body, feedUrl)
}

async function fetchFeedItems(feedUrl: string): Promise<SourceExcerptItem[]> {
  const checked = validateFetchUrl(feedUrl)
  if (!checked.valid || !checked.parsed) return []
  try {
    const feed = await fetch(checked.parsed.href, {
      signal: AbortSignal.timeout(4000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        Accept: 'application/rss+xml,application/atom+xml,application/feed+json,application/xml,text/xml;q=0.9,*/*;q=0.2',
      },
    })
    if (!feed.ok) return []
    const contentType = feed.headers.get('content-type') || ''
    if (!isFeedContentType(contentType) && !/\.(rss|atom|xml|json)(?:$|[?#])/i.test(checked.parsed.href)) return []
    return parseFeedBody(await feed.text(), checked.parsed.href, contentType)
  } catch {
    return []
  }
}

function arrayFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function firstNode(value: unknown): any {
  const item = arrayFirst(value) as any
  if (!item || typeof item !== 'object') return item
  return item.node || firstNode(item.nodes) || firstNode(item.edges) || item
}

function nodeType(node: any): string {
  const type = node?.['@type'] || node?.type || node?.__typename
  if (Array.isArray(type)) return type.map((item) => cleanString(item, 80)?.toLowerCase()).filter(Boolean).join(' ')
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
  if (/\bproduct\b/i.test(nodeType(node))) return node
  const hasIdentity = node.name || node.title || node.productTitle || node.productName
  const hasMedia =
    node.image ||
    node.images ||
    node.featuredImage ||
    node.featured_image ||
    node.primaryImage ||
    node.media ||
    node.photos
  const hasCommerce =
    node.offers ||
    node.offer ||
    node.price ||
    node.currentPrice ||
    node.salePrice ||
    node.compareAtPrice ||
    node.priceCurrency ||
    node.priceRange ||
    node.priceRangeV2 ||
    node.variants ||
    node.selectedVariant ||
    node.availableForSale ||
    node.availability ||
    node.condition
  if (hasIdentity && hasMedia && hasCommerce) {
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

function namedValue(value: unknown, maxLength = 120): string | null {
  const item = firstNode(value) as any
  if (!item) return null
  return cleanString(typeof item === 'object' ? item.name || item.title || item.displayName || item.label : item, maxLength)
}

function booleanAvailability(value: unknown): string | null {
  return typeof value === 'boolean' ? (value ? 'In stock' : 'Out of stock') : null
}

function hasProductUrlHint(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl)
    const domain = parsed.hostname.replace(/^www\./, '')
    return (
      /(?:depop|vinted|etsy|ebay|amazon|shopify|bigcartel|poshmark|grailed|stockx|stripe)\./i.test(domain) ||
      /\/(?:products?|shop|store|items?|listing|catalog|collections|dp)\b/i.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

function cleanPriceValue(value: unknown): string | null {
  const price = cleanString(value, 60)
  if (!price) return null
  return /(?:\d|[$€£¥₹₩₽₺₴₦₫₪₱฿₲₡₵]|usd|eur|gbp|cad|aud|jpy|cny|sek|nok|dkk)/i.test(price) ? price : null
}

function moneyAmount(value: unknown): unknown {
  const item = firstNode(value) as any
  if (!item || typeof item !== 'object') return item
  return item.amount || item.value || item.price || item.priceAmount || item.centAmount || item.money?.amount || item.minVariantPrice?.amount
}

function moneyCurrency(value: unknown): unknown {
  const item = firstNode(value) as any
  if (!item || typeof item !== 'object') return null
  return item.currencyCode || item.currency || item.priceCurrency || item.money?.currencyCode || item.minVariantPrice?.currencyCode
}

function productFromNode(product: any, sourceUrl: string): SourceProduct | null {
  const offer = firstNode(product.offers || product.offer) as any
  const priceSpec = firstNode(offer?.priceSpecification) as any
  const variant = firstNode(product.variants || product.selectedVariant || product.defaultVariant) as any
  const variantPrice = variant?.priceV2 || variant?.price || variant?.currentPrice || variant?.compareAtPriceV2 || variant?.compare_at_price
  const priceRange = product.priceRange || product.price_range || product.priceRangeV2
  const minPrice = priceRange?.minVariantPrice || priceRange?.min_price || priceRange?.minimum || priceRange?.from
  const name = cleanString(product.name || product.title || product.productTitle || product.productName, 180)
  const image = resolveImageUrl(
    product.image ||
      product.images ||
      product.featuredImage ||
      product.featured_image ||
      product.primaryImage ||
      product.media ||
      product.photos ||
      variant?.image,
    sourceUrl
  )
  const description = cleanText(
    product.description ||
      product.shortDescription ||
      product.descriptionPlainSummary ||
      product.body_html ||
      product.descriptionHtml,
    320
  )
  const price = cleanPriceValue(
    offer?.price ||
      offer?.lowPrice ||
      offer?.highPrice ||
      priceSpec?.price ||
      product.price ||
      product.currentPrice ||
      product.salePrice ||
      product.compareAtPrice ||
      product.priceAmount ||
      product.amount ||
      moneyAmount(variantPrice) ||
      moneyAmount(minPrice)
  )
  const priceCurrency = cleanString(
    offer?.priceCurrency ||
      moneyCurrency(offer?.price) ||
      priceSpec?.priceCurrency ||
      product.priceCurrency ||
      product.currency ||
      product.currencyCode ||
      moneyCurrency(variantPrice) ||
      moneyCurrency(minPrice),
    12
  )
  const availability =
    lastUrlPart(offer?.availability || product.availability || variant?.availability || variant?.inventoryPolicy) ||
    booleanAvailability(product.availableForSale ?? product.available ?? variant?.availableForSale ?? variant?.available)
  const condition = lastUrlPart(offer?.itemCondition || product.itemCondition || product.condition)
  const brand = namedValue(product.brand || product.brandName || product.vendor || product.manufacturer || product.designer)
  const seller = namedValue(offer?.seller || product.seller || product.shop || product.store || product.merchant || product.vendor)
  const parsed = {
    name,
    image,
    description,
    price,
    priceCurrency,
    brand,
    seller,
    availability,
    condition,
  }
  const commerceSignal = !!(offer || variant || price || priceCurrency || brand || seller || availability || condition)
  if (!commerceSignal && !hasProductUrlHint(sourceUrl)) return null
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
  const price = cleanPriceValue(
    meta(html, 'product:price:amount') ||
      meta(html, 'product:sale_price:amount') ||
      meta(html, 'product:price') ||
      meta(html, 'og:price:amount') ||
      meta(html, 'price:amount')
  )
  const priceCurrency = cleanString(
    meta(html, 'product:price:currency') || meta(html, 'product:sale_price:currency') || meta(html, 'og:price:currency') || meta(html, 'price:currency'),
    12
  )
  const availability = lastUrlPart(meta(html, 'product:availability') || meta(html, 'og:availability'))
  const condition = lastUrlPart(meta(html, 'product:condition') || meta(html, 'og:condition'))
  const brand = cleanString(meta(html, 'product:brand') || meta(html, 'og:brand') || meta(html, 'brand') || meta(html, 'product:vendor'), 120)
  const hasProductSignal = /product/i.test(type || '') || !!(price || priceCurrency || availability || condition || brand)
  if (!hasProductSignal) return null

  const parsed = {
    name: cleanString(preview?.title || meta(html, 'og:title') || meta(html, 'twitter:title'), 180),
    image: resolveHttpUrl(meta(html, 'og:image') || meta(html, 'twitter:image') || '', sourceUrl),
    description: cleanString(preview?.description || meta(html, 'og:description') || meta(html, 'description'), 320),
    price,
    priceCurrency,
    brand,
    seller: cleanString(meta(html, 'product:seller') || meta(html, 'product:retailer') || meta(html, 'merchant'), 120),
    availability,
    condition,
  }
  return parsed.name || parsed.image || parsed.description || parsed.price ? parsed : null
}

function parseEmbeddedProduct(html: string, sourceUrl: string): SourceProduct | null {
  const scripts = html.match(/<script\b(?=[^>]*(?:type=["']application\/json["']|id=["']__NEXT_DATA__["']))[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '').trim()
    if (!/(?:__NEXT_DATA__|"(?:Product|product|productName|productTitle|offers|price|priceCurrency|variants)")/.test(script)) continue
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
      return xExcerpt || emptyResult(domain, 'x_oembed_unavailable')
    }

    if (isTikTokUrl(sourceUrl)) {
      const tiktokExcerpt = await resolveTikTokPublicExcerpt(sourceUrl, domain)
      return tiktokExcerpt || emptyResult(domain, 'tiktok_oembed_unavailable')
    }

    if (isInstagramUrl(sourceUrl)) {
      return resolveInstagramPublicExcerpt(sourceUrl, domain)
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
    if (isFeedContentType(contentType)) {
      const excerpt_items = parseFeedBody(await response.text(), sourceUrl, contentType)
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
    let excerpt_items: SourceExcerptItem[] = []
    for (const feedUrl of uniqueUrls([...findFeedUrls(html, sourceUrl), ...feedFallbackUrls(sourceUrl)])) {
      excerpt_items = await fetchFeedItems(feedUrl)
      if (excerpt_items.length) break
    }
    const hasArticlePreview = !!(preview?.title || preview?.description || preview?.image)
    const category = excerpt_items.length > 0 ? 'feed' : product ? 'product' : hasArticlePreview ? 'article' : 'generic'
    const fallback_reason = category === 'generic' ? 'no_safe_preview_metadata' : null
    return { preview, domain, excerpt_items, product, category, fallback_reason, published_at }
  } catch {
    return emptyResult(domain, 'fetch_failed')
  }
}
