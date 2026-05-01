import { createServerSupabaseClient } from './supabase'
import { transformImageUrl } from './image'
import { mediaTypeFromUrl } from './media'

/**
 * Single source of truth for loading a footprint's room data.
 *
 * Before this existed, `app/[slug]/page.tsx` (public SSR) and
 * `app/api/footprint/[slug]/route.ts` (editor GET) maintained parallel
 * implementations of the same queries + filters + field mapping, and
 * they drifted. The editor would default to a hidden room while public
 * landed on a visible one; the public would map `clip_start_ms` while
 * the editor forgot; image URLs were CDN-transformed on one surface and
 * raw on the other. The user-visible effect was "public has content
 * editor doesn't" and a constant feeling that two surfaces were two
 * different products.
 *
 * Every surface now consumes this function. `ownerView` only flips the
 * published-filter on the footprint row — it does NOT create a second
 * version of reality for room selection, tile filters, sort order, or
 * field mapping.
 *
 * Callers are responsible for ownership checks when `ownerView: true`
 * (this function does not verify the request user owns the footprint).
 */

export type TileSource = 'library' | 'links'

export interface Tile {
  id: string
  url: string | null
  type: string
  title?: string | null
  description?: string | null
  thumbnail_url?: string | null
  embed_html?: string | null
  position: number
  room_id: string | null
  size: number
  aspect: string | null
  caption?: string | null
  caption_hidden?: boolean | null
  render_mode?: string
  artist?: string | null
  thumbnail_url_hq?: string | null
  media_id?: string | null
  container_label?: string | null
  container_cover_url?: string | null
  clip_start_ms?: number | null
  clip_end_ms?: number | null
  playback_url?: string | null
  poster_url?: string | null
  status?: string | null
  parent_tile_id: string | null
  source: TileSource
}

export interface Room {
  id: string
  name: string
  layout: 'grid' | 'mix' | 'rail'
  position: number
}

export interface ContainerMeta {
  childCount: number
  firstThumb: string | null
}

export interface FootprintLoadResult {
  footprint: any
  rooms: Room[]
  content: Tile[]
  containerMeta: Record<string, ContainerMeta>
}

function normalizeRoomLayout(raw: unknown): Room['layout'] {
  if (raw === 'editorial') return 'mix'
  if (raw === 'grid' || raw === 'mix' || raw === 'rail') return raw
  return 'grid'
}

function mapLibraryRow(row: any): Tile {
  const rawUrl = (row.image_url || '').replace(/[\n\r]/g, '')
  const isVideo = mediaTypeFromUrl(rawUrl, row.media_kind) === 'video'
  const usePlaybackUrl = isVideo && row.playback_url && row.status === 'ready'
  return {
    id: row.id,
    url: usePlaybackUrl
      ? row.playback_url
      : isVideo
      ? rawUrl
      : transformImageUrl(rawUrl) || rawUrl || null,
    type: isVideo ? 'video' : 'image',
    title: row.title || null,
    description: null,
    thumbnail_url: null,
    embed_html: null,
    position: row.position ?? 0,
    room_id: row.room_id || null,
    size: row.size || 1,
    aspect: row.aspect || null,
    caption: row.caption || null,
    caption_hidden: row.caption_hidden ?? false,
    playback_url: row.playback_url || null,
    poster_url: row.poster_url || null,
    status: row.status || null,
    parent_tile_id: row.parent_tile_id || null,
    source: 'library',
  }
}

