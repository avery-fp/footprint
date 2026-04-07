/**
 * SCRAPER — Google Maps Places API pipeline
 *
 * Takes (city, category, radius) → queries Google Places API →
 * extracts business name, website, phone, address →
 * stores in swarm_targets with deduplication via place_id.
 *
 * No enrichment here — just raw contact harvesting.
 */

import { getSupabase } from './lib/supabase'
import type { SwarmTarget, SwarmScrapeJob } from './types'

// ─── Google Places API types ──────────────────────────────

interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  rating?: number
  user_ratings_total?: number
  formatted_phone_number?: string
  website?: string
  types?: string[]
}

interface PlacesResponse {
  results: PlaceResult[]
  next_page_token?: string
  status: string
  error_message?: string
}

interface PlaceDetailsResponse {
  result: PlaceResult & {
    formatted_phone_number?: string
    website?: string
    address_components?: Array<{
      long_name: string
      short_name: string
      types: string[]
    }>
  }
  status: string
}

// ─── Category → Google Places type mapping ────────────────

const CATEGORY_MAP: Record<string, string> = {
  barbershop: 'barber_shop',
  salon: 'beauty_salon',
  tattoo: 'tattoo_parlor',
  gym: 'gym',
  yoga: 'yoga_studio',
  cafe: 'cafe',
  restaurant: 'restaurant',
  bar: 'bar',
  gallery: 'art_gallery',
  boutique: 'clothing_store',
  florist: 'florist',
  bakery: 'bakery',
  spa: 'spa',
  photography: 'photographer',
  music_venue: 'night_club',
  bookstore: 'book_store',
  jewelry: 'jewelry_store',
  pet_store: 'pet_store',
  auto_repair: 'car_repair',
  dentist: 'dentist',
  realtor: 'real_estate_agency',
  lawyer: 'lawyer',
  accountant: 'accounting',
  plumber: 'plumber',
  electrician: 'electrician',
}

// ─── Geocoding: city name → lat/lng ───────────────────────

