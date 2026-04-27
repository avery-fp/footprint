export interface FootprintTitleSource {
  display_title?: string | null
  display_name?: string | null
  title?: string | null
  name?: string | null
  username?: string | null
  slug?: string | null
}

export interface FootprintStateRoomSnapshot {
  id?: string | null
  name: string
  position: number
  hidden?: boolean
  layout?: 'grid' | 'editorial'
}

export interface FootprintStateTileSnapshot {
  id?: string | null
  source: 'library' | 'links'
  url: string
  type: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  embed_html: string | null
  position: number
  room_id?: string | null
  size?: number
  aspect?: string | null
  caption?: string | null
  caption_hidden?: boolean | null
  render_mode?: string | null
  artist?: string | null
  thumbnail_url_hq?: string | null
  media_id?: string | null
}

export interface FootprintStateSnapshot {
  version: 1
  active_room_id: string | null
  footprint: {
    display_title: string | null
    display_name: string | null
    handle: string | null
    bio: string | null
    theme: string
    grid_mode: string
    avatar_url: string | null
    background_url: string | null
    background_blur: boolean
  }
  rooms: FootprintStateRoomSnapshot[]
  content: FootprintStateTileSnapshot[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeSource(value: unknown, type: string): 'library' | 'links' {
  if (value === 'library' || value === 'links') return value
  return type === 'image' || type === 'video' ? 'library' : 'links'
}

export function getFootprintDisplayTitle(source: FootprintTitleSource | null | undefined): string | null {
  if (!source) return null

  const candidates = [
    source.display_title,
    source.display_name,
    source.title,
    source.name,
    source.username,
    source.slug,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed.toLowerCase() === 'ae') return 'æ'
    return trimmed
  }

  return null
}

export function normalizeFootprintStateSnapshot(input: unknown): FootprintStateSnapshot {
  const snapshot = isRecord(input) ? input : {}
  const footprint = isRecord(snapshot.footprint) ? snapshot.footprint : {}
  const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : []
  const content = Array.isArray(snapshot.content) ? snapshot.content : []

  return {
    version: 1,
    active_room_id: stringOrNull(snapshot.active_room_id),
    footprint: {
      display_title: stringOrNull(footprint.display_title),
      display_name: stringOrNull(footprint.display_name),
      handle: stringOrNull(footprint.handle),
      bio: stringOrNull(footprint.bio),
      theme: stringOrNull(footprint.theme) || 'midnight',
      grid_mode: stringOrNull(footprint.grid_mode) || 'grid',
      avatar_url: stringOrNull(footprint.avatar_url),
      background_url: stringOrNull(footprint.background_url),
      background_blur: booleanOr(footprint.background_blur, true),
    },
    rooms: rooms
      .map((room, index) => {
        const value = isRecord(room) ? room : {}
        const layout = value.layout === 'editorial' ? 'editorial' : 'grid'

        return {
          id: stringOrNull(value.id),
          name: stringOrNull(value.name) || `Room ${index + 1}`,
          position: numberOr(value.position, index),
          hidden: booleanOr(value.hidden, false),
          layout,
        } satisfies FootprintStateRoomSnapshot
      })
      .sort((a, b) => a.position - b.position),
    content: content
      .map((tile, index) => {
        const value = isRecord(tile) ? tile : {}
        const type = stringOrNull(value.type) || 'link'

        return {
          id: stringOrNull(value.id),
          source: normalizeSource(value.source, type),
          url: stringOrNull(value.url) || '',
          type,
          title: stringOrNull(value.title),
          description: stringOrNull(value.description),
          thumbnail_url: stringOrNull(value.thumbnail_url),
          embed_html: stringOrNull(value.embed_html),
          position: numberOr(value.position, index),
          room_id: stringOrNull(value.room_id),
          size: numberOr(value.size, 1),
          aspect: stringOrNull(value.aspect),
          caption: stringOrNull(value.caption),
          caption_hidden: typeof value.caption_hidden === 'boolean' ? value.caption_hidden : false,
          render_mode: stringOrNull(value.render_mode),
          artist: stringOrNull(value.artist),
          thumbnail_url_hq: stringOrNull(value.thumbnail_url_hq),
          media_id: stringOrNull(value.media_id),
        } satisfies FootprintStateTileSnapshot
      })
      .filter(tile => tile.url)
      .sort((a, b) => a.position - b.position),
  }
}
