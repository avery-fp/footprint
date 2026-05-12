'use client'

import { useEffect } from 'react'
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
}: OwnerTileSheetProps) {
  // ESC closes the sheet — common keyboard expectation for transient panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
  const VISIBLE_SHAPES = isVideo
    ? SHAPES.filter((s) => s.key !== 'square')
    : SHAPES
  // Legacy rows may carry aspect='square' on video tiles (predates the
  // hide). For those, light the 'wide' pill so the highlighted state
  // matches what the user actually sees in the grid.
  const highlightedShape = isVideo && resolvedShape === 'square'
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
    onTileChange(tile.id, { room_id: next })
    patchTile({ room_id: next })
    onClose()
  }

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

        {/* Row 1 — shape. For video tiles 'square' is hidden — it
            collapses to wide in the grid engine, so showing it as a
            distinct pill would be a dead control. */}
        <div style={rowStyle}>
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

        {/* Row 4 — room dropdown — disabled for launch.
            Hidden entirely until the cross-room move state machine
            (server PATCH + local state mirror + activeRoomId switch
            + container child cascade) is proven safe end-to-end on
            prod. handleRoom and the PATCH room_id path are left in
            place so a future re-enable is a single render block, not
            a re-implementation. */}
      </div>
    </>
  )
}