async function geocodeCity(city: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${apiKey}`
  const res = await fetch(url)
  const data = await res.json() as { results: Array<{ geometry: { location: { lat: number; lng: number } } }>; status: string }

  if (data.status !== 'OK' || data.results.length === 0) {
    return null
  }

  return data.results[0].geometry.location
}

// ─── Places Nearby Search ─────────────────────────────────

async function searchPlaces(
  lat: number,
  lng: number,
  type: string,
  radius: number,
  apiKey: string,
  pageToken?: string,
): Promise<PlacesResponse> {
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`

  if (pageToken) {
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${apiKey}`
  }

  const res = await fetch(url)
  return res.json() as Promise<PlacesResponse>
}

// ─── Place Details (phone + website) ──────────────────────

async function getPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetailsResponse> {
  const fields = 'formatted_phone_number,website,address_components'
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`
  const res = await fetch(url)
  return res.json() as Promise<PlaceDetailsResponse>
}

// ─── Parse state from address components ──────────────────

function extractState(components?: PlaceDetailsResponse['result']['address_components']): string | null {
  if (!components) return null
  const state = components.find(c => c.types.includes('administrative_area_level_1'))
  return state?.short_name || null
}

// ─── Main scrape function ─────────────────────────────────

export interface ScrapeOptions {
  city: string
  category: string
  radius?: number // meters, default 50000 (50km)
  maxResults?: number // default 60 (3 pages)
  dryRun?: boolean
}

export interface ScrapeResult {
  scraped: number
  duplicates: number
  errors: string[]
}

export async function scrapeCity(opts: ScrapeOptions): Promise<ScrapeResult> {
  // DRY-RUN HARD GUARD: short-circuit before any external call. The previous
  // in-loop dryRun check still ran the geocode + Places + Details API calls
  // and only skipped the DB write — costing real Google Places quota on every
  // dry run. The new contract is: dry-run touches NO third-party APIs and
  // performs NO DB writes. The mock-only pipeline in src/aro/swarm.ts is the
  // only legitimate path for dry-run target generation.
  if (opts.dryRun) {
    console.log(`  [scraper] DRY-RUN guard: skipping ${opts.city}/${opts.category} (no Google Places call, no DB write)`)
    return { scraped: 0, duplicates: 0, errors: [] }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return { scraped: 0, duplicates: 0, errors: ['GOOGLE_PLACES_API_KEY not set'] }
  }

  const supabase = getSupabase()
  const radius = opts.radius || 50000
  const maxResults = opts.maxResults || 60
  const placeType = CATEGORY_MAP[opts.category] || opts.category

  console.log(`  [scraper] ${opts.city} / ${opts.category} (type: ${placeType}, radius: ${radius}m)`)

  // Track job
  await supabase.from('swarm_scrape_jobs').upsert({
    city: opts.city,
    category: opts.category,
    radius_meters: radius,
    status: 'running',
    started_at: new Date().toISOString(),
  }, { onConflict: 'city,category' })

  // Geocode city
  const location = await geocodeCity(opts.city, apiKey)
  if (!location) {
    const err = `Failed to geocode: ${opts.city}`
    await supabase.from('swarm_scrape_jobs').update({ status: 'failed', error: err }).eq('city', opts.city).eq('category', opts.category)
    return { scraped: 0, duplicates: 0, errors: [err] }
  }

  console.log(`  [scraper] geocoded: ${location.lat}, ${location.lng}`)

  // Paginate through results
  let scraped = 0
  let duplicates = 0
  const errors: string[] = []
  let pageToken: string | undefined

  for (let page = 0; page < 3 && scraped < maxResults; page++) {
    const results = await searchPlaces(location.lat, location.lng, placeType, radius, apiKey, pageToken)

    if (results.status !== 'OK' && results.status !== 'ZERO_RESULTS') {
      errors.push(`Places API error: ${results.status} — ${results.error_message || ''}`)
      break
    }

    if (!results.results || results.results.length === 0) break

    for (const place of results.results) {
      if (scraped >= maxResults) break

      // Get details for phone + website
      let phone: string | null = null
      let website: string | null = null
      let state: string | null = null

      try {
        const details = await getPlaceDetails(place.place_id, apiKey)
        if (details.status === 'OK') {
          phone = details.result.formatted_phone_number || null
          website = details.result.website || null
          state = extractState(details.result.address_components)
        }
      } catch (err) {
        // Details fetch failed — continue with what we have
      }

      if (opts.dryRun) {
        console.log(`  [dry] ${place.name} | ${place.formatted_address} | ${website || 'no website'} | ${phone || 'no phone'}`)
        scraped++
        continue
      }

      // Upsert to swarm_targets (dedup by place_id)
      const { error } = await supabase.from('swarm_targets').upsert({
        place_id: place.place_id,
        name: place.name,
        category: opts.category,
        city: opts.city,
        state,
        address: place.formatted_address,
        phone,
        website,
        rating: place.rating || null,
        review_count: place.user_ratings_total || 0,
        status: 'scraped',
        scraped_at: new Date().toISOString(),
      }, { onConflict: 'place_id', ignoreDuplicates: false })

      if (error) {
        if (error.code === '23505') {
          duplicates++
        } else {
          errors.push(`Insert failed for ${place.name}: ${error.message}`)
        }
      } else {
        scraped++
      }
    }

    pageToken = results.next_page_token
    if (!pageToken) break

    // Google requires a short delay before using next_page_token
    await new Promise(r => setTimeout(r, 2000))
  }

  // Update job status
  await supabase.from('swarm_scrape_jobs').update({
    status: 'completed',
    results_count: scraped,
    completed_at: new Date().toISOString(),
  }).eq('city', opts.city).eq('category', opts.category)

  console.log(`  [scraper] ${opts.city}/${opts.category}: ${scraped} scraped, ${duplicates} dupes, ${errors.length} errors`)

  return { scraped, duplicates, errors }
}

// ─── Batch scrape across multiple city/category pairs ─────

export interface BatchScrapeOptions {
  targets: Array<{ city: string; category: string }>
  radius?: number
  maxPerTarget?: number
  dryRun?: boolean
}

export async function scrapeBatch(opts: BatchScrapeOptions): Promise<ScrapeResult> {
  let totalScraped = 0
  let totalDuplicates = 0
  const allErrors: string[] = []

  console.log(`\n  [scraper] batch: ${opts.targets.length} city/category pairs`)

  for (const target of opts.targets) {
    const result = await scrapeCity({
      city: target.city,
      category: target.category,
      radius: opts.radius,
      maxResults: opts.maxPerTarget,
      dryRun: opts.dryRun,
    })

    totalScraped += result.scraped
    totalDuplicates += result.duplicates
    allErrors.push(...result.errors)

    // Rate limit between targets
    await new Promise(r => setTimeout(r, 1000))
  }

  return { scraped: totalScraped, duplicates: totalDuplicates, errors: allErrors }
}
