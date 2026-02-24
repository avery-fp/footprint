'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, DragOverlay, DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ContentCard from '@/components/ContentCard'
import VideoTile from '@/components/VideoTile'
import WeatherEffect from '@/components/WeatherEffect'
import { PlusButton } from '@/components/PlusButton'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'
import FloatingCtaBar from '@/components/FloatingCtaBar'

interface Room {
  id: string
  name: string
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

// Sortable wrapper for public page tiles
function SortableTile({ id, children, className, style }: { id: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const mergedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: 'grab',
  }
  return (
    <div ref={setNodeRef} style={mergedStyle} className={className} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

const noop = () => {}

// Wallpaper filter per room - derived from room index
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

// ═══════════════════════════════════════════
// EDITORIAL INTELLIGENCE
// Auto-sizes tiles within a CSS Grid for visual
// rhythm. Each group sums to exactly 4 columns
// so there's no dead space or reordering.
// Pattern: hero(4) → pair(2+2) → quad(1×4) → …
// ═══════════════════════════════════════════

function getEditorialSize(index: number, total: number, userSize: number): number {
  if (userSize >= 2) return userSize       // respect explicit user sizing
  if (total <= 2) return 4                 // few tiles → hero everything
  if (total <= 4 && index === 0) return 4
  if (index === 0) return 4                // first tile is always hero
  // After hero: [2,2, 1,1,1,1] repeating — pair then quad
  const pos = (index - 1) % 6
  if (pos < 2) return 2                    // medium pair (2+2 = 4 cols)
  return 1                                  // small quad  (1×4 = 4 cols)
}

function getEditorialColSpan(size: number): string {
  if (size >= 4) return 'col-span-2 md:col-span-4'
  if (size >= 2) return 'col-span-2 md:col-span-2'
  return ''  // 1-col, no extra class
}

// Every tile gets a bounded aspect-ratio — no unbounded h-auto expansion
function getEditorialAspectClass(size: number, type: string, url?: string): string {
  if (type === 'youtube' || type === 'vimeo') return 'aspect-video'
  if (type === 'video') return 'aspect-video'
  if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'aspect-video'
  if (size >= 4) return 'aspect-video'       // hero: 16:9
  if (size >= 2) return 'aspect-[4/3]'       // medium: landscape
  return 'aspect-square'                      // small: square
}

function getEditorialImageSizes(size: number): string {
  if (size >= 4) return '(max-width: 768px) 100vw, 880px'
  if (size >= 2) return '(max-width: 768px) 100vw, 440px'
  return '(max-width: 768px) 50vw, 220px'
}

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({})
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const interactive = footprint.interactive !== false // default true
  const gm = footprint.grid_mode
  const layoutMode: string = (gm === 'editorial' || gm === 'breathe' || gm === 'grid') ? gm : 'editorial'

  // Sensors: desktop = click+drag (8px threshold), mobile = long-press (200ms)
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  // Default to first room on mount
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')

  // Memoize content filtering
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

  // Apply local drag order if user has rearranged tiles in this room
  const orderKey = activeRoomId || '__all__'
  const content = useMemo(() => {
    const order = localOrder[orderKey]
    if (!order) return baseContent
    const byId = new Map(baseContent.map((item: any) => [item.id, item]))
    return order.map(id => byId.get(id)).filter(Boolean)
  }, [baseContent, localOrder, orderKey])

  // Wallpaper filter derived from active room
  const activeRoomIndex = activeRoomId ? visibleRooms.findIndex(r => r.id === activeRoomId) : -1
  const wallpaperFilter = activeRoomIndex >= 0
    ? ROOM_FILTERS[activeRoomIndex % ROOM_FILTERS.length]
    : DEFAULT_FILTER
  const overlayColor = activeRoomIndex >= 0
    ? ROOM_OVERLAYS[activeRoomIndex % ROOM_OVERLAYS.length]
    : DEFAULT_OVERLAY

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    setShowToast(true)
  }

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Check if user is logged in
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(r => { if (r.ok) setIsLoggedIn(true) })
      .catch(() => {})
  }, [])

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

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = content.map((item: any) => item.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const newIds = arrayMove(ids, oldIndex, newIndex)
    setLocalOrder(prev => ({ ...prev, [orderKey]: newIds }))
  }, [content, orderKey])

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Layout mode config
  const layoutConfig = useMemo(() => {
    switch (layoutMode) {
      case 'breathe':
        return {
          gap: 8,
          tileRadius: 8,
          containerPx: 16,
          blockRadius: 0,
          blockShadow: 'none',
          blockOverflow: 'visible' as const,
          tileShadow: '0 2px 12px rgba(0,0,0,0.15)',
          gridCols: 'grid-cols-2 md:grid-cols-4',
        }
      case 'grid':
        return {
          gap: 2,
          tileRadius: 0,
          containerPx: 0,
          blockRadius: 6,
          blockShadow: '0 8px 60px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)',
          blockOverflow: 'hidden' as const,
          tileShadow: 'none',
          gridCols: 'grid-cols-2 md:grid-cols-3',
        }
      default: // editorial
        return {
          gap: 2,
          tileRadius: 0,
          containerPx: 0,
          blockRadius: 6,
          blockShadow: '0 8px 60px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)',
          blockOverflow: 'hidden' as const,
          tileShadow: 'none',
          gridCols: 'grid-cols-2 md:grid-cols-4',
        }
    }
  }, [layoutMode])

  // Tile renderer — fills its aspect-ratio container
  const renderTileContent = (item: any, index: number, effectiveSize: number) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

    // Thought tiles — glassmorphic annotation
    if (item.type === 'thought') {
      const text = item.title || ''
      const len = text.length
      const fontSize = len <= 6 ? '24px' : len <= 20 ? '17px' : len <= 60 ? '14px' : '13px'
      const letterSpacing = len <= 6 ? '-0.03em' : len <= 20 ? '-0.02em' : '-0.01em'
      return (
        <div
          className="w-full h-full flex items-center justify-center p-4"
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px) saturate(120%)',
            WebkitBackdropFilter: 'blur(20px) saturate(120%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          data-tile-id={item.id}
          data-tile-type="thought"
        >
          <p
            className="whitespace-pre-wrap text-center text-white"
            style={{ fontSize, fontWeight: 300, letterSpacing, lineHeight: 1.5 }}
          >
            {text}
          </p>
        </div>
      )
    }

    // Videos
    if (isVideo) {
      return (
        <div className="w-full h-full" data-tile-id={item.id} data-tile-type={item.type}>
          <VideoTile src={item.url} onWidescreen={noop} aspect={effectiveSize >= 4 ? 'wide' : 'square'} isPublicHero={effectiveSize >= 4} />
        </div>
      )
    }

    // Images — object-cover fills the aspect-ratio container
    if (item.type === 'image') {
      const w = effectiveSize >= 4 ? 880 : effectiveSize >= 2 ? 440 : 220
      const h = effectiveSize >= 4 ? 495 : effectiveSize >= 2 ? 330 : 220
      return (
        <div className="w-full h-full overflow-hidden" data-tile-id={item.id} data-tile-type={item.type}>
          <Image
            src={item.url}
            alt={item.title || ''}
            width={w}
            height={h}
            sizes={getEditorialImageSizes(effectiveSize)}
            className="w-full h-full object-cover"
            loading={index < 4 ? 'eager' : 'lazy'}
            priority={index < 2}
            quality={75}
            fetchPriority={index === 0 ? 'high' : undefined}
            onError={(e) => {
              const container = (e.target as HTMLElement).closest('[data-tile-id]')
              if (container) (container as HTMLElement).style.background = 'rgba(0,0,0,0.3)'
            }}
          />
        </div>
      )
    }

    // Embeds, links, etc.
    return (
      <div className="w-full h-full" data-tile-id={item.id} data-tile-type={item.type}>
        <ContentCard content={item} isMobile={isMobile} tileSize={effectiveSize} aspect={effectiveSize >= 4 ? 'wide' : 'square'} isPublicView />
      </div>
    )
  }

  // Active drag item for overlay
  const activeDragItem = activeDragId ? content.find((item: any) => item.id === activeDragId) : null

  // Tile IDs for DndContext
  const allTileIds = useMemo(() => content.map((item: any) => item.id), [content])

  // The grid — one CSS Grid, one cohesive block
  const gridElement = (
    <div
      className={`grid ${layoutConfig.gridCols}`}
      style={{
        gap: `${layoutConfig.gap}px`,
        gridAutoRows: 'auto',
        gridAutoFlow: 'dense',
        opacity: roomFade === 'out' ? 0 : 1,
        transition: 'opacity 200ms ease-out',
      }}
    >
      {content.map((item: any, idx: number) => {
        const userSize = item.size || 1
        const effectiveSize = layoutMode === 'grid'
          ? 1
          : getEditorialSize(idx, content.length, userSize)

        const spanClass = layoutMode === 'grid' ? '' : getEditorialColSpan(effectiveSize)
        const aspectClass = layoutMode === 'grid'
          ? 'aspect-square'
          : getEditorialAspectClass(effectiveSize, item.type, item.url)

        const tileClass = `${spanClass} ${aspectClass} overflow-hidden tile-enter tile-container`.trim()
        const tileStyle: React.CSSProperties = {
          borderRadius: `${layoutConfig.tileRadius}px`,
          boxShadow: layoutConfig.tileShadow,
        }

        const tileContent = renderTileContent(item, idx, effectiveSize)

        if (interactive) {
          return (
            <SortableTile key={item.id} id={item.id} className={tileClass} style={tileStyle}>
              {tileContent}
            </SortableTile>
          )
        }
        return (
          <div key={item.id} className={tileClass} style={{ ...tileStyle, animationDelay: `${idx * 40}ms` }}>
            {tileContent}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-screen relative flex flex-col" style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
      {/* Wallpaper layer */}
      {footprint.background_url && (
        <div className="fixed inset-0 z-0">
          <Image
            src={footprint.background_url}
            alt=""
            fill
            priority
            quality={60}
            sizes="100vw"
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

      {/* Top-right action */}
      <div className="fixed top-5 right-4 md:right-6 z-30">
        {isLoggedIn ? (
          <a
            href={`/${footprint.username}/home`}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </a>
        ) : (
          <PlusButton slug={footprint.slug} />
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Sky — wallpaper breathing space above content */}
        <div style={{ height: '80px' }} />

        {/* Masthead — name commands the space, adapts to length */}
        <RemoveBubble slug={footprint.slug}>
          <header className="pb-4 md:pb-5 flex flex-col items-center px-4">
            <h1
              className={`uppercase ${
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

        {/* Room nav — dot-separated, whispered chapters */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center gap-0 mb-4 md:mb-6 font-mono overflow-x-auto hide-scrollbar px-4">
            {visibleRooms.map((room, i) => (
              <span key={room.id} className="flex items-center whitespace-nowrap">
                {i > 0 && <span className="mx-2.5" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px' }}>·</span>}
                <button
                  onClick={() => goToRoom(room.id)}
                  className="transition-all duration-300"
                  style={{
                    fontSize: '11px',
                    letterSpacing: '2.5px',
                    textTransform: 'lowercase',
                    fontWeight: activeRoomId === room.id ? 400 : 300,
                    color: activeRoomId === room.id ? 'white' : 'rgba(255,255,255,0.4)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {room.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* The Grid — the product */}
        <div
          className="fp-grid-container mx-auto w-full px-3 md:px-0"
          style={{
            maxWidth: '880px',
            paddingLeft: layoutMode === 'breathe' ? (isMobile ? '16px' : '20px') : undefined,
            paddingRight: layoutMode === 'breathe' ? (isMobile ? '16px' : '20px') : undefined,
          }}
        >
          <div
            className="fp-grid-arrive"
            style={{
              borderRadius: `${layoutConfig.blockRadius}px`,
              overflow: layoutConfig.blockOverflow,
              boxShadow: layoutConfig.blockShadow,
            }}
          >
            {interactive ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={allTileIds} strategy={rectSortingStrategy}>
                  {gridElement}
                </SortableContext>
                <DragOverlay>
                  {activeDragItem ? (
                    <div
                      className="aspect-square overflow-hidden tile-container"
                      style={{ transform: 'rotate(1deg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', borderRadius: '4px', maxWidth: '200px' }}
                    >
                      {renderTileContent(activeDragItem, 0, 1)}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              gridElement
            )}
          </div>
        </div>

        {content.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: theme.colors.textMuted }}>
            nothing here.
          </p>
        )}

        {/* Floor — wallpaper breathing space below content */}
        <div style={{ height: '120px' }} />

        {/* Footer — quiet share icon */}
        <div className="py-10 flex items-center justify-center">
          <button
            onClick={handleShare}
            className="group text-white/[0.12] hover:text-white/40 transition-colors duration-500"
            aria-label="Share"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.25 8.81" />
            </svg>
          </button>
        </div>
      </div>

      {/* Rolodex drawer */}
      {isLoggedIn && (
        <>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open saved footprints"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-10 h-1 rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition-colors duration-200"
          />
          <RolodexDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

      {/* Floating CTA bar — shown on published rooms, self-hides for published owners */}
      {!isDraft && (
        <FloatingCtaBar username={footprint.username} serial={serial} />
      )}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}
    </div>
  )
}
