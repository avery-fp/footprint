/**
 * GRAILED FAVORITES EXTRACTOR
 *
 * Parses a Grailed favorites / list / user page HTML into a flat list of
 * Footprint-native listing objects. Footprint never renders Grailed's UI;
 * we extract the listing grammar (image, brand, title, price, size, age,
 * location) and re-place it inside a native tray.
 *
 * Extraction is best-effort. Grailed is a Next.js app and the listing data
 * usually lives in __NEXT_DATA__ as a JSON blob. We also try JSON-LD and a
 * loose HTML fallback for older/cached responses. If nothing parses, we
 * return an empty list and the UI falls back to a sealed preview card.
 */
export interface GrailedListing {
  id: string
  imageUrl: string
  brand: string | null
  title: string | null
  price: string | null
  size: string | null
  age: string | null
  location: string | null
  externalUrl: string
}

const GRAILED_BASE = 'https://www.grailed.com'

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function isHttpUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false
  return /^https?:\/\//i.test(u)
}

function pickString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) return t
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

function formatPrice(value: unknown, currency: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const t = value.trim()
    return /^[$€£¥]/.test(t) ? t : `$${t}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'
    return `${sym}${Math.round(value).toLocaleString('en-US')}`
  }
  return null
}

function relativeAge(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso.trim()) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const diff = Date.now() - t
  if (diff < 0) return null
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min || 1}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

function pickImage(node: any): string | null {
  if (!node) return null
  if (isHttpUrl(node)) return node
  if (typeof node === 'object') {
    return (
      pickString(node.url, node.image_url, node.src) ||
      (Array.isArray(node) && node.length > 0 ? pickImage(node[0]) : null)
    )
  }
  return null
}

function pickDesigner(node: any): string | null {
  if (!node) return null
  const designers = node.designers || node.designer_names || node.designer
  if (Array.isArray(designers)) {
    const names = designers
      .map((d: any) => (typeof d === 'string' ? d : pickString(d?.name, d?.designer_name)))
      .filter(Boolean)
    if (names.length > 0) return names.slice(0, 2).join(' × ')
  }
  return pickString(node.brand, node.designer_name, designers)
}

function pickListingUrl(node: any): string | null {
  const direct = pickString(node?.url, node?.permalink, node?.share_url, node?.href)
  if (direct) {
    if (direct.startsWith('http')) return direct
    if (direct.startsWith('/')) return GRAILED_BASE + direct
  }
  const id = pickString(node?.id, node?.listing_id)
  if (id) return `${GRAILED_BASE}/listings/${id}`
  return null
}

function normalizeListing(raw: any): GrailedListing | null {
  if (!raw || typeof raw !== 'object') return null

  const photos = raw.photos || raw.cover_photo || raw.images
  const imageUrl =
    pickImage(raw.cover_photo) ||
    (Array.isArray(photos) ? pickImage(photos[0]) : pickImage(photos)) ||
    pickImage(raw.image)
  if (!imageUrl) return null

  const id =
    pickString(raw.id, raw.listing_id, raw.objectID) ||
    imageUrl.slice(-32)

  return {
    id,
    imageUrl,
    brand: pickDesigner(raw),
    title: pickString(raw.title, raw.name),
    price: formatPrice(
      raw.price ?? raw.current_price ?? raw.price_drop_amount ?? raw.original_price,
      raw.currency
    ),
    size: pickString(raw.size, raw.size_label),
    age: relativeAge(raw.bumped_at || raw.updated_at || raw.created_at),
    location: pickString(raw.location, raw.country, raw.user_location),
    externalUrl: pickListingUrl(raw) || GRAILED_BASE,
  }
}

/**
 * Recursively walk a JSON blob and collect anything that looks like a Grailed
 * listing. We key on objects that have both an image and a designer/title.
 */
function walkForListings(node: any, out: GrailedListing[], seen: Set<string>, max: number) {
  if (out.length >= max) return
  if (!node) return
  if (Array.isArray(node)) {
    for (const child of node) walkForListings(child, out, seen, max)
    return
  }
  if (typeof node !== 'object') return

  const looksLikeListing =
    (node.cover_photo || node.photos || node.images || node.image) &&
    (node.designers || node.designer || node.title || node.name) &&
    (node.id || node.listing_id || node.objectID || node.permalink)

  if (looksLikeListing) {
    const norm = normalizeListing(node)
    if (norm && !seen.has(norm.id)) {
      seen.add(norm.id)
      out.push(norm)
      if (out.length >= max) return
    }
  }

  for (const key of Object.keys(node)) {
    walkForListings(node[key], out, seen, max)
  }
}

function extractNextData(html: string): any | null {
  const m = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  )
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

function extractInlineJsonBlobs(html: string): any[] {
  const blobs: any[] = []
  const re = /<script[^>]*type=["']application\/(?:ld\+json|json)["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      blobs.push(JSON.parse(m[1]))
    } catch {
      // ignore malformed blob
    }
  }
  return blobs
}

export function parseGrailedHtml(html: string, max = 24): GrailedListing[] {
  const out: GrailedListing[] = []
  const seen = new Set<string>()

  const next = extractNextData(html)
  if (next) walkForListings(next, out, seen, max)

  if (out.length < max) {
    for (const blob of extractInlineJsonBlobs(html)) {
      walkForListings(blob, out, seen, max)
      if (out.length >= max) break
    }
  }

  return out
}

export interface GrailedFavoritesResult {
  listings: GrailedListing[]
  count: number | null
}

export async function fetchGrailedFavorites(
  url: string,
  opts: { timeoutMs?: number; max?: number } = {}
): Promise<GrailedFavoritesResult> {
  const timeoutMs = opts.timeoutMs ?? 6000
  const max = opts.max ?? 24
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Footprint/1.0; +https://footprint.onl)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return { listings: [], count: null }
    const html = await res.text()
    const listings = parseGrailedHtml(html, max)
    const countMatch = html.match(/(\d+)\s+(?:favorites?|items?|listings?)/i)
    const count = countMatch ? Number(decodeEntities(countMatch[1])) : null
    return { listings, count: Number.isFinite(count) ? count : null }
  } catch {
    return { listings: [], count: null }
  } finally {
    clearTimeout(t)
  }
}
