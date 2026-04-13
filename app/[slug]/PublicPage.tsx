'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import UnifiedTile from '@/components/UnifiedTile'

import WeatherEffect from '@/components/WeatherEffect'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'
import FloatingCtaBar from '@/components/FloatingCtaBar'
import SovereignTile from '@/components/SovereignTile'
import CommandLayer from '@/components/CommandLayer'
import { getGridLayout } from '@/lib/grid-layouts'
import { glassStyle } from '@/lib/glass'
import { useDepthExpansion } from '@/hooks/useDepthExpansion'
import { getGridClass, resolveAspect, isVideoTile } from '@/lib/media/aspect'
import { getFootprintDisplayTitle } from '@/lib/footprint'
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

// Wallpaper filter per room
const ROOM_FILTERS = [
  'blur(8px) brightness(0.45) saturate(0.85) hue-rotate(-8deg)',
  'blur(4px) brightness(0.65) saturate(1.4) hue-rotate(25deg)',
  'blur(16px) brightness(0.3) saturate(1.6) hue-rotate(-35deg)',
  'blur(0px) brightness(0.55) saturate(0.2) hue-rotate(0deg)',
  'blur(10px) brightness(0.7) saturate(1.2) hue-rotate(35deg)',
  'blur(14px) brightness(0.35) saturate(0.4) hue-rotate(-20deg)',
]
const DEFAULT_FILTER = 'blur(12px)'

