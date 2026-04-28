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
import { getGridLayout } from '@/lib/grid-layouts'
import { glassStyle } from '@/lib/glass'
import { useDepthExpansion } from '@/hooks/useDepthExpansion'
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
  containerMeta?: Record<string, { childCount: number; firstThumb: string | null }>
  ownerEmail?: string | null
}

// Room subtitles removed — the rooms speak for themselves
// Wallpaper filter + overlay per room live in lib/roomAtmosphere.ts so
// the editor and public render the same room with the same atmosphere.

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft, containerMeta = {}, ownerEmail = null }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Default to first room
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])

  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [serialFlyout, setSerialFlyout] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')
  const [roomNavDocked, setRoomNavDocked] = useState(false)

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

  // Show tiles in user's arranged order — no shuffle
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

  const displayTitle = useMemo(
    () => getFootprintDisplayTitle(footprint) || '\u00e6',
    [footprint]
  )

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
  // LAYOUT-AWARE GRID — uses UnifiedTile + per-tile aspect from lib/media/aspect
  // OUTER div: grid classes only (NO overflow-hidden)
  // INNER div: relative w-full h-full overflow-hidden rounded-xl + background
  // ═══════════════════════════════════════════
  const roomLayout = activeRoom?.layout || 'grid'
  const layoutConfig = getGridLayout(roomLayout)
  const isMix = roomLayout === 'mix' || roomLayout === 'editorial'
  const isRail = layoutConfig.isRail === true
  const isPuzzleGrid = roomLayout === 'grid'
  const displayContent = isOwner ? localContent : content

  const getPuzzleGridClass = (tileSize: number) => {
    if (tileSize >= 3) return 'col-span-2 row-span-2 aspect-square'
    if (tileSize >= 2) return 'col-span-2 row-span-1 aspect-[2/1]'
    return 'col-span-1 row-span-1 aspect-square'
  }

  const getPuzzleTileClass = (tileSize: number) => {
    if (tileSize >= 3) return 'fp-puzzle-tile-l'
    if (tileSize >= 2) return 'fp-puzzle-tile-m'
    return 'fp-puzzle-tile-s'
  }

  const fadeStyle = {
    opacity: roomFade === 'out' ? 0 : 1,
    transform: roomFade === 'out' ? 'translateY(6px)' : roomFade === 'in' ? 'translateY(-6px)' : 'translateY(0)',
    transition: 'opacity 250ms ease-out, transform 350ms ease-out',
  }

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

  const gridInner = isRail ? (
    // ── RAIL MODE: cinematic horizontal snap scroll ──
    <div
      className={`${layoutConfig.containerClass} hide-scrollbar`}
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
        const isContainer = item.type === 'container'
        const isThisExpanded = expanded?.id === item.id
        const tileInner = (
          <div
            ref={(el: HTMLDivElement | null) => registerRef(item.id, el)}
            className="w-full h-full relative"
            style={getDepthStyle(item.id)}
          >
            <div
              className="relative w-full h-full overflow-hidden fp-tile-hover rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <UnifiedTile
                item={item}
                index={idx}
                size={1}
                aspect="wide"
                mode="public"
                layout={roomLayout}
                isMobile={isMobile}
                isSoundRoom={isSoundRoom}
                isExpanded={isThisExpanded}
                childCount={containerMeta[item.id]?.childCount}
                firstChildThumb={containerMeta[item.id]?.firstThumb}
              />
            </div>
            {/* Container click interceptor — only containers are doors */}
            {isContainer && !expanded && (
              <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => expand(item.id)} />
            )}
          </div>
        )

        const railTileClass = `${layoutConfig.tileClass} aspect-[3/4]`
        const railStyle: React.CSSProperties = {
          width: 'min(88vw, 620px)',
        }

        if (isOwner) {
          return (
            <SortableTileWrapper key={item.id} item={item} idx={idx} className={railTileClass} style={railStyle} disabled={!!expanded}>
              {tileInner}
            </SortableTileWrapper>
          )
        }

        return (
          <div key={item.id} className={railTileClass} style={railStyle}>
            {tileInner}
          </div>
        )
      })}
    </div>
  ) : (
    // ── GRID / MIX MODE: vertical CSS grid ──
    <div
      className={layoutConfig.containerClass}
      style={{
        gridAutoRows: 'auto',
        gridAutoFlow: isMix ? 'dense' : undefined,
        ...fadeStyle,
      }}
    >
      {displayContent.map((item: any, idx: number) => {
        const tileSize = item.size || 1
        const tileAspect = isMix
          ? resolveAspect(item.aspect, item.type, item.url)
          : 'square'

        // Only YouTube/Vimeo embeds need forced wide — they're iframe players.
        // Uploaded videos + Instagram respect their stored aspect (portrait/square/wide).
        const isEmbedVid = item.type === 'youtube' || item.type === 'vimeo' ||
              item.url?.includes('youtube') || item.url?.includes('youtu.be')

        const isSpotify = item.type === 'spotify'
        const isAudioEmbed = item.type === 'soundcloud'

        // Sound room: hero first tile + square others
        // Spotify = portrait. SoundCloud = wide. Embed videos = wide.
        // Uploaded videos / Instagram / images = use their actual aspect.
        //
        // S image tiles outside puzzle grid: SAspectShell detects natural dimensions
        // on load and reshapes the cell to portrait/landscape/square accordingly.
        // Puzzle grid keeps S tiles locked to square cells.
        const resolvedSAspect = (tileSize === 1 && !isMix)
          ? resolveAspect(item.aspect, item.type, item.url)
          : null

        const sAspectClass = resolvedSAspect != null
          ? `col-span-2 ${resolvedSAspect === 'wide' || resolvedSAspect === 'landscape' ? 'aspect-[4/3]'
            : resolvedSAspect === 'tall' || resolvedSAspect === 'portrait' ? 'aspect-[3/4]'
            : 'aspect-square'}`
          : null

        const gridClass = isPuzzleGrid
          ? getPuzzleGridClass(tileSize)
          : isSoundRoom && idx === 0 ? 'col-span-2 row-span-2 aspect-square'
          : isSpotify ? 'col-span-1 aspect-[3/4]'
          : isAudioEmbed ? 'col-span-2 aspect-video'
          : isEmbedVid ? 'col-span-2 aspect-[4/3]'
          : sAspectClass ?? getGridClass(tileSize, tileAspect, false)

        const isContainer = item.type === 'container'
        const isThisExpanded = expanded?.id === item.id
        const tileInner = (
          <div
            ref={(el: HTMLDivElement | null) => registerRef(item.id, el)}
            className="w-full h-full relative"
            style={getDepthStyle(item.id)}
          >
            <div
              className={`relative w-full overflow-hidden fp-tile-hover h-full ${isPuzzleGrid ? `fp-puzzle-tile ${getPuzzleTileClass(tileSize)} rounded-2xl` : tileSize === 1 ? 'rounded-xl' : 'rounded-2xl'}${isSoundRoom ? ' fp-sound-tile' : ''}`}
              style={isPuzzleGrid
                ? undefined
                : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <UnifiedTile
                item={item}
                index={idx}
                size={tileSize}
                aspect={tileAspect}
                mode="public"
                layout={roomLayout}
                isMobile={isMobile}
                isSoundRoom={isSoundRoom}
                isExpanded={isThisExpanded}
                childCount={containerMeta[item.id]?.childCount}
                firstChildThumb={containerMeta[item.id]?.firstThumb}
              />
            </div>
            {/* Container click interceptor — only containers are doors */}
            {isContainer && !expanded && (
              <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => expand(item.id)} />
            )}
          </div>
        )

        if (isOwner) {
          return (
            <SortableTileWrapper key={item.id} item={item} idx={idx} className={gridClass} disabled={!!expanded}>
              {tileInner}
            </SortableTileWrapper>
          )
        }

        // S image tiles outside puzzle grid: SAspectShell manages the outer cell class.
        // Starts from stored/resolved aspect, updates on image load via context.
        // resolvedSAspect covers grid mode; tileAspect covers mix mode (already resolved).
        if (tileSize === 1 && !isPuzzleGrid && !isSoundRoom && item.type === 'image') {
          return (
            <SAspectShell key={item.id} initialAspect={resolvedSAspect ?? tileAspect}>
              {tileInner}
            </SAspectShell>
          )
        }

        return <div key={item.id} className={gridClass}>{tileInner}</div>
      })}
    </div>
  )

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
    <div className={`relative flex min-h-[100dvh] w-full flex-col overflow-x-clip${isPuzzleGrid ? ' fp-puzzle-page' : ''}`} style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
      {/* Wallpaper layer — GPU composited for 60fps scroll */}
      {footprint.background_url && (
        <div className="fixed inset-0 z-0 fp-wallpaper-gpu">
          <Image
            src={footprint.background_url}
            alt=""
            fill
            priority
            quality={60}
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

      {/* Top-right — owner home button. Not in DOM for visitors. Hidden during expansion. */}
      {isOwner && !expanded && (
        <div className="fixed top-5 right-4 md:right-6 z-30">
          <a
            href={`/${footprint.username}/home`}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition touch-manipulation"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </a>
        </div>
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
          <header className={`pb-4 md:pb-5 flex flex-col items-center px-4${isPuzzleGrid ? ' fp-puzzle-masthead' : ''}`}>
            <h1
              className={`${
                displayTitle.length <= 3
                  ? 'text-4xl md:text-6xl tracking-[0em] font-normal'
                  : displayTitle.length <= 6
                  ? 'text-4xl md:text-6xl tracking-[0.08em] font-normal'
                  : displayTitle.length <= 12
                  ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                  : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
              }${isPuzzleGrid ? ' fp-puzzle-title' : ''}`}
              style={{
                color: theme.colors.text,
                opacity: 0.92,
                textShadow: footprint.background_url ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
              }}
            >
              {displayTitle}
            </h1>
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

        {/* Grid */}
        <div
          className={`fp-grid-arrive ${isRail ? 'w-full' : `fp-grid-container mx-auto w-full ${isPuzzleGrid ? 'fp-puzzle-frame px-5 md:px-8' : 'px-3 md:px-4'}`}`}
          style={isRail ? undefined : { maxWidth: isPuzzleGrid ? '900px' : '880px' }}
        >
          {activeGrid}
        </div>

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
                  {containerChildren.length > 0 ? (
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
                      {containerChildren.map((child: any, idx: number) => (
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
                        </div>
                      ))}
                    </div>
                  ) : !loadingChildren ? (
                    <div className="flex items-center justify-center w-full py-12">
                      <span className="text-white/20 font-mono text-xs tracking-widest uppercase">empty</span>
                    </div>
                  ) : null}
                </div>
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

      {/* Floating CTA bar — viewers only, hidden for owner and during claim */}
      {!isDraft && !claimActive && authChecked && !isOwner && (
        <FloatingCtaBar isOwner={isOwner} />
      )}

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
