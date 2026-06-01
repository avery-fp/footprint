'use client'

import { useEffect, useRef, useState } from 'react'
import { isVideoTile } from '@/lib/media/aspect'

/**
 * OwnerTileSheet — shape, size, collection, room.
 *
 * Surfaces when an owner taps a tile in editor mode. Replaces the
 * OwnerActionBar at the same vertical position (one is open at a time
 * — the bottom is "owner verb space", contextual to whether a tile is
 * selected). Tap outside or close ✕ dismisses.
 *
 * Mutations are optimistic + fire-and-forget: the parent updates local
 * state immediately, this sheet PATCHes /api/tiles in the background.
 * No save button.
 */

type Tile = {
  id: string
  type: string
  url?: string | null
  size?: number | null
  aspect?: string | null
  parent_tile_id?: string | null
  room_id?: string | null
  title?: string | null
  description?: string | null
  metadata?: Record<string, any> | null
  thumbnail_url?: string | null
  thumbnail_url_override?: string | null
  container_cover_url?: string | null
  caption?: string | null
  caption_hidden?: boolean | null
  text_style?: 'clean' | 'editorial' | 'mono' | null
}

type TileSource = 'library' | 'links'

interface OwnerTileSheetProps {
  tile: Tile
  source: TileSource
  containers: Array<{ id: string; container_label?: string | null; title?: string | null }>
  rooms: Array<{ id: string; name: string }>
  slug: string
  onClose: () => void
  /** Optimistic local update — runs synchronously before the network call. */
  onTileChange: (id: string, patch: Partial<Tile>) => void
  /** Optimistic local removal — runs synchronously before the DELETE. */
  onTileDelete: (id: string) => void
  /**
   * Image URL derived from the tile by the parent. Null when the tile has
   * no usable visual media — the row is hidden in that case (no dead button).
   */
  wallpaperUrl?: string | null
  /** Optimistic wallpaper swap — parent updates local state + PATCHes. */
  onSetWallpaper?: (url: string) => void
  /**
   * Cross-room move. When provided, the room dropdown calls this instead
   * of onTileChange so the parent can both relocate the tile in
   * roomsLocal AND switch the active room to the destination. Without it
   * the moved tile would silently vanish from the source room with no
   * confirmation that the move worked.
   */
  onTileMovedToRoom?: (id: string, destRoomId: string) => void
}

const SHAPES: Array<{ key: 'square' | 'wide' | 'tall'; label: string }> = [
  { key: 'square', label: 'square' },
  { key: 'wide', label: 'wide' },
  { key: 'tall', label: 'tall' },
]
const SIZES: Array<{ key: 1 | 2 | 3; label: string }> = [
  { key: 1, label: 'S' },
  { key: 2, label: 'M' },
  { key: 3, label: 'L' },
]

const glassPanel: React.CSSProperties = {
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 4px',
}

const rowLabel: React.CSSProperties = {
  fontFamily: "'DM Mono', 'Courier New', monospace",
  fontSize: 12,
  letterSpacing: '0.04em',
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'lowercase',
}

const pillBase: React.CSSProperties = {
  fontFamily: "'DM Mono', 'Courier New', monospace",
  fontSize: 12,
  letterSpacing: '0.04em',
  padding: '6px 14px',
  borderRadius: 999,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  textTransform: 'lowercase',
}

const pillActive: React.CSSProperties = {
  ...pillBase,
  background: 'rgba(255,255,255,0.10)',
  border: '1px solid rgba(255,255,255,0.20)',
  color: 'rgba(255,255,255,0.95)',
}

const sourceInputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 10,
  padding: '8px 10px',
  color: 'rgba(255,255,255,0.85)',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 12,
  lineHeight: 1.35,
  outline: 'none',
}

const SOURCE_KINDS = ['portal', 'profile', 'post', 'media', 'article', 'feed', 'product'] as const
type SourceKind = typeof SOURCE_KINDS[number]
type SourceItemDraft = ReturnType<typeof blankSourceItem>

const SOURCE_HELPER_COPY: Record<'instagram' | 'x' | 'product' | 'tiktok' | 'generic', string> = {
  instagram: 'Instagram blocks public feed previews. Add visual rows manually or configure Meta oEmbed later.',
  x: 'X profile feeds are limited. Add recent thought rows manually or use individual tweet links.',
  product: 'If product data is blocked, add product fields manually.',
  tiktok: 'TikTok previews can be limited. Add visual rows manually when the player is unavailable.',
  generic: 'Author rows or product details for blocked sources.',
}

function blankSourceItem() {
  return { title: '', text: '', description: '', image: '', url: '', date: '' }
}

function blankProduct() {
  return { name: '', image: '', description: '', price: '', currency: '', seller: '', brand: '', condition: '', availability: '' }
}

function sourceHost(url?: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '').toLowerCase() : ''
  } catch {
    return ''
  }
}

function sourceAuthoringProfile(url?: string | null): { suggestedKind: SourceKind | null; copy: string; platform: string } {
  const host = sourceHost(url)
  if (/(^|\.)instagram\.com$/.test(host)) {
    return { suggestedKind: 'media', copy: SOURCE_HELPER_COPY.instagram, platform: 'Instagram' }
  }
  if (/(^|\.)x\.com$/.test(host) || /(^|\.)twitter\.com$/.test(host)) {
    return { suggestedKind: 'profile', copy: SOURCE_HELPER_COPY.x, platform: 'X' }
  }
  if (/(^|\.)depop\.com$/.test(host) || /(^|\.)vinted\./.test(host)) {
    return { suggestedKind: 'product', copy: SOURCE_HELPER_COPY.product, platform: host.includes('depop') ? 'Depop' : 'Vinted' }
  }
  if (/(^|\.)tiktok\.com$/.test(host)) {
    return { suggestedKind: 'media', copy: SOURCE_HELPER_COPY.tiktok, platform: 'TikTok' }
  }
  return { suggestedKind: null, copy: SOURCE_HELPER_COPY.generic, platform: host || 'source' }
}