function mapLinkRow(row: any): Tile {
  return {
    id: row.id,
    url: row.url,
    type: row.platform,
    title: row.title,
    description: row.metadata?.description || null,
    thumbnail_url: transformImageUrl(row.thumbnail) || null,
    embed_html: row.metadata?.embed_html || null,
    position: row.position ?? 0,
    room_id: row.room_id || null,
    size: row.size || 1,
    aspect: row.aspect || null,
    render_mode: row.render_mode || 'embed',
    artist: row.artist || null,
    thumbnail_url_hq: row.thumbnail_url_hq || null,
    media_id: row.media_id || null,
    container_label: row.container_label || null,
    container_cover_url: row.container_cover_url || null,
    clip_start_ms: row.metadata?.clip_start_ms ?? null,
    clip_end_ms: row.metadata?.clip_end_ms ?? null,
    parent_tile_id: row.parent_tile_id || null,
    source: 'links',
  }
}

export async function loadFootprint(
  slug: string,
  opts: { ownerView: boolean }
): Promise<FootprintLoadResult | null> {
  const supabase = createServerSupabaseClient()

  let footprintQuery = supabase.from('footprints').select('*').eq('username', slug)
  if (!opts.ownerView) footprintQuery = footprintQuery.eq('published', true)
  const { data: footprint } = await footprintQuery.single()
  if (!footprint) return null

  // Draft footprints have no serial_number — tiles/rooms are keyed by
  // serial, so there's nothing to fetch. Return an empty shell instead
  // of erroring so the editor still renders for a brand-new user.
  if (!footprint.serial_number) {
    return { footprint, rooms: [], content: [], containerMeta: {} }
  }

  const serial = footprint.serial_number
  // .limit(2000) is load-bearing: supabase-js v2.39 silently truncates
  // .select('*').order('position') results around 64 rows. Without an explicit
  // limit, the most recently created tiles disappear from the editor and the
  // public page. PostgREST returns the full set; the SDK drops the tail.
  const [imagesRes, linksRes, roomsRes, childImagesRes, childLinksRes] = await Promise.all([
    supabase
      .from('library')
      .select('*')
      .eq('serial_number', serial)
      .is('parent_tile_id', null)
      .order('position')
      .limit(2000),
    supabase
      .from('links')
      .select('*')
      .eq('serial_number', serial)
      .is('parent_tile_id', null)
      .order('position')
      .limit(2000),
    supabase
      .from('rooms')
      .select('*')
      .eq('serial_number', serial)
      .neq('hidden', true)
      .order('position')
      .limit(2000),
    supabase
      .from('library')
      .select('id, parent_tile_id, image_url, position')
      .eq('serial_number', serial)
      .not('parent_tile_id', 'is', null)
      .order('position')
      .limit(2000),
    supabase
      .from('links')
      .select('id, parent_tile_id, thumbnail, thumbnail_url_hq, position')
      .eq('serial_number', serial)
      .not('parent_tile_id', 'is', null)
      .order('position')
      .limit(2000),
  ])

  const content = [
    ...(imagesRes.data || []).map(mapLibraryRow),
    ...(linksRes.data || []).map(mapLinkRow),
  ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const rooms: Room[] = (roomsRes.data || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    layout: normalizeRoomLayout(r.layout),
    position: r.position ?? 0,
  }))

  const containerMeta: Record<string, ContainerMeta> = {}
  for (const img of (childImagesRes.data || []) as any[]) {
    if (!img.parent_tile_id) continue
    const meta = containerMeta[img.parent_tile_id] ?? { childCount: 0, firstThumb: null }
    meta.childCount++
    if (!meta.firstThumb && img.image_url) {
      meta.firstThumb = transformImageUrl(img.image_url) || null
    }
    containerMeta[img.parent_tile_id] = meta
  }
  for (const link of (childLinksRes.data || []) as any[]) {
    if (!link.parent_tile_id) continue
    const meta = containerMeta[link.parent_tile_id] ?? { childCount: 0, firstThumb: null }
    meta.childCount++
    const thumb = link.thumbnail_url_hq || link.thumbnail
    if (!meta.firstThumb && thumb) {
      meta.firstThumb = transformImageUrl(thumb) || null
    }
    containerMeta[link.parent_tile_id] = meta
  }

  return { footprint, rooms, content, containerMeta }
}
