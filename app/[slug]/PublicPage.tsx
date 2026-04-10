'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import UnifiedTile from '@/components/UnifiedTile'
import ArtifactImageViewer from '@/components/ArtifactImageViewer'

import WeatherEffect from '@/components/WeatherEffect'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'
import FloatingCtaBar from '@/components/FloatingCtaBar'
import { getGridLayout } from '@/lib/grid-layouts'
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
}

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

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [activeArtifact, setActiveArtifact] = useState<any | null>(null)

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')

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

  const artifactLine = useMemo(() => {
    const bio = typeof footprint.bio === 'string' ? footprint.bio.trim() : ''
    return bio || 'a permanent room made of tiles.'
  }, [footprint.bio])

  const baseContent = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

  // Show tiles in user's arranged order — no shuffle
  const content = baseContent

  // Wallpaper filter
  const activeRoomIndex = activeRoomId ? visibleRooms.findIndex(r => r.id === activeRoomId) : -1
  const wallpaperFilter = activeRoomIndex >= 0
    ? ROOM_FILTERS[activeRoomIndex % ROOM_FILTERS.length]
    : DEFAULT_FILTER
  const overlayColor = activeRoomIndex >= 0
    ? ROOM_OVERLAYS[activeRoomIndex % ROOM_OVERLAYS.length]
    : DEFAULT_OVERLAY

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

  // Check if user is logged in + owner
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(async r => {
        if (r.ok) {
          const data = await r.json()
          setIsLoggedIn(true)
          if (data.user?.id === footprint.user_id) {
            setIsOwner(true)
          }
        }
      })
      .catch(() => {})
  }, [footprint.user_id])

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
  function SortableTileWrapper({ item, idx, children, className }: { item: any; idx: number; children: React.ReactNode; className?: string }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
      opacity: isDragging ? 0.4 : 1,
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
  const activeRoom = activeRoomId ? visibleRooms.find(r => r.id === activeRoomId) : null
  const roomLayout = activeRoom?.layout || 'grid'
  const layoutConfig = getGridLayout(roomLayout)
  const isEditorial = roomLayout === 'editorial'
  const displayContent = isOwner ? localContent : content
  const gridMaxWidth = displayContent.length <= 1 ? 440 : displayContent.length <= 4 ? 720 : 920

  const gridInner = (
    <div
      className={layoutConfig.containerClass}
      style={{
        gridAutoRows: 'auto',
        gridAutoFlow: isEditorial ? 'dense' : undefined,
        opacity: roomFade === 'out' ? 0 : 1,
        transform: roomFade === 'out' ? 'translateY(6px)' : roomFade === 'in' ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'opacity 250ms ease-out, transform 350ms ease-out',
      }}
    >
      {displayContent.map((item: any, idx: number) => {
        const tileSize = item.size || 1
        const isVideo = isVideoTile(item.type, item.url)
        const tileAspect = isEditorial
          ? resolveAspect(item.aspect, item.type, item.url)
          : 'square'

        const isVid = item.type === 'youtube' ||
              item.type === 'video' ||
              item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ||
              item.url?.includes('youtube') ||
              item.url?.includes('youtu.be')

        const gridClass = isVid ? 'col-span-2' : getGridClass(tileSize, tileAspect, false)

        const tileInner = (
            <div
              className={`group relative w-full h-full overflow-hidden rounded-[22px] border border-white/[0.10] ${
                isOwner ? '' : 'transition-transform duration-300 md:hover:-translate-y-0.5'
              }`}
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
                boxShadow: footprint.background_url
                  ? '0 18px 50px rgba(0,0,0,0.22)'
                  : '0 10px 32px rgba(0,0,0,0.12)',
              }}
            >
              <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/[0.03] via-transparent to-black/[0.08]" />
              <UnifiedTile
                item={item}
                index={idx}
                size={tileSize}
                aspect={tileAspect}
                mode="public"
                layout={roomLayout}
                isMobile={isMobile}
                onOpenArtifact={isOwner ? undefined : (artifactItem) => setActiveArtifact(artifactItem)}
              />
            </div>
        )

        if (isOwner) {
          return (
            <SortableTileWrapper key={item.id} item={item} idx={idx} className={gridClass}>
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
              filter: footprint.background_blur !== false ? wallpaperFilter : 'none',
              transition: 'filter 0.8s ease',
            }}
            onLoad={() => setWallpaperLoaded(true)}
          />
          <div
            className="absolute inset-0 transition-colors duration-800"
            style={{ backgroundColor: overlayColor }}
          />
        </div>
      )}
      <WeatherEffect type={footprint.weather_effect || null} />

      {/* Draft banner */}
      {isDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 bg-white/[0.06] backdrop-blur-sm border-b border-white/[0.08]">
          <span className="text-[11px] text-white/40 tracking-[0.15em] font-mono lowercase">draft</span>
        </div>
      )}

      {/* Top-right — same footprint, different permission states */}
      {(isOwner || isLoggedIn || !isDraft) && (
        <div className="fixed top-5 right-4 md:right-6 z-30">
          <a
            href={isOwner ? `/${footprint.username}/home` : isLoggedIn ? '/home' : '/login?redirect=%2Fhome'}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-white/[0.06] px-4 text-[11px] uppercase tracking-[0.18em] text-white/55 hover:bg-white/[0.12] hover:text-white/85 transition touch-manipulation"
          >
            {isOwner ? 'Edit' : isLoggedIn ? 'Home' : 'Connect'}
          </a>
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Sky */}
        <div style={{ height: '100px' }} />

        {/* Masthead */}
        <RemoveBubble slug={footprint.slug}>
          <header className="pb-4 md:pb-5 flex flex-col items-center px-4">
            {!isDraft && serial && (
              <p
                className="mb-4 font-mono text-[10px] uppercase tracking-[0.32em]"
                style={{
                  color: 'rgba(255,255,255,0.42)',
                  textShadow: footprint.background_url ? '0 2px 18px rgba(0,0,0,0.75)' : 'none',
                }}
              >
                Footprint #{serial}
              </p>
            )}
            <h1
              className={`${
                displayTitle.length <= 6
                  ? 'text-4xl md:text-6xl tracking-[0.22em] font-normal'
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
            <p
              className="mt-4 max-w-[32rem] px-4 text-center text-[12px] md:text-[13px] leading-relaxed"
              style={{
                color: 'rgba(255,255,255,0.56)',
                textShadow: footprint.background_url ? '0 2px 12px rgba(0,0,0,0.65)' : 'none',
              }}
            >
              {artifactLine}
            </p>
          </header>
        </RemoveBubble>

        {/* Room nav — sticky on scroll */}
        {visibleRooms.length > 1 && (
          <div className="sticky top-0 z-20 flex items-center justify-center mb-4 md:mb-6 px-4 py-2">
            <div className="flex items-center gap-0 font-mono overflow-x-auto hide-scrollbar rounded-full border border-white/[0.08] bg-black/20 px-4 backdrop-blur-md">
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
          className="fp-grid-container mx-auto w-full px-3 md:px-4"
          style={{ maxWidth: `${gridMaxWidth}px` }}
        >
          <div className="fp-grid-arrive">
            {activeGrid}
          </div>
        </div>

        {content.length === 0 && (
          <div className="mx-auto mt-8 w-full max-w-md px-4">
            <div className="rounded-[28px] border border-white/[0.08] bg-black/20 px-6 py-7 text-center backdrop-blur-md">
              <p className="text-sm font-mono uppercase tracking-[0.26em] text-white/30">
                Room Empty
              </p>
              <p className="mt-3 text-[15px] text-white/68">
                this room is still taking shape.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/36">
                Footprint turns media, memory, and taste into a single visual artifact.
              </p>
            </div>
          </div>
        )}

        {/* Floor */}
        <div style={{ height: '160px' }} />

        {/* Footer — copy link with footprint icon */}
        <div className="py-12 flex flex-col items-center justify-center gap-3 px-4">
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.28em] text-white/22">
            one room. yours forever.
          </p>
          <button
            onClick={handleShare}
            className="rounded-full border border-white/[0.1] bg-white/[0.05] px-5 py-2 text-[11px] font-mono uppercase tracking-[0.24em] text-white/46 transition-all duration-300 hover:bg-white/[0.1] hover:text-white/72 touch-manipulation"
            aria-label="Copy link"
          >
            copy address
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

      {/* Serial number — fixed bottom-left */}
      {!isDraft && serial && (
        <div
          className="fixed bottom-4 left-4 z-20 select-none pointer-events-none font-mono"
          style={{
            color: 'rgba(255,255,255,0.15)',
            fontSize: '11px',
            fontWeight: 300,
            opacity: 0.4,
          }}
        >
          #{String(serial).padStart(4, '0')}
        </div>
      )}

      {/* Floating CTA bar — viewers only, hidden for owner */}
      {!isDraft && (
        <FloatingCtaBar isLoggedIn={isLoggedIn} isOwner={isOwner} />
      )}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-full bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
            copied.
          </div>
        </div>
      )}

      <ArtifactImageViewer
        item={activeArtifact}
        open={!!activeArtifact}
        onClose={() => setActiveArtifact(null)}
      />
    </div>
  )
}