function productHasValue(product: any) {
  if (!product || typeof product !== 'object') return false
  return ['name', 'image', 'description', 'price', 'currency', 'priceCurrency', 'seller', 'brand', 'condition', 'availability']
    .some((key) => typeof product[key] === 'string' && product[key].trim())
}

function normalizeProduct(product: any) {
  return {
    name: product?.name || '',
    image: product?.image || '',
    description: product?.description || '',
    price: product?.price || '',
    currency: product?.currency || product?.priceCurrency || '',
    seller: product?.seller || '',
    brand: product?.brand || '',
    condition: product?.condition || '',
    availability: product?.availability || '',
  }
}

function normalizeSourceDraft(tile: Tile) {
  const metadata = tile.metadata || {}
  const current = metadata.source_excerpt || {}
  const legacyItems = Array.isArray(metadata.excerpt_items) ? metadata.excerpt_items : []
  const rawItems = Array.isArray(current.items) && current.items.length ? current.items : legacyItems
  const product = current.product || metadata.product || null
  const profile = sourceAuthoringProfile(tile.url)
  let domain = current.domain || metadata.domain || null
  try {
    if (!domain && tile.url) domain = new URL(tile.url).hostname.replace(/^www\./, '')
  } catch {}
  const kind = current.kind || (productHasValue(product) ? 'product' : rawItems.length ? profile.suggestedKind || 'feed' : metadata.source_excerpt_category === 'article' ? 'article' : profile.suggestedKind || 'portal')
  return {
    kind,
    source: current.source || metadata.site_name || domain || '',
    domain: domain || '',
    title: current.title || tile.title || '',
    handle: current.handle || '',
    description: current.description || metadata.description || tile.description || '',
    image: current.image || tile.thumbnail_url_override || '',
    url: current.url || metadata.canonical_url || tile.url || '',
    date: current.date || metadata.published_at || '',
    items: rawItems.slice(0, 12).map((item: any) => ({
      title: item?.title || '',
      text: item?.text || item?.description || '',
      description: item?.description || item?.text || '',
      image: item?.image || '',
      url: item?.url || '',
      date: item?.date || '',
    })),
    product: productHasValue(product) ? normalizeProduct(product) : blankProduct(),
    fallback_reason: current.fallback_reason || metadata.source_excerpt_fallback_reason || null,
  }
}

