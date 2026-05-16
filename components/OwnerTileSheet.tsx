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
  thumbnail_url_override?: string | null
  caption?: string | null
  caption_hidden?: boolean | null
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

  // ── Honest controls: video tiles bypass `size` entirely in the public
  //    grid engine (lib/media/aspect.ts getGridClass, isVideo branch),
  //    and their only meaningful aspect distinction is tall vs not-tall
  //    — 'square' and 'wide' both render at aspect-video. Hide controls
  //    that would produce no visible change to honor the no-dead-control
  //    doctrine. The grid engine is unchanged; this is render-time gating
  //    of the editor surface only.
  const isVideo = isVideoTile(tile.type, tile.url || undefined)
  const isMusic = tile.type === 'spotify' || tile.type === 'apple_music'
  const VISIBLE_SHAPES = isMusic
    ? SHAPES.filter((s) => s.key !== 'tall')
    : isVideo
    ? SHAPES.filter((s) => s.key !== 'square')
    : SHAPES
  // Legacy rows may carry aspect='square' on video tiles (predates the
  // hide). For those, light the 'wide' pill so the highlighted state
  // matches what the user actually sees in the grid.
  const highlightedShape = isMusic && resolvedShape === 'tall'
    ? 'wide'
    : isVideo && resolvedShape === 'square'
      ? 'wide'
      : resolvedShape

  function patchTile(body: Record<string, unknown>) {
    fetch('/api/tiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tile.id, source, slug, ...body }),
    }).then((res) => {
      if (!res.ok) console.error('tile PATCH failed', res.status)
    }).catch((e) => console.error('tile PATCH threw', e))
  }

  // ── Link authoring: title + thumbnail override ──
  // Only surfaced for link tiles (source === 'links'). Stripe/payment
  // tiles inherit the same controls so users can author them rather than
  // accepting the generic CTA fallback.
  const isLinkTile = source === 'links' && tile.type !== 'container' && tile.type !== 'thought'
  // Embed-rendered tiles paint fullbleed with no Footprint chrome surface
  // for an authored title — the row would be a dead control. Thumbnail
  // override stays available because broken provider thumbs do happen.
  const EMBED_TYPES = ['youtube', 'spotify', 'vimeo', 'soundcloud', 'tiktok', 'instagram', 'twitter', 'bandcamp']
  const showTitleRow = isLinkTile && !EMBED_TYPES.includes(tile.type)
  const [titleDraft, setTitleDraft] = useState(tile.title || '')
  const [thumbUploading, setThumbUploading] = useState(false)
  const [thumbError, setThumbError] = useState<string | null>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)

  function commitTitle(next: string) {
    const trimmed = next.trim()
    const current = (tile.title || '').trim()
    if (trimmed === current) return
    onTileChange(tile.id, { title: trimmed || null })
    patchTile({ title: trimmed })
  }

  async function handleThumbnailPick(file: File) {
    setThumbError(null)
    setThumbUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slug', slug)
      const res = await fetch('/api/tiles/thumbnail', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        setThumbError(data?.error || 'upload failed')
        return
      }
      // Await the PATCH so a backend failure (missing column, auth, etc.)
      // surfaces an error instead of optimistic-then-silent-revert: image
      // appears locally, reload kills it, user has no idea why.
      const patchRes = await fetch('/api/tiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tile.id, source, slug, thumbnail_url_override: data.url }),
      })
      if (!patchRes.ok) {
        const patchErr = await patchRes.json().catch(() => null)
        setThumbError(patchErr?.error || `save failed (${patchRes.status})`)
        return
      }
      onTileChange(tile.id, { thumbnail_url_override: data.url })
    } catch {
      setThumbError('upload failed')
    } finally {
      setThumbUploading(false)
    }
  }

  function handleClearThumbnail() {
    onTileChange(tile.id, { thumbnail_url_override: null })
    patchTile({ thumbnail_url_override: null })
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

  function handleRoom(roomId: string) {
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
    patchTile({ room_id: next })
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

        {/* Link authoring — title + thumbnail override. Surfaced only on
            link tiles (Stripe/payment included). Title row hidden for
            embed types (YouTube, Spotify, etc.) where authored titles
            have no rendering surface. Library tiles use their own
            captioning UI. Hidden for containers and thoughts. */}
        {showTitleRow && (
          <>
            <div style={rowStyle}>
              <span style={rowLabel}>title</span>
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
                  textAlign: 'right',
                  minWidth: 160,
                  maxWidth: 280,
                }}
              />
            </div>
          </>
        )}

        {isLinkTile && (
          <>
            <div style={showTitleRow ? { ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' } : rowStyle}>
              <span style={rowLabel}>image</span>
              <div className="flex items-center gap-2">
                {tile.thumbnail_url_override && (
                  <button
                    type="button"
                    onClick={handleClearThumbnail}
                    style={pillBase}
                    aria-label="remove image"
                  >
                    remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => thumbInputRef.current?.click()}
                  disabled={thumbUploading}
                  style={pillBase}
                  aria-label={tile.thumbnail_url_override ? 'replace image' : 'add image'}
                >
                  {thumbUploading
                    ? 'uploading…'
                    : tile.thumbnail_url_override
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
                fontFamily: "'DM Mono', 'Courier New', monospace",
                fontSize: 13,
                lineHeight: 1.5,
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        )}

        {/* Row 1 — shape. For video tiles 'square' is hidden — it
            collapses to wide in the grid engine, so showing it as a
            distinct pill would be a dead control. */}
        <div style={(canSetWallpaper || showNoteRow) ? { ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' } : rowStyle}>
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

        {/* Row 2 — size. Hidden for video tiles: the grid engine
            (lib/media/aspect.ts) ignores `size` on the video branch
            and renders a fixed col/row-span footprint regardless of
            S/M/L. Surfacing the pills as clickable when they have no
            visible effect would be a dead control. */}
        {!isVideo && (
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
