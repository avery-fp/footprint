'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import UnifiedTile from '@/components/UnifiedTile'
import SAspectShell from '@/components/SAspectShell'

import WeatherEffect from '@/components/WeatherEffect'
import { RemoveBubble } from '@/components/RemoveBubble'
import FloatingCtaBar from '@/components/FloatingCtaBar'
import SovereignTile from '@/components/SovereignTile'
import CommandLayer from '@/components/CommandLayer'
import OwnerActionBar from '@/components/OwnerActionBar'
import OwnerTileSheet from '@/components/OwnerTileSheet'
import { getGridLayout, tileAspectRatio, LAYOUT_LABELS, type RoomLayout } from '@/lib/grid-layouts'
import LayoutToggle from '@/components/LayoutToggle'
import { glassStyle } from '@/lib/glass'
import { useDepthExpansion } from '@/hooks/useDepthExpansion'
import { moveChild, removeChild } from '@/lib/container-child-ops'
import { getGridClass, resolveAspect, isVideoTile } from '@/lib/media/aspect'
import { getFootprintDisplayTitle } from '@/lib/footprint'
import { getRoomAtmosphere } from '@/lib/roomAtmosphere'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Room {
  id: string
  name: string
  layout?: string
  content: any[]
}

interface PublicPageProps {
  footprint: any
  content: any[]
  rooms: Room[]
  theme: any
  serial: string
  pageUrl: string
  isDraft?: boolean
  isOwnerHinted?: boolean
  containerMeta?: Record<string, { childCount: number; firstThumb: string | null }>
  ownerEmail?: string | null
}