export default function OwnerTileSheet({
  tile,
  source,
  containers,
  rooms,
  slug,
  onClose,
  onTileChange,
  onTileDelete,
  wallpaperUrl,
  onSetWallpaper,
  onTileMovedToRoom,
}: OwnerTileSheetProps) {
  // ESC closes the sheet — common keyboard expectation for transient panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Note state for image tiles. Library tiles only — links has no
  //    caption column and PATCH /api/tiles will return 400 if we try.
  //    Textarea persists on blur (not keystroke) so we don't spam PATCH.
  const [noteDraft, setNoteDraft] = useState(tile.caption || '')
  const noteSavedRef = useRef(tile.caption || '')
  useEffect(() => {
    // Reset when switching between tiles in the same sheet instance.
    setNoteDraft(tile.caption || '')
    noteSavedRef.current = tile.caption || ''
  }, [tile.id, tile.caption])
  const captionHiddenCurrent = !!tile.caption_hidden

  // Resolved aspect for highlight: the user's stored pick wins; smart
  // defaults are not pre-lit (they're invisible defaults, not selections).
  const stored = tile.aspect
  const resolvedShape: 'square' | 'wide' | 'tall' | null =
    stored === 'square' || stored === 'wide' || stored === 'tall' ? stored : null
  const currentSize = (tile.size || 1) as 1 | 2 | 3
  const isContainer = tile.type === 'container'

  // ── Honest controls: video tiles still bypass `size`, but shape is real:
  //    square/wide/tall each map to distinct video geometry.
  const isVideo = isVideoTile(tile.type, tile.url || undefined)
  const isMusic = tile.type === 'spotify' || tile.type === 'apple_music'
  const VISIBLE_SHAPES = isMusic
    ? SHAPES.filter((s) => s.key !== 'tall')
    : SHAPES
  const highlightedShape = isMusic && resolvedShape === 'tall'
    ? 'wide'
    : resolvedShape

  async function patchTile(body: Record<string, unknown>) {
    try {
      const res = await fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tile.id, source, slug, ...body }),
      })
      if (!res.ok) {
        console.error('tile PATCH failed', res.status)
        return false
      }
      return true
    } catch (e) {
      console.error('tile PATCH threw', e)
      return false
    }
  }

  // ── Link authoring: title + thumbnail override ──
  // Only surfaced for link tiles (source === 'links'). Stripe/payment
  // tiles inherit the same controls so users can author them rather than
  // accepting the generic CTA fallback.
  const isLinkTile = source === 'links' && tile.type !== 'container' && tile.type !== 'thought'
  // Most embed-rendered tiles paint fullbleed with no Footprint chrome surface
  // for an authored title. X/Instagram still use authored preview text inside
  // their Footprint shell/fallback, so keep manual override available there.
  const EMBED_TYPES = ['youtube', 'spotify', 'vimeo', 'soundcloud', 'tiktok', 'instagram', 'twitter', 'bandcamp']
  const SOCIAL_OVERRIDE_TYPES = ['twitter', 'x', 'instagram']
  const showTitleRow = isLinkTile && (!EMBED_TYPES.includes(tile.type) || SOCIAL_OVERRIDE_TYPES.includes(tile.type))
  const [titleDraft, setTitleDraft] = useState(tile.title || '')
  const [descriptionDraft, setDescriptionDraft] = useState(tile.description || '')
  const [imageUrlDraft, setImageUrlDraft] = useState(tile.thumbnail_url_override || '')
  const [previewRefreshing, setPreviewRefreshing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<string | null>(null)
  const [thoughtDraft, setThoughtDraft] = useState(tile.title || '')
  const [thoughtStyle, setThoughtStyle] = useState<'clean' | 'editorial' | 'mono'>(tile.text_style || 'clean')
  const thoughtSavedRef = useRef(tile.title || '')
  const [thumbUploading, setThumbUploading] = useState(false)
  const [thumbError, setThumbError] = useState<string | null>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)
  const isContainerCoverTile = source === 'links' && tile.type === 'container'
  const showCoverRow = isContainerCoverTile || (isLinkTile && !showTitleRow)
  const showSourceExcerptEditor = isLinkTile
  const [sourceDraft, setSourceDraft] = useState(() => normalizeSourceDraft(tile))

  useEffect(() => {
    setSourceDraft(normalizeSourceDraft(tile))
  }, [tile.id, tile.metadata, tile.title, tile.description, tile.thumbnail_url_override, tile.url])

  function getCoverPatch(url: string | null) {
    return isContainerCoverTile
      ? { container_cover_url: url }
      : { thumbnail_url_override: url }
  }

  function getCurrentCover() {
    return isContainerCoverTile
      ? tile.container_cover_url || null
      : tile.thumbnail_url_override || null
  }

  function withManualSourceExcerpt(patch: { title?: string | null; description?: string | null; image?: string | null }) {
    const metadata = { ...(tile.metadata || {}) }
    const current = sourceDraft || metadata.source_excerpt || {}
    const rawProduct = current.product || metadata.product || null
    const product = current.kind === 'product' && productHasValue(rawProduct) ? normalizeProduct(rawProduct) : null
    const legacyItems = Array.isArray(metadata.excerpt_items) ? metadata.excerpt_items : []
    const currentItems = Array.isArray(current.items) ? current.items : []
    const items = (currentItems.length ? currentItems : legacyItems).slice(0, 12).map((item: any) => ({
      title: item?.title || null,
      text: item?.text || item?.description || null,
      description: item?.description || item?.text || null,
      image: item?.image || null,
      url: item?.url || null,
      date: item?.date || null,
    }))
    let domain = current.domain || metadata.domain || null
    try {
      if (!domain && tile.url) domain = new URL(tile.url).hostname.replace(/^www\./, '')
    } catch {}
    const profile = sourceAuthoringProfile(tile.url)
    metadata.description = patch.description !== undefined ? patch.description : metadata.description || null
    metadata.source_excerpt = {
      kind: current.kind || (product ? 'product' : items.length ? profile.suggestedKind || 'feed' : metadata.source_excerpt_category === 'article' ? 'article' : profile.suggestedKind || 'portal'),
      source: current.source || metadata.site_name || domain,
      domain,
      title: patch.title !== undefined ? patch.title : current.title || tile.title || null,
      handle: current.handle || null,
      description: metadata.description || current.description || null,
      image: patch.image !== undefined ? patch.image : current.image || tile.thumbnail_url_override || null,
      url: current.url || metadata.canonical_url || tile.url || null,
      date: current.date || metadata.published_at || null,
      items,
      product,
      fallback_reason: current.fallback_reason || metadata.source_excerpt_fallback_reason || null,
    }
    return metadata
  }

  function sourceExcerptPayload(next: any) {
    const product = productHasValue(next.product) ? normalizeProduct(next.product) : null
    return {
      ...next,
      kind: next.kind || sourceAuthoringProfile(tile.url).suggestedKind || 'portal',
      product: next.kind === 'product' && product ? product : null,
      items: Array.isArray(next.items) ? next.items.slice(0, 12) : [],
    }
  }

  function saveSourceExcerptDraft(next: any) {
    const uiDraft = { ...next, product: next.product || blankProduct() }
    const payload = sourceExcerptPayload(uiDraft)
    setSourceDraft(uiDraft)
    const metadata = { ...(tile.metadata || {}), source_excerpt: payload }
    onTileChange(tile.id, { metadata })
    patchTile({ source_excerpt: payload })
  }

  function updateSourceDraft(patch: Record<string, any>, save = false) {
    const next = { ...sourceDraft, ...patch }
    setSourceDraft(next)
    if (save) saveSourceExcerptDraft(next)
    return next
  }

  function updateSourceItem(index: number, patch: Record<string, string>, save = false) {
    const items = [...sourceDraft.items]
    items[index] = { ...items[index], ...patch }
    updateSourceDraft({ items }, save)
  }

  function updateSourceProduct(patch: Record<string, string>, save = false) {
    updateSourceDraft({ kind: 'product', product: { ...sourceDraft.product, ...patch } }, save)
  }

  async function savePreviewPatch(body: Record<string, unknown>, okMessage = 'saved') {
    setPreviewError(null)
    setPreviewStatus('saving...')
    const ok = await patchTile(body)
    if (ok) {
      setPreviewStatus(okMessage)
      window.setTimeout(() => setPreviewStatus((current) => (current === okMessage ? null : current)), 1600)
    } else {
      setPreviewStatus(null)
      setPreviewError('save failed')
    }
    return ok
  }

  function commitTitle(next: string) {
    const trimmed = next.trim()
    const current = (tile.title || '').trim()
    if (trimmed === current) return
    onTileChange(tile.id, { title: trimmed || null, metadata: withManualSourceExcerpt({ title: trimmed || null }) })
    savePreviewPatch({ title: trimmed })
  }

  function commitDescription(next: string) {
    const trimmed = next.trim()
    const current = (tile.description || '').trim()
    if (trimmed === current) return
    onTileChange(tile.id, {
      description: trimmed || null,
      metadata: withManualSourceExcerpt({ description: trimmed || null }),
    })
    savePreviewPatch({ preview_description: trimmed || null })
  }

  function commitImageUrl(next: string) {
    const trimmed = next.trim()
    const current = (tile.thumbnail_url_override || '').trim()
    if (trimmed === current) return
    onTileChange(tile.id, { thumbnail_url_override: trimmed || null, metadata: withManualSourceExcerpt({ image: trimmed || null }) })
    savePreviewPatch({ thumbnail_url_override: trimmed || null })
  }

  useEffect(() => {
    setTitleDraft(tile.title || '')
    setDescriptionDraft(tile.description || '')
    setImageUrlDraft(tile.thumbnail_url_override || '')
    setPreviewError(null)
    setPreviewStatus(null)
  }, [tile.id, tile.title, tile.description, tile.thumbnail_url_override])

  async function fetchPreviewMetadata() {
    if (!tile.url) return null
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(tile.url)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'refresh failed')
    return data
  }

  function applyPreviewMetadata(data: any) {
    const nextTitle = (data?.title || '').trim()
    const nextDescription = (data?.description || '').trim()
    const nextImage = (data?.image || '').trim()
    const nextMetadata = {
      ...withManualSourceExcerpt({ title: nextTitle || null, description: nextDescription || null, image: nextImage || null }),
      site_name: data?.siteName || null,
      canonical_url: data?.canonical || data?.url || null,
    }
    setTitleDraft(nextTitle)
    setDescriptionDraft(nextDescription)
    setImageUrlDraft(nextImage)
    onTileChange(tile.id, {
      title: nextTitle || null,
      description: nextDescription || null,
      thumbnail_url_override: nextImage || null,
      metadata: nextMetadata,
    })
    return {
      title: nextTitle,
      preview_description: nextDescription || null,
      preview_site_name: data?.siteName || null,
      preview_canonical_url: data?.canonical || data?.url || null,
      thumbnail_url_override: nextImage || null,
    }
  }

  async function handleRefreshPreview() {
    if (!tile.url) return
    setPreviewError(null)
    const hasManualValues = !!(
      (titleDraft || '').trim() ||
      (descriptionDraft || '').trim() ||
      (tile.thumbnail_url_override || '').trim()
    )
    if (hasManualValues && !window.confirm('replace current preview fields with fetched metadata?')) return
    setPreviewRefreshing(true)
    try {
      const data = await fetchPreviewMetadata()
      if (!data) return
      savePreviewPatch(applyPreviewMetadata(data), 'refreshed')
    } catch (error: any) {
      setPreviewError(error?.message || 'refresh failed')
    } finally {
      setPreviewRefreshing(false)
    }
  }

  async function handleClearPreviewOverride() {
    if (!window.confirm('clear title, description, and image overrides for this tile?')) return
    setPreviewError(null)
    setPreviewStatus('clearing...')
    try {
      const data = await fetchPreviewMetadata()
      if (data?.title || data?.description || data?.image) {
        savePreviewPatch(applyPreviewMetadata(data), 'cleared')
        return
      }
    } catch {
      // If the source is blocked, fall back to compact source rendering.
    }
    setTitleDraft('')
    setDescriptionDraft('')
    setImageUrlDraft('')
    onTileChange(tile.id, {
      title: null,
      description: null,
      thumbnail_url_override: null,
      metadata: withManualSourceExcerpt({ title: null, description: null, image: null }),
    })
    savePreviewPatch({ title: '', preview_description: null, thumbnail_url_override: null }, 'cleared')
  }

  useEffect(() => {
    setThoughtDraft(tile.title || '')
    setThoughtStyle(tile.text_style || 'clean')
    thoughtSavedRef.current = tile.title || ''
  }, [tile.id, tile.title, tile.text_style])

  function handleThoughtBlur() {
    const next = thoughtDraft.trim()
    if (next === (thoughtSavedRef.current || '')) return
    thoughtSavedRef.current = next
    onTileChange(tile.id, { title: next || null })
    patchTile({ title: next })
  }

  function setThoughtTypography(next: 'clean' | 'editorial' | 'mono') {
    setThoughtStyle(next)
    onTileChange(tile.id, { text_style: next })
    patchTile({ text_style: next })
  }

  async function handleThumbnailPick(file: File) {
    setThumbError(null)
    setThumbUploading(true)
    const previousThumb = getCurrentCover()
    const previewUrl = URL.createObjectURL(file)
    onTileChange(tile.id, getCoverPatch(previewUrl))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slug', slug)
      const res = await fetch('/api/tiles/thumbnail', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        setThumbError(data?.error || 'upload failed')
        onTileChange(tile.id, getCoverPatch(previousThumb))
        return
      }
      // Await the PATCH so a backend failure (missing column, auth, etc.)
      // surfaces an error instead of optimistic-then-silent-revert: image
      // appears locally, reload kills it, user has no idea why.
      const patchRes = await fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tile.id, source, slug, ...getCoverPatch(data.url) }),
      })
      if (!patchRes.ok) {
        const patchErr = await patchRes.json().catch(() => null)
        setThumbError(patchErr?.error || `save failed (${patchRes.status})`)
        onTileChange(tile.id, getCoverPatch(previousThumb))
        return
      }
      onTileChange(tile.id, getCoverPatch(data.url))
    } catch {
      setThumbError('upload failed')
      onTileChange(tile.id, getCoverPatch(previousThumb))
    } finally {
      URL.revokeObjectURL(previewUrl)
      setThumbUploading(false)
    }
  }

  function handleClearThumbnail() {
    onTileChange(tile.id, getCoverPatch(null))
    patchTile(getCoverPatch(null))
  }

  function handleShape(next: 'square' | 'wide' | 'tall') {
    onTileChange(tile.id, { aspect: next })
    patchTile({ aspect: next })
  }

  function handleSize(next: 1 | 2 | 3) {
    if (next === currentSize) return
    onTileChange(tile.id, { size: next })
    patchTile({ size: next })
  }

  function handleCollection(parentId: string) {
    const next = parentId || null
    onTileChange(tile.id, { parent_tile_id: next })
    patchTile({ parent_tile_id: next })
    // Tile leaves street-level when parented; close so the sheet doesn't
    // sit referencing a tile that's no longer in the active room.
    if (next) onClose()
  }

  async function handleRoom(roomId: string) {
    const next = roomId || null
    if ((tile.room_id || '') === (next || '')) return
    // If the parent wires onTileMovedToRoom, defer to it: it updates the
    // destination room's content array AND switches the active room so
    // the moved tile is visibly there instead of silently disappearing
    // from the source. Fall back to onTileChange for the unwire/null case.
    if (next && onTileMovedToRoom) {
      onTileMovedToRoom(tile.id, next)
    } else {
      onTileChange(tile.id, { room_id: next })
    }
    await patchTile({ room_id: next })
    onClose()
  }

  function handleSetWallpaper() {
    if (!wallpaperUrl || !onSetWallpaper) return
    onSetWallpaper(wallpaperUrl)
    onClose()
  }

  function handleNoteBlur() {
    // Skip the PATCH when nothing changed — typing then blurring without
    // edits should be a no-op, not a phantom network call.
    const next = noteDraft.trim()
    if (next === (noteSavedRef.current || '')) return
    noteSavedRef.current = next
    onTileChange(tile.id, { caption: next || null })
    patchTile({ caption: next })
  }

  function handleVisibility(nextHidden: boolean) {
    if (nextHidden === captionHiddenCurrent) return
    onTileChange(tile.id, { caption_hidden: nextHidden })
    patchTile({ caption_hidden: nextHidden })
  }

  // Note row is library-only. Text/link tiles (links source) have no
  // caption column — surfacing the controls there would be a dead
  // control that PATCH /api/tiles now rejects with a 400.
  const showNoteRow = source === 'library'
  const showThoughtRow = tile.type === 'thought'

  // Whether to surface the "use as wallpaper" row. Hidden when the tile
  // has no usable visual media (text-only thoughts, links without a
  // thumbnail, provider tiles missing their thumb) or when the parent
  // hasn't wired the handler — no dead buttons.
  const canSetWallpaper = !!(wallpaperUrl && onSetWallpaper)

  function handleDelete() {
    if (!window.confirm('delete this tile?')) return
    onTileDelete(tile.id)
    fetch('/api/tiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, source, id: tile.id }),
    }).catch((e) => console.error('tile DELETE threw', e))
    onClose()
  }

  const authoring = sourceAuthoringProfile(tile.url)
  const effectiveSourceKind = (sourceDraft.kind || authoring.suggestedKind || 'portal') as SourceKind
  const isMediaSourceExcerpt = effectiveSourceKind === 'media'
  const isProfileSourceExcerpt = effectiveSourceKind === 'profile' || effectiveSourceKind === 'post'
  const isProductSourceExcerpt = effectiveSourceKind === 'product'

  function renderSourceItemFields(item: SourceItemDraft, index: number) {
    const saveItem = () => saveSourceExcerptDraft(sourceDraft)

    if (isMediaSourceExcerpt) {
      return (
        <>
          <input
            type="url"
            value={item.image}
            onChange={(e) => updateSourceItem(index, { image: e.target.value })}
            onBlur={saveItem}
            style={sourceInputStyle}
            placeholder="image url"
          />
          <input
            type="text"
            value={item.title}
            onChange={(e) => updateSourceItem(index, { title: e.target.value })}
            onBlur={saveItem}
            style={sourceInputStyle}
            placeholder="caption/title"
          />
          <textarea
            value={item.description}
            onChange={(e) => updateSourceItem(index, { description: e.target.value, text: e.target.value })}
            onBlur={saveItem}
            rows={2}
            style={{ ...sourceInputStyle, resize: 'none' }}
            placeholder="description"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="url"
              value={item.url}
              onChange={(e) => updateSourceItem(index, { url: e.target.value })}
              onBlur={saveItem}
              style={sourceInputStyle}
              placeholder="item url"
            />
            <input
              type="text"
              value={item.date}
              onChange={(e) => updateSourceItem(index, { date: e.target.value })}
              onBlur={saveItem}
              style={sourceInputStyle}
              placeholder="date"
            />
          </div>
        </>
      )
    }

    if (isProfileSourceExcerpt) {
      return (
        <>
          <textarea
            value={item.title}
            onChange={(e) => updateSourceItem(index, { title: e.target.value, text: e.target.value })}
            onBlur={saveItem}
            rows={3}
            style={{ ...sourceInputStyle, resize: 'vertical' }}
            placeholder="thought text"
          />
          <textarea
            value={item.description}
            onChange={(e) => updateSourceItem(index, { description: e.target.value })}
            onBlur={saveItem}
            rows={2}
            style={{ ...sourceInputStyle, resize: 'none' }}
            placeholder="description optional"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="url"
              value={item.url}
              onChange={(e) => updateSourceItem(index, { url: e.target.value })}
              onBlur={saveItem}
              style={sourceInputStyle}
              placeholder="item url optional"
            />
            <input
              type="text"
              value={item.date}
              onChange={(e) => updateSourceItem(index, { date: e.target.value })}
              onBlur={saveItem}
              style={sourceInputStyle}
              placeholder="date optional"
            />
          </div>
        </>
      )
    }

    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={item.title}
            onChange={(e) => updateSourceItem(index, { title: e.target.value })}
            onBlur={saveItem}
            style={sourceInputStyle}
            placeholder="title/text"
          />
          <input
            type="text"
            value={item.date}
            onChange={(e) => updateSourceItem(index, { date: e.target.value })}
            onBlur={saveItem}
            style={sourceInputStyle}
            placeholder="date"
          />
          <input
            type="url"
            value={item.image}
            onChange={(e) => updateSourceItem(index, { image: e.target.value })}
            onBlur={saveItem}
            style={sourceInputStyle}
            placeholder="image url"
          />
          <input
            type="url"
            value={item.url}
            onChange={(e) => updateSourceItem(index, { url: e.target.value })}
            onBlur={saveItem}
            style={sourceInputStyle}
            placeholder="item url"
          />
        </div>
        <textarea
          value={item.description}
          onChange={(e) => updateSourceItem(index, { description: e.target.value, text: e.target.value })}
          onBlur={saveItem}
          rows={2}
          style={{ ...sourceInputStyle, resize: 'none' }}
          placeholder="description"
        />
      </>
    )
  }

  return (
    <>
      {/* Backdrop — soft dim + tap-to-close. Pulled below the sheet so
          taps land on the dimmer first; sheet's stopPropagation keeps
          clicks inside from leaking. */}
      <div
        className="fixed inset-0 z-[40]"
        style={{ background: 'rgba(0,0,0,0.25)' }}
        onClick={onClose}
      />

      <div
        className="fixed left-1/2 -translate-x-1/2 z-[41] px-4 py-3"
        style={{
          ...glassPanel,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
          width: 'min(560px, calc(100vw - 32px))',
          maxHeight: 'min(760px, calc(100vh - 104px))',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="tile editor"
      >
        {/* Top strip — close + delete */}
        <div className="flex items-center justify-between mb-1" style={{ paddingBottom: 4 }}>
          <button
            type="button"
            aria-label="close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="delete tile"
            onClick={handleDelete}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(220,90,90,0.55)',
              cursor: 'pointer',
              padding: 4,
              fontFamily: "'DM Mono', 'Courier New', monospace",
              fontSize: 11,
              letterSpacing: '0.04em',
              textTransform: 'lowercase',
            }}
          >
            delete
          </button>
        </div>

        {/* Preview override — source/link tiles only. */}
        {showTitleRow && (
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              padding: '12px 4px 14px',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div style={rowLabel}>preview</div>
                <p className="mt-1 text-[11px] leading-snug text-white/32">
                  Use this when a site gives a weak preview.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={handleRefreshPreview}
                  disabled={previewRefreshing || !tile.url}
                  style={pillBase}
                  aria-label="refresh preview"
                >
                  {previewRefreshing ? 'refreshing...' : 'refresh'}
                </button>
                <button
                  type="button"
                  onClick={handleClearPreviewOverride}
                  style={pillBase}
                  aria-label="clear preview override"
                >
                  clear
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span style={rowLabel}>preview title</span>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={(e) => commitTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                maxLength={200}
                placeholder="optional"
                style={{
                  ...pillBase,
                    width: '100%',
                    marginTop: 8,
                    borderRadius: 12,
                    textAlign: 'left',
                }}
              />
              </label>

              <label className="block">
                <span style={rowLabel}>preview description</span>
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={(e) => commitDescription(e.target.value)}
                placeholder="optional"
                rows={2}
                maxLength={500}
                style={{
                  width: '100%',
                    marginTop: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.45,
                  outline: 'none',
                  resize: 'none',
                }}
              />
              </label>

              <label className="block">
                <span style={rowLabel}>preview image url</span>
                <input
                  type="url"
                  value={imageUrlDraft}
                  onChange={(e) => setImageUrlDraft(e.target.value)}
                  onBlur={(e) => commitImageUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  placeholder="optional"
                  style={{
                    ...pillBase,
                    width: '100%',
                    marginTop: 8,
                    borderRadius: 12,
                    textAlign: 'left',
                  }}
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <div>
                  {previewStatus ? (
                    <span style={{ ...rowLabel, color: 'rgba(255,255,255,0.62)' }}>
                      {previewStatus}
                    </span>
                  ) : previewError ? (
                    <span style={{ ...rowLabel, color: 'rgba(220,90,90,0.7)' }}>
                      {previewError}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {getCurrentCover() && (
                    <button
                      type="button"
                      onClick={handleClearThumbnail}
                      style={pillBase}
                      aria-label="remove preview image"
                    >
                      remove image
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => thumbInputRef.current?.click()}
                    disabled={thumbUploading}
                    style={pillBase}
                    aria-label="replace preview image"
                  >
                    {thumbUploading ? 'uploading...' : 'replace image'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSourceExcerptEditor && (
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              padding: '12px 4px 14px',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div style={rowLabel}>source excerpt</div>
                <p className="mt-1 text-[11px] leading-snug text-white/32">
                  {authoring.copy}
                </p>
              </div>
              <select
                value={sourceDraft.kind}
                onChange={(e) => updateSourceDraft({ kind: e.target.value }, true)}
                style={{ ...pillBase, paddingRight: 28 }}
                aria-label="source excerpt kind"
              >
                {SOURCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
            </div>
            {authoring.suggestedKind && authoring.suggestedKind !== sourceDraft.kind ? (
              <button
                type="button"
                onClick={() => saveSourceExcerptDraft({ ...sourceDraft, kind: authoring.suggestedKind })}
                className="mt-3"
                style={pillBase}
              >
                use {authoring.platform} {authoring.suggestedKind}
              </button>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <span style={rowLabel}>source</span>
                <input
                  type="text"
                  value={sourceDraft.source}
                  onChange={(e) => updateSourceDraft({ source: e.target.value })}
                  onBlur={() => saveSourceExcerptDraft(sourceDraft)}
                  style={sourceInputStyle}
                  placeholder="site or source"
                />
              </label>
              <label>
                <span style={rowLabel}>handle</span>
                <input
                  type="text"
                  value={sourceDraft.handle}
                  onChange={(e) => updateSourceDraft({ handle: e.target.value })}
                  onBlur={() => saveSourceExcerptDraft(sourceDraft)}
                  style={sourceInputStyle}
                  placeholder="@handle"
                />
              </label>
            </div>

            {isProductSourceExcerpt ? (
              <>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span style={rowLabel}>product</span>
                  <button
                    type="button"
                    onClick={() => saveSourceExcerptDraft({ ...sourceDraft, kind: 'product' })}
                    style={pillActive}
                  >
                    product card
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input type="url" value={sourceDraft.product.image} onChange={(e) => updateSourceProduct({ image: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="product image" />
                  <input type="text" value={sourceDraft.product.name} onChange={(e) => updateSourceProduct({ name: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="name" />
                  <input type="text" value={sourceDraft.product.price} onChange={(e) => updateSourceProduct({ price: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="price" />
                  <input type="text" value={sourceDraft.product.currency} onChange={(e) => updateSourceProduct({ currency: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="currency" />
                  <input type="text" value={sourceDraft.product.seller} onChange={(e) => updateSourceProduct({ seller: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="seller" />
                  <input type="text" value={sourceDraft.product.brand} onChange={(e) => updateSourceProduct({ brand: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="brand" />
                  <input type="text" value={sourceDraft.product.condition} onChange={(e) => updateSourceProduct({ condition: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="condition" />
                  <input type="text" value={sourceDraft.product.availability} onChange={(e) => updateSourceProduct({ availability: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="availability" />
                </div>
                <textarea
                  value={sourceDraft.product.description}
                  onChange={(e) => updateSourceProduct({ description: e.target.value })}
                  onBlur={() => saveSourceExcerptDraft(sourceDraft)}
                  rows={2}
                  style={{ ...sourceInputStyle, resize: 'none' }}
                  placeholder="product description"
                />
              </>
            ) : null}

            {!isProductSourceExcerpt ? (
              <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span style={rowLabel}>items</span>
              <button
                type="button"
                onClick={() => {
                  const items = [...sourceDraft.items, blankSourceItem()].slice(0, 12)
                  saveSourceExcerptDraft({ ...sourceDraft, items, kind: sourceDraft.kind === 'portal' ? 'feed' : sourceDraft.kind })
                }}
                disabled={sourceDraft.items.length >= 12}
                style={pillBase}
              >
                add row
              </button>
            </div>
            <div className="mt-2 space-y-3">
              {(sourceDraft.items.length ? sourceDraft.items : [blankSourceItem()]).map((item: ReturnType<typeof blankSourceItem>, index: number) => (
                <div
                  key={index}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 10,
                    background: 'rgba(255,255,255,0.025)',
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span style={rowLabel}>row {index + 1}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (index === 0) return
                          const items = [...sourceDraft.items]
                          ;[items[index - 1], items[index]] = [items[index], items[index - 1]]
                          saveSourceExcerptDraft({ ...sourceDraft, items })
                        }}
                        disabled={index === 0 || sourceDraft.items.length === 0}
                        style={pillBase}
                      >
                        up
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const items = sourceDraft.items.filter((_: any, i: number) => i !== index)
                          saveSourceExcerptDraft({ ...sourceDraft, items })
                        }}
                        disabled={sourceDraft.items.length === 0}
                        style={pillBase}
                      >
                        remove
                      </button>
                    </div>
                  </div>
                  {renderSourceItemFields(item, index)}
                </div>
              ))}
            </div>
              </>
            ) : null}

            {!isProductSourceExcerpt ? (
              <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span style={rowLabel}>product</span>
              <button
                type="button"
                onClick={() => saveSourceExcerptDraft({ ...sourceDraft, kind: 'product' })}
                style={sourceDraft.kind === 'product' ? pillActive : pillBase}
              >
                use product
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="text" value={sourceDraft.product.name} onChange={(e) => updateSourceProduct({ name: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="name" />
              <input type="url" value={sourceDraft.product.image} onChange={(e) => updateSourceProduct({ image: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="image url" />
              <input type="text" value={sourceDraft.product.price} onChange={(e) => updateSourceProduct({ price: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="price" />
              <input type="text" value={sourceDraft.product.currency} onChange={(e) => updateSourceProduct({ currency: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="currency" />
              <input type="text" value={sourceDraft.product.seller} onChange={(e) => updateSourceProduct({ seller: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="seller" />
              <input type="text" value={sourceDraft.product.brand} onChange={(e) => updateSourceProduct({ brand: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="brand" />
              <input type="text" value={sourceDraft.product.condition} onChange={(e) => updateSourceProduct({ condition: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="condition" />
              <input type="text" value={sourceDraft.product.availability} onChange={(e) => updateSourceProduct({ availability: e.target.value })} onBlur={() => saveSourceExcerptDraft(sourceDraft)} style={sourceInputStyle} placeholder="availability" />
            </div>
            <textarea
              value={sourceDraft.product.description}
              onChange={(e) => updateSourceProduct({ description: e.target.value })}
              onBlur={() => saveSourceExcerptDraft(sourceDraft)}
              rows={2}
              style={{ ...sourceInputStyle, resize: 'none' }}
              placeholder="product description"
            />
              </>
            ) : null}
          </div>
        )}

        {showCoverRow && (
          <>
            <div style={showTitleRow ? { ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' } : rowStyle}>
              <span style={rowLabel}>{isContainerCoverTile ? 'cover' : 'image'}</span>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                {getCurrentCover() && (
                  <button
                    type="button"
                    onClick={handleClearThumbnail}
                    style={pillBase}
                    aria-label={isContainerCoverTile ? 'remove cover' : 'remove image'}
                  >
                    remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => thumbInputRef.current?.click()}
                  disabled={thumbUploading}
                  style={pillBase}
                  aria-label={
                    isContainerCoverTile
                      ? (getCurrentCover() ? 'change cover' : 'add cover')
                      : (getCurrentCover() ? 'replace image' : 'add image')
                  }
                >
                  {thumbUploading
                    ? 'uploading…'
                    : isContainerCoverTile
                    ? (getCurrentCover() ? 'change cover' : 'add cover')
                    : getCurrentCover()
                    ? 'replace'
                    : 'add image'}
                </button>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleThumbnailPick(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
            {thumbError && (
              <p style={{ ...rowLabel, color: 'rgba(220,90,90,0.7)', padding: '0 4px 6px' }}>
                {thumbError}
              </p>
            )}
          </>
        )}

        {/* Row 0 — wallpaper. Sets the page's background_url to this
            tile's media without opening the upload dialog. Hidden when
            the tile has no usable image source (text, link without
            thumb, provider tile missing thumb) — no dead controls. */}
        {canSetWallpaper && (
          <div style={isLinkTile ? { ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' } : rowStyle}>
            <span style={rowLabel}>wallpaper</span>
            <button
              type="button"
              onClick={handleSetWallpaper}
              style={pillBase}
              aria-label="use as wallpaper"
            >
              use as wallpaper
            </button>
          </div>
        )}

        {/* Row 0.5 — note. Library tiles only. Two display modes per
            V1 spec: visible / tap to reveal. The textarea persists on
            blur; the visibility pills persist on click. */}
        {showNoteRow && (
          <div
            style={
              canSetWallpaper
                ? { ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)', flexDirection: 'column', alignItems: 'stretch', gap: 10 }
                : { ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10 }
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={rowLabel}>note</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleVisibility(false)}
                  style={!captionHiddenCurrent ? pillActive : pillBase}
                  aria-pressed={!captionHiddenCurrent}
                >
                  visible
                </button>
                <button
                  type="button"
                  onClick={() => handleVisibility(true)}
                  style={captionHiddenCurrent ? pillActive : pillBase}
                  aria-pressed={captionHiddenCurrent}
                >
                  tap to reveal
                </button>
              </div>
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="add a note..."
              rows={2}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12,
                padding: '10px 12px',
                color: 'rgba(255,255,255,0.85)',
                fontFamily:
                  thoughtStyle === 'editorial'
                    ? "Iowan Old Style, 'Times New Roman', serif"
                    : thoughtStyle === 'mono'
                      ? "'DM Mono', ui-monospace, monospace"
                      : "'DM Sans', system-ui, sans-serif",
                fontSize: thoughtStyle === 'editorial' ? 16 : thoughtStyle === 'mono' ? 13 : 14,
                lineHeight: thoughtStyle === 'editorial' ? 1.5 : thoughtStyle === 'mono' ? 1.7 : 1.6,
                outline: 'none',
                resize: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {(['clean', 'editorial', 'mono'] as const).map((styleKey) => (
                <button
                  key={styleKey}
                  type="button"
                  onClick={() => setThoughtTypography(styleKey)}
                  style={{
                    height: 28,
                    padding: '0 11px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: thoughtStyle === styleKey ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                    color: thoughtStyle === styleKey ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.52)',
                    fontSize: 11,
                    fontFamily:
                      styleKey === 'editorial'
                        ? "Iowan Old Style, 'Times New Roman', serif"
                        : styleKey === 'mono'
                          ? "'DM Mono', ui-monospace, monospace"
                          : "'DM Sans', system-ui, sans-serif",
                    cursor: 'pointer',
                  }}
                >
                  {styleKey}
                </button>
              ))}
            </div>
          </div>
        )}

        {showThoughtRow && (
          <div
            style={{
              ...rowStyle,
              borderTop: canSetWallpaper || showNoteRow ? '1px solid rgba(255,255,255,0.06)' : undefined,
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 10,
            }}
          >
            <span style={rowLabel}>text</span>
            <textarea
              autoFocus
              value={thoughtDraft}
              onChange={(e) => setThoughtDraft(e.target.value)}
              onBlur={handleThoughtBlur}
              placeholder="write something..."
              rows={4}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12,
                padding: '12px 14px',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 15,
                lineHeight: 1.5,
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        )}

        {/* Row 1 — shape. */}
        {tile.type !== 'spotify' && tile.type !== 'apple_music' && (
          <div style={(canSetWallpaper || showNoteRow || showThoughtRow) ? { ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' } : rowStyle}>
            <span style={rowLabel}>shape</span>
            <div className="flex gap-2">
              {VISIBLE_SHAPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleShape(s.key)}
                  style={highlightedShape === s.key ? pillActive : pillBase}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 2 — size. Hidden for video tiles: the grid engine
            (lib/media/aspect.ts) ignores `size` on the video branch
            and renders a fixed col/row-span footprint regardless of
            S/M/L. Surfacing the pills as clickable when they have no
            visible effect would be a dead control. */}
        {!isVideo && tile.type !== 'spotify' && tile.type !== 'apple_music' && (
          <div style={{ ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={rowLabel}>size</span>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => handleSize(s.key)}
                  style={currentSize === s.key ? pillActive : pillBase}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row 3 — collection — hidden when the tile IS a collection */}
        {!isContainer && containers.length > 0 && (
          <div style={{ ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={rowLabel}>collection</span>
            <select
              value={tile.parent_tile_id || ''}
              onChange={(e) => handleCollection(e.target.value)}
              style={{
                ...pillBase,
                paddingRight: 28,
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">none</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.container_label || c.title || 'collection'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Row 4 — room dropdown — relocates the tile to another room.
            Drag-to-room is intentionally still disabled in PublicPage's
            handleDragEnd (overId.startsWith('room:') early-return); this
            sheet is the only path that moves a tile cross-room. Parent's
            handleTileChange filters the tile out of the active room
            locally when room_id changes; the PATCH persists it. */}
        {rooms.length > 0 && (
          <div style={{ ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={rowLabel}>room</span>
            <select
              value={tile.room_id || ''}
              onChange={(e) => handleRoom(e.target.value)}
              style={{
                ...pillBase,
                paddingRight: 28,
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                cursor: 'pointer',
              }}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || 'room'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </>
  )
}