const ROOM_OVERLAYS = [
  'rgba(0,0,0,0.35)',
  'rgba(0,0,0,0.30)',
  'rgba(0,0,0,0.42)',
  'rgba(0,0,0,0.38)',
  'rgba(0,0,0,0.28)',
  'rgba(0,0,0,0.45)',
]
const DEFAULT_OVERLAY = 'rgba(0,0,0,0.35)'

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
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [serialFlyout, setSerialFlyout] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')

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

  // Wallpaper filter
  const activeRoomIndex = activeRoomId ? visibleRooms.findIndex(r => r.id === activeRoomId) : -1
  const activeRoom = activeRoomId ? visibleRooms.find(r => r.id === activeRoomId) : null
  const isSoundRoom = activeRoom?.name?.toLowerCase() === 'sound'
  const wallpaperFilter = isSoundRoom
    ? 'blur(20px) brightness(0.25) saturate(1.8) hue-rotate(-15deg)'
    : activeRoomIndex >= 0
    ? ROOM_FILTERS[activeRoomIndex % ROOM_FILTERS.length]
    : DEFAULT_FILTER
  const overlayColor = isSoundRoom
    ? 'rgba(0,0,0,0.50)'
    : activeRoomIndex >= 0
    ? ROOM_OVERLAYS[activeRoomIndex % ROOM_OVERLAYS.length]
    : DEFAULT_OVERLAY

  const handleShare = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://footprint.onl'
    const fpUrl = `${baseUrl}/${footprint.username}`
    navigator.clipboard.writeText(fpUrl)
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

  // Check if user is logged in + owner
  // Any failure (network, 401, malformed JSON) falls through to isOwner=false, isLoggedIn=false
  // so FloatingCtaBar always renders for visitors
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/user', { credentials: 'include' })
        if (!r.ok) { setAuthChecked(true); return }
        const data = await r.json()
        setIsLoggedIn(true)
        const viewerEmail = data.user?.email?.toLowerCase?.().trim?.() || null
        const ownerEmailNormalized = ownerEmail?.toLowerCase?.().trim?.() || null
        if (data.user?.id === footprint.user_id || (viewerEmail && ownerEmailNormalized && viewerEmail === ownerEmailNormalized)) {
          setIsOwner(true)
        }
      } catch {
        // Silent — visitor path: CTA stays visible
      } finally {
        setAuthChecked(true)
      }
    })()
  }, [footprint.user_id, ownerEmail])

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
  const displayContent = isOwner ? localContent : content

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
        const gridClass = isSoundRoom && idx === 0
          ? 'col-span-2 row-span-2 aspect-square'
          : isSpotify ? 'col-span-1 aspect-[3/4]'
          : isAudioEmbed ? 'col-span-2 aspect-video'
          : isEmbedVid ? 'col-span-2 aspect-video'
          : getGridClass(tileSize, tileAspect, false)

        const isContainer = item.type === 'container'
        const isThisExpanded = expanded?.id === item.id
        const tileInner = (
          <div
            ref={(el: HTMLDivElement | null) => registerRef(item.id, el)}
            className="w-full h-full relative"
            style={getDepthStyle(item.id)}
          >
            <div
              className={`relative w-full overflow-hidden fp-tile-hover h-full rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
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
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden" style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
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
          <header className="pb-4 md:pb-5 flex flex-col items-center px-4">
            <h1
              className={`${
                displayTitle.length <= 3
                  ? 'text-4xl md:text-6xl tracking-[0em] font-normal'
                  : displayTitle.length <= 6
                  ? 'text-4xl md:text-6xl tracking-[0.08em] font-normal'
                  : displayTitle.length <= 12
                  ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                  : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
              }`}
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
          <div className="sticky top-0 z-20 flex items-center justify-center mb-4 md:mb-6 px-4 py-2">
            <div className="flex items-center gap-0 font-mono overflow-x-auto hide-scrollbar">
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
        )}

        {/* Grid */}
        <div
          className={`fp-grid-arrive ${isRail ? 'w-full' : 'fp-grid-container mx-auto w-full px-3 md:px-4'}`}
          style={isRail ? undefined : { maxWidth: '880px' }}
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

        {/* Footer — copy link with footprint icon */}
        <div className="py-10 flex items-center justify-center">
          <button
            onClick={handleShare}
            className="group p-3 text-white/[0.12] hover:text-white/40 transition-colors duration-500 touch-manipulation"
            aria-label="Copy link"
          >
            <span className="relative inline-flex items-end gap-0.5">
              <svg className="w-3.5 h-3.5 -rotate-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C10.5 2 9.5 3.5 9.5 5c0 1 .3 2 .8 2.8L9 9.5C8 10 7.2 11 7 12.2c-.3 1.5.2 3 1.2 4l.5.5c-.3.8-.5 1.8-.5 2.8 0 1.5.5 3 1.5 3.5.5.3 1 .3 1.5 0 1-.5 1.5-2 1.5-3.5 0-1-.2-2-.5-2.8l.5-.5c1-1 1.5-2.5 1.2-4C13.8 11 13 10 12 9.5l-1.3-1.7c.5-.8.8-1.8.8-2.8 0-1.5-1-3-2.5-3h3z"/>
              </svg>
              <svg className="w-3.5 h-3.5 rotate-6 -translate-y-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C10.5 2 9.5 3.5 9.5 5c0 1 .3 2 .8 2.8L9 9.5C8 10 7.2 11 7 12.2c-.3 1.5.2 3 1.2 4l.5.5c-.3.8-.5 1.8-.5 2.8 0 1.5.5 3 1.5 3.5.5.3 1 .3 1.5 0 1-.5 1.5-2 1.5-3.5 0-1-.2-2-.5-2.8l.5-.5c1-1 1.5-2.5 1.2-4C13.8 11 13 10 12 9.5l-1.3-1.7c.5-.8.8-1.8.8-2.8 0-1.5-1-3-2.5-3h3z"/>
              </svg>
            </span>
          </button>
        </div>
      </div>

      {/* Rolodex drawer */}
      {isLoggedIn && (
        <>
          <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-4 pointer-events-none">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open saved footprints"
              className="pointer-events-auto flex items-center justify-center w-14 h-8 touch-manipulation"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <span className="block w-10 h-[3px] rounded-full bg-white/[0.10] hover:bg-white/[0.20] transition-all duration-300 hover:w-12" />
            </button>
          </div>
          <RolodexDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

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