// Room subtitles removed — the rooms speak for themselves
// Wallpaper filter + overlay per room live in lib/roomAtmosphere.ts so
// the editor and public render the same room with the same atmosphere.

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft, isOwnerHinted = false, containerMeta = {}, ownerEmail = null }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Default to first room
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])

  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  // Reset the fade-in latch whenever the wallpaper URL changes so a replace
  // doesn't render the new src at opacity-100 before the new bytes have
  // actually decoded — and so the prior image isn't held visible across a
  // soft re-render with a new background_url prop.
  useEffect(() => { setWallpaperLoaded(false) }, [footprint.background_url])
  const [isOwner, setIsOwner] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [serialFlyout, setSerialFlyout] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')
  const [roomNavDocked, setRoomNavDocked] = useState(false)

  // ── Owner editor surface ──
  // editorMode is the toggle behind the corner home button: when off,
  // strangers and owners see identical pixels. When on, owner chrome
  // (action bar, layout selector, lock icons, tile sheet) becomes
  // interactive. There is no "edit page" — same page, same DOM, just
  // an overlay of editing affordances.
  const [editorMode, setEditorMode] = useState(false)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  // Per-room layout override for live reflow after a toggle click. Reset
  // when the underlying rooms prop changes (e.g. after navigation, when
  // the server-side data is fresh again).
  const [layoutOverride, setLayoutOverride] = useState<Record<string, RoomLayout>>({})
  useEffect(() => { setLayoutOverride({}) }, [rooms])
  // Mirror props locally so optimistic owner mutations apply instantly.
  const [publishedLocal, setPublishedLocal] = useState<boolean>(footprint.published === true)
  useEffect(() => { setPublishedLocal(footprint.published === true) }, [footprint.published])
  const [displayTitleLocal, setDisplayTitleLocal] = useState<string>(footprint.display_title || '')
  useEffect(() => { setDisplayTitleLocal(footprint.display_title || '') }, [footprint.display_title])
  const [titleEditing, setTitleEditing] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // ── Integrated Void Transition ──
  const [claimActive, setClaimActive] = useState(false)

  // Capture URL params at construction time, BEFORE the cleanup effect
  // runs. SovereignTile mounts lazily (after auth check + claim activation),
  // by which point window.location.search is already empty. Without this
  // capture, the Stripe finalize flow breaks silently — session_id and
  // username vanish before SovereignTile can read them.
  const initialParams = useRef(
    typeof window !== 'undefined'
      ? {
          hasClaim: new URLSearchParams(window.location.search).has('claim'),
          sessionId: new URLSearchParams(window.location.search).get('session_id'),
          returnUsername: new URLSearchParams(window.location.search).get('username'),
        }
      : { hasClaim: false, sessionId: null as string | null, returnUsername: null as string | null }
  )
  const wantsClaim = useRef(
    initialParams.current.hasClaim || !!initialParams.current.sessionId
  )

  // Clean URL for everyone (owners too) so ?claim=1 doesn't linger
  useEffect(() => {
    if (wantsClaim.current) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Activate void for visitors only, after auth resolves
  useEffect(() => {
    if (!authChecked || isOwner || !wantsClaim.current) return
    setClaimActive(true)
  }, [authChecked, isOwner])

  const activateClaim = useCallback(() => {
    if (isOwner) return
    setSerialFlyout(false)
    setClaimActive(true)
  }, [isOwner])

  // ── Depth expansion — containers only ──
  const { expanded, showOverlay, children: containerChildren, loadingChildren, expand, collapse, registerRef } = useDepthExpansion()
  const depthTouchStart = useRef(0)

  // Resolve expanded container label for header bar
  const expandedContainerLabel = useMemo(() => {
    if (!expanded) return ''
    const item = allContent.find(c => c.id === expanded.id)
    return item?.container_label || item?.title || 'Collection'
  }, [expanded, allContent])

  // Content filtering
  const validContent = useMemo(() =>
    allContent.filter(item =>
      (item.type === 'thought' && item.title) ||
      (item.url && item.url !== '')
    ), [allContent])

  const visibleRooms = useMemo(() =>
    rooms
      .filter(r => r.name && r.name.trim().length > 0)
      .map(r => ({
        ...r,
        content: r.content.filter((item: any) =>
          (item.type === 'thought' && item.title) ||
          (item.url && item.url !== '')
        )
      })), [rooms])

  const baseContent = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

  const content = baseContent

  // Wallpaper filter + overlay come from the shared room-atmosphere table
  // so the editor renders the same room with the same atmosphere.
  const activeRoomIndex = activeRoomId ? visibleRooms.findIndex(r => r.id === activeRoomId) : -1
  const activeRoom = activeRoomId ? visibleRooms.find(r => r.id === activeRoomId) : null
  const isSoundRoom = activeRoom?.name?.toLowerCase() === 'sound'
  const { filter: wallpaperFilter, overlay: overlayColor } = getRoomAtmosphere(activeRoomIndex, isSoundRoom)

  const handleShare = () => {
    navigator.clipboard.writeText(pageUrl)
    setShowToast(true)
  }

  // Mobile detection (debounced)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setIsMobile(window.innerWidth < 768), 150)
    }
    setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => { window.removeEventListener('resize', check); clearTimeout(timeout) }
  }, [])

  // Owner check: presence of an fp_edit_{slug} cookie implies edit access.
  // The cookie is httpOnly, so we can't read its value — we just probe the
  // edit endpoint. Any failure falls through to visitor state.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/footprint/${encodeURIComponent(footprint.username)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (r.status === 200) {
          const data = await r.json()
          if (data.owned) {
            setIsOwner(true)
          }
        }
      } catch {
        // Silent — visitor path
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [footprint.username])

  // Navigate to room
  const goToRoom = useCallback((roomId: string | null) => {
    if (roomId === activeRoomId || roomFade !== 'visible') return
    setRoomFade('out')
    setTimeout(() => {
      setActiveRoomId(roomId)
      setRoomFade('in')
      setTimeout(() => setRoomFade('visible'), 300)
    }, 200)
  }, [activeRoomId, roomFade])

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  useEffect(() => {
    if (visibleRooms.length <= 1) return
    const updateDocked = () => setRoomNavDocked(window.scrollY > 160)
    updateDocked()
    window.addEventListener('scroll', updateDocked, { passive: true })
    return () => window.removeEventListener('scroll', updateDocked)
  }, [visibleRooms.length])

  // Command layer — scroll to tile on search result selection
  const handleTileNavigate = useCallback((tileId: string, roomId: string) => {
    const scrollToTile = () => {
      const el = document.querySelector(`[data-tile-id="${tileId}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.closest('.fp-tile-hover')?.classList.add('fp-tile-highlight')
      setTimeout(() => el.closest('.fp-tile-hover')?.classList.remove('fp-tile-highlight'), 1500)
    }
    if (roomId && roomId !== activeRoomId) {
      goToRoom(roomId)
      setTimeout(scrollToTile, 600)
    } else {
      scrollToTile()
    }
  }, [activeRoomId, goToRoom])

  // ═══════════════════════════════════════════
  // Drag-to-reorder for owners on public page
  // ═══════════════════════════════════════════
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null)
  const [tileSources, setTileSources] = useState<Record<string, 'library' | 'links'>>({})

  // Build tile source map from content
  useEffect(() => {
    const sources: Record<string, 'library' | 'links'> = {}
    for (const item of allContent) {
      sources[item.id] = item.source || 'library'
    }
    setTileSources(sources)
  }, [allContent])

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  const ownerSensors = useSensors(mouseSensor, touchSensor, keyboardSensor)

  const [localContent, setLocalContent] = useState<any[]>([])
  useEffect(() => { setLocalContent(content) }, [content])

  const [localChildren, setLocalChildren] = useState<any[]>([])
  useEffect(() => { setLocalChildren(containerChildren) }, [containerChildren])

  const displayTitle = useMemo(() => {
    if (displayTitleLocal && displayTitleLocal.trim()) return displayTitleLocal
    return getFootprintDisplayTitle(footprint) || '\u00e6'
  }, [footprint, displayTitleLocal])

  // \u2500\u2500 Optimistic owner mutations: tiles \u2500\u2500
  const handleTileAdded = useCallback((tile: any) => {
    setTileSources((prev) => ({ ...prev, [tile.id]: tile.source || 'library' }))
    setLocalContent((prev) => [...prev, { ...tile, position: prev.length }])
  }, [])

  const handleTileReplaced = useCallback((tempId: string, real: any) => {
    setLocalContent((prev) => prev.map((t) => (t.id === tempId ? { ...real, position: t.position } : t)))
    setTileSources((prev) => {
      const next = { ...prev }
      delete next[tempId]
      next[real.id] = real.source || 'library'
      return next
    })
  }, [])

  const handleTileProgress = useCallback((tempId: string, pct: number) => {
    setLocalContent((prev) => prev.map((t) => (t.id === tempId ? { ...t, _progress: pct } : t)))
  }, [])

  // Patch any field on a tile in-place. Used by the tile sheet for
  // size/aspect/parent_tile_id changes — keep it generic so 4.5 (rooms)
  // and 5 (drag-to-room) can lean on the same helper.
  const handleTileChange = useCallback((id: string, patch: Record<string, unknown>) => {
    setLocalContent((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const handleTileDelete = useCallback((id: string) => {
    setLocalContent((prev) => prev.filter((t) => t.id !== id))
    setTileSources((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // \u2500\u2500 Optimistic owner mutations: footprint settings \u2500\u2500
  async function patchFootprint(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/footprint/${encodeURIComponent(footprint.username)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) console.error('patchFootprint failed', res.status)
    } catch (e) {
      console.error('patchFootprint threw', e)
    }
  }

  const handlePublishedChange = useCallback((next: boolean) => {
    setPublishedLocal(next)
    patchFootprint({ published: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprint.username])

  const commitTitleEdit = useCallback(() => {
    setTitleEditing(false)
    const trimmed = (displayTitleLocal || '').trim()
    if (trimmed === (footprint.display_title || '').trim()) return
    patchFootprint({ display_title: trimmed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayTitleLocal, footprint.display_title, footprint.username])

  function handleDragStart(event: DragStartEvent) {
    setDraggingTileId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTileId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = localContent.findIndex((item: any) => item.id === active.id)
    const newIndex = localContent.findIndex((item: any) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(localContent, oldIndex, newIndex).map((item: any, index: number) => ({ ...item, position: index }))
    setLocalContent(reordered)

    // Persist positions to server
    const positions = reordered.map((item: any) => ({
      id: item.id,
      source: tileSources[item.id] || 'library',
      position: item.position,
    }))
    fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: footprint.username, positions }),
    }).catch(e => console.error('Failed to save tile order:', e))
  }

  function handleChildDelete(child: any) {
    setLocalChildren(prev => removeChild(prev, child.id))
    fetch('/api/tiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: footprint.username, source: child.source, id: child.id }),
    }).catch(e => console.error('Failed to delete child tile:', e))
  }

  function handleChildMove(idx: number, dir: -1 | 1) {
    const next = moveChild(localChildren, idx, dir)
    if (next === localChildren) return
    setLocalChildren(next)
    fetch('/api/tiles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: footprint.username,
        positions: next.map((c: any) => ({ id: c.id, source: c.source, position: c.position })),
      }),
    }).catch(e => console.error('Failed to reorder child tiles:', e))
  }

  const [addUrl, setAddUrl] = useState('')
  const [addPending, setAddPending] = useState(false)

  // Clear add-URL input whenever a different (or no) container is open
  useEffect(() => {
    setAddUrl('')
    setAddPending(false)
  }, [expanded?.id])

  async function handleChildAdd() {
    const raw = addUrl.trim()
    if (!raw || addPending || !expanded) return
    setAddPending(true)
    try {
      const res = await fetch(`/api/containers/${expanded.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: footprint.username, url: raw }),
      })
      if (!res.ok) return
      const { child } = await res.json()
      if (child) {
        setLocalChildren(prev => [...prev, child])
        setAddUrl('')
      }
    } catch (e) {
      console.error('Failed to add child tile:', e)
    } finally {
      setAddPending(false)
    }
  }

  // Sortable tile wrapper for owner drag
  function SortableTileWrapper({ item, idx, children, className, style: extraStyle, disabled }: { item: any; idx: number; children: React.ReactNode; className?: string; style?: React.CSSProperties; disabled?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
      opacity: isDragging ? 0.4 : 1,
      ...extraStyle,
    }
    return (
      <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
        {children}
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // LAYOUT — three modes, three identities, no black bars anywhere.
  //  · grid:       uniform masonry (CSS columns); native-aspect cells
  //  · horizontal: cinematic rail; native-aspect, fixed rail height
  //  · editorial:  hero + 2-col supporting masonry; native-aspect throughout
  //
  // Every tile renders at its content's native aspect-ratio via inline
  // style, with the shape pill as fallback when source dims are unknown.
  // Provider embeds (YouTube/Vimeo = 16:9, Spotify = 9:16, SoundCloud =
  // 16:9) are content-native by definition — not letterbox.
  // ═══════════════════════════════════════════
  const roomLayout: RoomLayout = (
    (activeRoomId && layoutOverride[activeRoomId]) ||
    activeRoom?.layout ||
    'grid'
  ) as RoomLayout
  const layoutConfig = getGridLayout(roomLayout)
  const isHorizontal = roomLayout === 'horizontal'
  const isEditorial = roomLayout === 'editorial'
  const isGrid = roomLayout === 'grid'
  const displayContent = isOwner ? localContent : content

  // Map any tile to a CSS aspect-ratio string. Provider embeds use their
  // content-native ratio; everything else routes through resolveAspect →
  // tileAspectRatio. SAspectShell still refines image tiles at runtime
  // when their natural dimensions arrive — see renderImageWrapped below.
  const tileAspectCss = (item: any): string => {
    const isEmbedVid = item.type === 'youtube' || item.type === 'vimeo' ||
      item.url?.includes('youtube') || item.url?.includes('youtu.be')
    if (isEmbedVid) return '16 / 9'
    if (item.type === 'spotify') return '9 / 16'
    if (item.type === 'soundcloud') return '16 / 9'
    const resolved = resolveAspect(item.aspect, item.type, item.url)
    return tileAspectRatio(resolved)
  }

  const fadeStyle = {
    opacity: roomFade === 'out' ? 0 : 1,
    transform: roomFade === 'out' ? 'translateY(6px)' : roomFade === 'in' ? 'translateY(-6px)' : 'translateY(0)',
    transition: 'opacity 250ms ease-out, transform 350ms ease-out',
  }

  // Persist a layout pick from the toggle. Optimistic update on the
  // local rooms array; PATCH /api/rooms with the canonical name.
  const handleLayoutToggle = useCallback((next: RoomLayout) => {
    if (!activeRoomId) return
    fetch('/api/rooms', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeRoomId, slug: footprint.username, layout: next }),
    }).catch((e) => console.error('layout PATCH failed', e))
    // The rooms prop is server-managed; the toggle's optimistic display
    // comes from the prop snapshot used to build activeRoom. After PATCH
    // the next navigation reloads via noStore() for owners, so the new
    // layout reads back fresh on the next render.
    setRoomFade('out')
    setTimeout(() => {
      setRoomFade('in')
      setTimeout(() => setRoomFade('visible'), 300)
    }, 200)
    // Mutate the activeRoom layout in place so the current render reflows
    // without a navigation. visibleRooms is derived from rooms; rooms is
    // the prop. We mirror the change into activeRoom's layout via a
    // closure-captured state escape hatch — easiest is to bump a local
    // override that the render path consults.
    setLayoutOverride((prev) => ({ ...prev, [activeRoomId]: next }))
  }, [activeRoomId, footprint.username])

  // ── Depth expansion: per-tile style ──
  const getDepthStyle = (tileId: string): React.CSSProperties => {
    if (!expanded) return { transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease' }
    if (expanded.id === tileId) return {
      transform: expanded.transform,
      zIndex: 50,
      transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      willChange: 'transform',
    }
    return {
      opacity: 0.1,
      transform: 'scale(0.97)',
      transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      pointerEvents: 'none' as const,
    }
  }

  // Tile body — inner content shared across all three layouts. The outer
  // wrapper (positioning + aspect-ratio) is layout-specific; this is just
  // the glass card + UnifiedTile + click overlays. Provider embeds, image
  // tiles, video tiles, thoughts all flow through the same body.
  const renderTileBody = (item: any, idx: number) => {
    const isContainer = item.type === 'container'
    const isThisExpanded = expanded?.id === item.id
    return (
      <div
        ref={(el: HTMLDivElement | null) => registerRef(item.id, el)}
        className="w-full h-full relative"
        style={getDepthStyle(item.id)}
      >
        <div
          className={`relative w-full max-w-full h-full overflow-hidden fp-tile-hover rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <UnifiedTile
            item={item}
            index={idx}
            size={item.size || 1}
            aspect={resolveAspect(item.aspect, item.type, item.url)}
            mode="public"
            layout={roomLayout}
            isMobile={isMobile}
            isSoundRoom={isSoundRoom}
            isExpanded={isThisExpanded}
            childCount={containerMeta[item.id]?.childCount}
            firstChildThumb={containerMeta[item.id]?.firstThumb}
          />
        </div>
        {/* Editor-mode click interceptor — opens the tile sheet on tap. */}
        {isOwner && editorMode && !expanded && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedTileId(item.id) }}
          />
        )}
        {/* Container click interceptor — only containers are doors. */}
        {isContainer && !expanded && !(isOwner && editorMode) && (
          <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => expand(item.id)} />
        )}
      </div>
    )
  }

  // Outer wrapper for grid + editorial-supporting masonry. Sets the
  // tile's CSS aspect-ratio inline so the cell shape matches the
  // content's native aspect — no letterbox, no pillarbox.
  const renderMasonryTile = (item: any, idx: number) => {
    const aspectCss = tileAspectCss(item)
    const tileBody = renderTileBody(item, idx)
    const wrapperClass = layoutConfig.tileClass
    const wrapperStyle: React.CSSProperties = { aspectRatio: aspectCss }
    if (isOwner) {
      return (
        <SortableTileWrapper key={item.id} item={item} idx={idx} className={wrapperClass} style={wrapperStyle} disabled={!!expanded}>
          {tileBody}
        </SortableTileWrapper>
      )
    }
    // Image tiles with no explicit shape pick get SAspectShell so the
    // cell refines from square → 3/4 or 4/3 once natural dimensions
    // arrive. Inline aspect-ratio is omitted in this branch so SAspect's
    // class wins.
    const stored = item.aspect
    const explicit = stored === 'square' || stored === 'wide' || stored === 'tall'
    if (item.type === 'image' && !explicit) {
      const resolved = resolveAspect(item.aspect, item.type, item.url)
      return (
        <div key={item.id} className={wrapperClass}>
          <SAspectShell initialAspect={resolved}>{tileBody}</SAspectShell>
        </div>
      )
    }
    return (
      <div key={item.id} className={wrapperClass} style={wrapperStyle}>
        {tileBody}
      </div>
    )
  }

  let gridInner: React.ReactNode
  if (isHorizontal) {
    // ── HORIZONTAL: cinematic rail. Each tile is its native aspect at a
    // fixed rail height, so widescreen reads as wide, vertical reads as
    // tall, square reads as square. Width derives. ──
    gridInner = (
      <div
        className={layoutConfig.containerClass}
        style={{
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          WebkitOverflowScrolling: 'touch' as any,
          paddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          paddingRight: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          ...fadeStyle,
        }}
      >
        {displayContent.map((item: any, idx: number) => {
          const aspectCss = tileAspectCss(item)
          const railHeight = isMobile ? 'min(72vh, 540px)' : 'min(70vh, 640px)'
          const wrapperStyle: React.CSSProperties = {
            height: railHeight,
            aspectRatio: aspectCss,
          }
          const wrapperClass = layoutConfig.tileClass
          const body = renderTileBody(item, idx)
          if (isOwner) {
            return (
              <SortableTileWrapper key={item.id} item={item} idx={idx} className={wrapperClass} style={wrapperStyle} disabled={!!expanded}>
                {body}
              </SortableTileWrapper>
            )
          }
          return (
            <div key={item.id} className={wrapperClass} style={wrapperStyle}>
              {body}
            </div>
          )
        })}
      </div>
    )
  } else if (isEditorial) {
    // ── EDITORIAL: hero + supporting masonry. The first tile fills the
    // full width at its native aspect; everything after flows in two
    // columns of native-aspect masonry beneath. Magazine pacing. ──
    const [hero, ...rest] = displayContent
    gridInner = (
      <div style={fadeStyle}>
        {hero && (
          <div className="px-3 md:px-4 mb-2.5 md:mb-3">
            {(() => {
              const aspectCss = tileAspectCss(hero)
              const wrapperStyle: React.CSSProperties = { aspectRatio: aspectCss }
              const body = renderTileBody(hero, 0)
              const wrapperClass = 'relative overflow-hidden rounded-2xl'
              if (isOwner) {
                return (
                  <SortableTileWrapper item={hero} idx={0} className={wrapperClass} style={wrapperStyle} disabled={!!expanded}>
                    {body}
                  </SortableTileWrapper>
                )
              }
              return (
                <div className={wrapperClass} style={wrapperStyle}>
                  {body}
                </div>
              )
            })()}
          </div>
        )}
        {rest.length > 0 && (
          <div className={layoutConfig.containerClass}>
            {rest.map((item: any, i: number) => renderMasonryTile(item, i + 1))}
          </div>
        )}
      </div>
    )
  } else {
    // ── GRID: uniform masonry. Every column is the same width; tiles
    //   flow at their native aspect ratios. No size-based span math. ──
    gridInner = (
      <div className={layoutConfig.containerClass} style={fadeStyle}>
        {displayContent.map((item: any, idx: number) => renderMasonryTile(item, idx))}
      </div>
    )
  }

  const activeGrid = isOwner ? (
    <DndContext
      sensors={ownerSensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={displayContent.map((item: any) => item.id)} strategy={rectSortingStrategy}>
        {gridInner}
      </SortableContext>
    </DndContext>
  ) : gridInner

  return (
    <div className={`relative flex min-h-[100dvh] w-full flex-col overflow-x-clip${isGrid ? ' fp-puzzle-page' : ''}`} style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
      {/* Wallpaper layer — GPU composited for 60fps scroll. Keyed by URL so
          a replaced wallpaper drops the previous decoded layer instead of
          repainting it under the new src while the new bytes load. */}
      {footprint.background_url && (
        <div key={footprint.background_url} className="fixed inset-0 z-0 fp-wallpaper-gpu">
          <Image
            src={footprint.background_url}
            alt=""
            fill
            priority
            quality={90}
            sizes="100vw"
            fetchPriority="high"
            className={`object-cover transition-opacity duration-700 ${wallpaperLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{
              filter: claimActive
                ? 'blur(60px) brightness(0.15)'
                : footprint.background_blur !== false ? wallpaperFilter : 'none',
              transition: 'filter 0.8s ease',
            }}
            onLoad={() => setWallpaperLoaded(true)}
          />
          <div
            className="absolute inset-0 transition-all duration-800"
            style={{ backgroundColor: claimActive ? 'rgba(0,0,0,0.8)' : overlayColor }}
          />
        </div>
      )}
      <WeatherEffect type={footprint.weather_effect || null} />
      <CommandLayer
        content={allContent}
        rooms={visibleRooms}
        footprint={footprint}
        theme={theme}
        isMobile={isMobile}
        isOwner={isOwner}
        activeRoomId={activeRoomId}
        onNavigateToTile={handleTileNavigate}
        onNavigateToRoom={goToRoom}
      />

      {/* Draft banner */}
      {isDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 bg-white/[0.06] backdrop-blur-sm border-b border-white/[0.08]">
          <span className="text-[11px] text-white/40 tracking-[0.15em] font-mono lowercase">draft</span>
        </div>
      )}

      {/* Corner home button — the keys to the door. Toggles editor chrome
          on/off without leaving the page. Visible only to authenticated
          owners. Hidden during container expansion to keep that overlay
          clean. */}
      {isOwner && !expanded && (
        <button
          type="button"
          aria-label={editorMode ? 'close editor' : 'open editor'}
          aria-pressed={editorMode}
          onClick={() => setEditorMode((v) => !v)}
          className="fixed z-30 touch-manipulation"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            right: '16px',
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 999,
            color: editorMode ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
            transition: 'color 200ms ease',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
          </svg>
        </button>
      )}

      <div
        className="relative z-10 flex-1 flex flex-col"
        style={{
          filter: claimActive ? 'saturate(0) brightness(0.2)' : 'none',
          opacity: claimActive ? 0.02 : 1,
          transition: 'filter 800ms ease-out, opacity 800ms ease-out',
          pointerEvents: claimActive ? 'none' : 'auto',
        }}
      >
        {/* Sky */}
        <div style={{ height: '100px' }} />

        {/* Masthead */}
        <RemoveBubble slug={footprint.slug}>
          <header className={`pb-4 md:pb-5 flex flex-col items-center px-4${isGrid ? ' fp-puzzle-masthead' : ''}`}>
            {isOwner && editorMode && titleEditing ? (
              <input
                ref={titleInputRef}
                value={displayTitleLocal}
                onChange={(e) => setDisplayTitleLocal(e.target.value)}
                onBlur={commitTitleEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                autoFocus
                className={`bg-transparent outline-none text-center ${
                  displayTitle.length <= 3
                    ? 'text-4xl md:text-6xl tracking-[0em] font-normal'
                    : displayTitle.length <= 6
                    ? 'text-4xl md:text-6xl tracking-[0.08em] font-normal'
                    : displayTitle.length <= 12
                    ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                    : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
                }${isGrid ? ' fp-puzzle-title' : ''}`}
                style={{
                  color: theme.colors.text,
                  opacity: 0.92,
                  textShadow: footprint.background_url ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
                  borderBottom: '1px dashed rgba(255,255,255,0.20)',
                  minWidth: '6ch',
                }}
              />
            ) : (
              <h1
                onClick={() => { if (isOwner && editorMode) setTitleEditing(true) }}
                role={isOwner && editorMode ? 'button' : undefined}
                tabIndex={isOwner && editorMode ? 0 : undefined}
                className={`${
                  displayTitle.length <= 3
                    ? 'text-4xl md:text-6xl tracking-[0em] font-normal'
                    : displayTitle.length <= 6
                    ? 'text-4xl md:text-6xl tracking-[0.08em] font-normal'
                    : displayTitle.length <= 12
                    ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                    : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
                }${isGrid ? ' fp-puzzle-title' : ''}${isOwner && editorMode ? ' cursor-text' : ''}`}
                style={{
                  color: theme.colors.text,
                  opacity: 0.92,
                  textShadow: footprint.background_url ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
                }}
              >
                {displayTitle}
              </h1>
            )}
          </header>
        </RemoveBubble>

        {/* Room nav — sticky on scroll */}
        {visibleRooms.length > 1 && (
          <div className="relative mb-4 h-12 md:mb-6">
            <div
              className={`${roomNavDocked ? 'fixed inset-x-0' : 'absolute inset-x-0'} z-30 flex items-center justify-center px-4 py-2 transition-[top] duration-300`}
              style={{ top: roomNavDocked ? 'calc(env(safe-area-inset-top, 0px) + 8px)' : 0 }}
            >
              <div className="flex max-w-full items-center gap-0 overflow-x-auto hide-scrollbar px-1 font-mono">
              {visibleRooms.map((room, i) => (
                <span key={room.id} className="flex items-center whitespace-nowrap">
                  {i > 0 && <span className="mx-2.5" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px' }}>·</span>}
                  <button
                    onClick={() => goToRoom(room.id)}
                    className="transition-all duration-300 touch-manipulation"
                    style={{
                      fontSize: '11px',
                      letterSpacing: '2.5px',
                      textTransform: 'lowercase',
                      fontWeight: activeRoomId === room.id ? 400 : 300,
                      color: activeRoomId === room.id ? 'white' : 'rgba(255,255,255,0.4)',
                      textShadow: '0 1px 8px rgba(0,0,0,0.5)',
                      background: 'none',
                      border: 'none',
                      padding: '8px 2px',
                      margin: '-8px -2px',
                      cursor: 'pointer',
                    }}
                  >
                    {room.name}
                  </button>
                </span>
              ))}
              </div>
            </div>
          </div>
        )}

        {/* Layout toggle — owner editor only, sits just above the grid.
            Live re-flow: PATCH fires async, layoutOverride updates the
            renderer immediately. */}
        {isOwner && editorMode && activeRoomId && (
          <div className="flex justify-center mb-3 md:mb-4">
            <div
              className="flex items-center gap-1 px-2 py-1.5"
              style={{
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 999,
              }}
            >
              <LayoutToggle current={roomLayout} onToggle={handleLayoutToggle} />
            </div>
          </div>
        )}

        {/* Grid */}
        <div
          className={`fp-grid-arrive ${isHorizontal ? 'w-full' : `fp-grid-container mx-auto w-full ${isGrid ? 'fp-puzzle-frame' : ''}`}`}
          style={isHorizontal ? undefined : { maxWidth: isGrid ? '900px' : '880px' }}
        >
          {activeGrid}
        </div>

        {/* Room breathing room — every room exhales 96px before any
            subsequent UI. Magazine pacing. No abrupt endings. */}
        <div style={{ height: 96 }} aria-hidden="true" />

        {/* ── Depth overlay: backdrop + close + child tiles ── */}
        {showOverlay && (
          <>
            <div
              className="fixed inset-0 z-40"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                opacity: expanded ? 1 : 0,
                transition: 'opacity 0.4s ease',
                willChange: 'opacity',
              }}
              onClick={collapse}
              onTouchStart={(e) => { depthTouchStart.current = e.touches[0].clientY }}
              onTouchEnd={(e) => { if (e.changedTouches[0].clientY - depthTouchStart.current > 60) collapse() }}
            />
            {/* Expanded container viewport: header bar + horizontal child rail */}
            {expanded && (
              <div
                className="fixed inset-0 z-[55] flex flex-col pointer-events-none"
                style={{ opacity: loadingChildren ? 0 : 1, transition: 'opacity 0.3s ease 0.3s' }}
              >
                {/* Header bar — container label left, close X right */}
                <div
                  className="pointer-events-auto flex items-center justify-between px-5 flex-shrink-0"
                  style={{
                    height: '52px',
                    ...glassStyle,
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 0,
                  }}
                >
                  <span
                    className="font-mono text-white/50 tracking-[0.15em] uppercase truncate"
                    style={{ fontSize: '11px', fontWeight: 400 }}
                  >
                    {expandedContainerLabel}
                  </span>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-all touch-manipulation flex-shrink-0 ml-3 hover:bg-white/[0.08] hover:border-white/[0.12]"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                    onClick={collapse}
                    aria-label="Close container"
                  >
                    <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Child tiles — horizontal rail fills viewport below header */}
                <div className="flex-1 flex items-center pointer-events-auto" style={{ padding: '12px 0' }}>
                  {localChildren.length > 0 ? (
                    <div
                      className="flex flex-row overflow-x-auto gap-4 hide-scrollbar w-full h-full items-center"
                      style={{
                        scrollSnapType: 'x mandatory',
                        WebkitOverflowScrolling: 'touch' as any,
                        paddingLeft: 'max(16px, calc((100vw - min(88vw, 620px)) / 2))',
                        paddingRight: 'max(16px, calc((100vw - min(88vw, 620px)) / 2))',
                        scrollPaddingLeft: 'max(16px, calc((100vw - min(88vw, 620px)) / 2))',
                      }}
                    >
                      {localChildren.map((child: any, idx: number) => (
                        <div
                          key={child.id}
                          className="flex-shrink-0 snap-center relative overflow-hidden rounded-2xl"
                          style={{
                            width: 'min(85vw, 580px)',
                            height: '75%',
                            minHeight: '300px',
                            ...glassStyle,
                            borderRadius: '16px',
                          }}
                        >
                          <UnifiedTile
                            item={{
                              id: child.id,
                              url: child.url,
                              type: child.type,
                              title: child.title || null,
                              description: child.description || null,
                              thumbnail_url: child.thumbnail_url || null,
                              embed_html: child.embed_html || null,
                              render_mode: child.render_mode,
                              artist: child.artist,
                              thumbnail_url_hq: child.thumbnail_url_hq,
                              media_id: child.media_id,
                            }}
                            index={idx}
                            size={child.size || 1}
                            aspect={child.aspect || 'square'}
                            mode="public"
                            layout="rail"
                            isMobile={isMobile}
                          />
                          {/* Owner-only controls — delete + reorder */}
                          {isOwner && (
                            <div className="absolute inset-0 z-10 pointer-events-none">
                              <button
                                className="absolute top-2 right-2 pointer-events-auto w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-colors hover:bg-red-500/30"
                                style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}
                                onClick={() => handleChildDelete(child)}
                                aria-label="Remove item"
                              >
                                <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
                                <button
                                  className="w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-opacity"
                                  style={{
                                    background: 'rgba(0,0,0,0.55)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    opacity: idx === 0 ? 0.3 : 1,
                                    cursor: idx === 0 ? 'default' : 'pointer',
                                  }}
                                  onClick={() => handleChildMove(idx, -1)}
                                  disabled={idx === 0}
                                  aria-label="Move left"
                                >
                                  <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                  </svg>
                                </button>
                                <button
                                  className="w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-opacity"
                                  style={{
                                    background: 'rgba(0,0,0,0.55)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    opacity: idx === localChildren.length - 1 ? 0.3 : 1,
                                    cursor: idx === localChildren.length - 1 ? 'default' : 'pointer',
                                  }}
                                  onClick={() => handleChildMove(idx, 1)}
                                  disabled={idx === localChildren.length - 1}
                                  aria-label="Move right"
                                >
                                  <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !loadingChildren ? (
                    <div className="flex items-center justify-center w-full py-12">
                      <span className="text-white/20 font-mono text-xs tracking-widest uppercase">empty</span>
                    </div>
                  ) : null}
                </div>

                {/* Owner-only add URL footer */}
                {isOwner && (
                  <div
                    className="pointer-events-auto flex-shrink-0 flex items-center gap-2 px-4 py-3"
                    style={{
                      ...glassStyle,
                      border: 'none',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 0,
                    }}
                  >
                    <input
                      type="url"
                      placeholder="add url…"
                      value={addUrl}
                      onChange={e => setAddUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleChildAdd() }}
                      className="flex-1 bg-transparent text-white/70 placeholder-white/20 outline-none font-mono text-xs"
                      style={{ minWidth: 0 }}
                    />
                    <button
                      onClick={handleChildAdd}
                      disabled={!addUrl.trim() || addPending}
                      className="px-3 py-1 rounded-md font-mono text-xs touch-manipulation"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: 'rgba(255,255,255,0.45)',
                        opacity: !addUrl.trim() || addPending ? 0.4 : 1,
                        cursor: !addUrl.trim() || addPending ? 'default' : 'pointer',
                      }}
                    >
                      {addPending ? '…' : 'add'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {content.length === 0 && (
          <div className="py-16" />
        )}

        {/* Floor */}
        <div style={{ height: '40px' }} />

      </div>

      {/* Serial number — fixed bottom-left, tappable for visitors */}
      {!isDraft && serial && !claimActive && (
        <div
          className="fixed bottom-4 left-4 font-mono"
          style={{
            zIndex: expanded ? 60 : 20,
            transition: 'opacity 0.3s ease',
          }}
        >
          <button
            onClick={() => { if (!isOwner) setSerialFlyout(v => !v) }}
            className="select-none touch-manipulation"
            style={{
              color: 'rgba(255,255,255,0.15)',
              fontSize: '11px',
              fontWeight: 300,
              opacity: expanded ? 0.2 : 0.4,
              background: 'none',
              border: 'none',
              padding: '4px 0',
              cursor: isOwner ? 'default' : 'pointer',
              transition: 'opacity 0.3s ease',
            }}
          >
            #{String(serial).padStart(4, '0')}
          </button>

          {/* Claim flyout */}
          {serialFlyout && !isOwner && (
            <>
            <div className="fixed inset-0" onClick={() => setSerialFlyout(false)} />
            <div
              className="absolute bottom-full left-0 mb-2"
              style={{ animation: 'fadeInUp 0.25s ease' }}
            >
              <button
                onClick={activateClaim}
                className="flex items-center touch-manipulation font-mono"
                style={{
                  ...glassStyle,
                  borderRadius: '12px',
                  padding: '12px 16px',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '12px',
                  fontWeight: 400,
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                footprint.onl {'\u2192'}
              </button>
            </div>
            </>
          )}
        </div>
      )}

      {/* Return affordance — quiet doorway on every public room. Routes to
          /{slug}/home where EditAccessScreen handles email + 6-digit code if
          no fp_edit_{slug} cookie is present. Server-side hint suppresses
          this for owners on first paint (no flash). */}
      {!isOwnerHinted && !isDraft && (
        <a
          href={`/${footprint.username}/home`}
          className="fixed bottom-4 right-4 z-20 font-mono text-[11px] text-white/[0.15] hover:text-white/40 transition-colors duration-300 px-2 py-1 select-none touch-manipulation"
        >
          return
        </a>
      )}

      {/* Floating CTA bar — viewers only, hidden for owner and during claim */}
      {!isDraft && !claimActive && authChecked && !isOwner && (
        <FloatingCtaBar isOwner={isOwner} />
      )}

      {/* Owner verbs — visible only when the corner home button is toggled
          on AND no tile is selected. Selecting a tile swaps the bar out
          for the tile sheet at the same vertical position. */}
      {isOwner && editorMode && !selectedTileId && !expanded && !claimActive && (
        <OwnerActionBar
          open={editorMode}
          slug={footprint.username}
          activeRoomId={activeRoomId}
          serialNumber={typeof footprint.serial_number === 'number' ? footprint.serial_number : null}
          published={publishedLocal}
          onPublishedChange={handlePublishedChange}
          onTileAdded={handleTileAdded}
          onTileReplaced={handleTileReplaced}
          onTileProgress={handleTileProgress}
        />
      )}

      {/* Tile editor sheet — shape, size, collection. Surfaces when an
          owner taps a tile in editor mode. */}
      {isOwner && editorMode && selectedTileId && !expanded && !claimActive && (() => {
        const tile = localContent.find((t) => t.id === selectedTileId)
          || allContent.find((t) => t.id === selectedTileId)
        if (!tile) return null
        const source = tileSources[tile.id] || (tile.type === 'image' || tile.type === 'video' ? 'library' : 'links')
        const containers = (allContent || []).filter((t: any) => t.type === 'container')
        return (
          <OwnerTileSheet
            tile={tile as any}
            source={source as 'library' | 'links'}
            containers={containers as any}
            slug={footprint.username}
            onClose={() => setSelectedTileId(null)}
            onTileChange={handleTileChange}
            onTileDelete={handleTileDelete}
          />
        )
      })()}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}

      {/* The Sovereign Tile — self-contained claim flow */}
      {claimActive && !isOwner && (
        <SovereignTile
          slug={footprint.username}
          onDismiss={() => setClaimActive(false)}
          onComplete={(s) => { window.location.href = `/${s}/home` }}
          sessionId={initialParams.current.sessionId}
          returnUsername={initialParams.current.returnUsername}
        />
      )}
    </div>
  )
}
