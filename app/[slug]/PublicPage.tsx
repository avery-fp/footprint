'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import UnifiedTile from '@/components/UnifiedTile'

import WeatherEffect from '@/components/WeatherEffect'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'
import FloatingCtaBar from '@/components/FloatingCtaBar'
import { getGridLayout } from '@/lib/grid-layouts'
import { getGridClass, resolveAspect } from '@/lib/media/aspect'
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

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft }: PublicPageProps) {
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
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(async r => {
        if (r.ok) {
          try {
            const data = await r.json()
            setIsLoggedIn(true)
            if (data.user?.id === footprint.user_id) {
              setIsOwner(true)
            }
          } catch {
            // JSON parse failed — treat as not logged in
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
  function SortableTileWrapper({ item, idx, children, className, style: extraStyle }: { item: any; idx: number; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
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
  const activeRoom = activeRoomId ? visibleRooms.find(r => r.id === activeRoomId) : null
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

  const gridInner = isRail ? (
    // ── RAIL MODE: horizontal snap scroll ──
    <div
      className={layoutConfig.containerClass}
      style={{
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch' as any,
        paddingLeft: '12px',
        paddingRight: '12px',
        ...fadeStyle,
      }}
    >
      {displayContent.map((item: any, idx: number) => {
        const tileInner = (
          <div
            className="relative w-full h-full overflow-hidden fp-tile-hover fp-tile-shimmer rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <UnifiedTile
              item={item}
              index={idx}
              size={1}
              aspect="wide"
              mode="public"
              layout={roomLayout}
              isMobile={isMobile}
            />
          </div>
        )

        const railTileClass = `${layoutConfig.tileClass} aspect-[4/3]`
        const railStyle = { width: 'min(80vw, 340px)' }

        if (isOwner) {
          return (
            <SortableTileWrapper key={item.id} item={item} idx={idx} className={railTileClass} style={railStyle}>
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

        const isVid = item.type === 'youtube' ||
              item.type === 'video' ||
              item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ||
              item.url?.includes('youtube') ||
              item.url?.includes('youtu.be')

        const isMusicEmbed = item.type === 'spotify' && item.render_mode === 'ghost'

        const gridClass = isVid ? 'col-span-2 aspect-video'
          : isMusicEmbed ? 'col-span-2'
          : getGridClass(tileSize, tileAspect, false)

        const tileInner = (
            <div
              className={`relative w-full overflow-hidden fp-tile-hover fp-tile-shimmer ${isMusicEmbed ? '' : 'h-full rounded-2xl'}`}
              style={isMusicEmbed ? {} : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <UnifiedTile
                item={item}
                index={idx}
                size={tileSize}
                aspect={tileAspect}
                mode="public"
                layout={roomLayout}
                isMobile={isMobile}
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
    <div className="min-h-[100dvh] relative flex flex-col" style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
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

      {/* Top-right — owner home button */}
      {isOwner && (
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

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Sky */}
        <div style={{ height: '100px' }} />

        {/* Masthead */}
        <RemoveBubble slug={footprint.slug}>
          <header className="pb-4 md:pb-5 flex flex-col items-center px-4">
            <h1
              className={`${
                (footprint.display_name || '\u00e6').length <= 6
                  ? 'text-4xl md:text-6xl tracking-[0.22em] font-normal'
                  : (footprint.display_name || '\u00e6').length <= 12
                  ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                  : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
              }`}
              style={{
                color: theme.colors.text,
                opacity: 0.92,
                textShadow: footprint.background_url ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
              }}
            >
              {footprint.display_name || '\u00e6'}
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
          className="fp-grid-container mx-auto w-full px-3 md:px-4"
          style={{ maxWidth: '880px' }}
        >
          <div className="fp-grid-arrive">
            {activeGrid}
          </div>
        </div>

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
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open saved footprints"
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-14 h-8 touch-manipulation"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <span className="block w-10 h-[3px] rounded-full bg-white/[0.10] hover:bg-white/[0.20] transition-all duration-300 hover:w-12" />
          </button>
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
        <FloatingCtaBar isOwner={isOwner} />
      )}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}
    </div>
  )
}
