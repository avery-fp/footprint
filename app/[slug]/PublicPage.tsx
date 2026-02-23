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
function SortableTile({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: 'grab',
  }
  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
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

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({})
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const interactive = footprint.interactive !== false // default true

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

  // Image sizes based on tile size
  const getImageSizes = (tileSize: number) => {
    if (tileSize >= 3) return isMobile ? '100vw' : '(max-width: 768px) 100vw, 75vw'
    if (tileSize === 2) return isMobile ? '100vw' : '(max-width: 768px) 100vw, 50vw'
    return isMobile ? '50vw' : '(max-width: 768px) 50vw, 25vw'
  }

  // Smart default aspect
  const resolveAspect = (explicitAspect: string | undefined | null, type: string, url?: string): string => {
    if (explicitAspect && explicitAspect !== 'square') return explicitAspect
    if (explicitAspect === 'square') return 'square'
    if (type === 'youtube' || type === 'vimeo') return 'wide'
    if (type === 'video') return 'auto'
    if (type === 'image' && url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)) return 'auto'
    if (type === 'image') return 'auto'
    return 'square'
  }

  // Grid class helpers
  const getAspectClass = (aspect: string) => {
    if (aspect === 'wide') return 'aspect-video'
    if (aspect === 'tall') return 'aspect-[9/16]'
    if (aspect === 'auto') return ''
    return 'aspect-square'
  }

  const getObjectFit = (aspect: string) => {
    return 'object-cover'
  }

  // Tile col-span class based on size and aspect
  const getColSpan = (size: number, aspect: string = 'square') => {
    if (aspect === 'wide') {
      if (size >= 4) return 'col-span-2 row-span-1 md:col-span-4 md:row-span-2'
      if (size >= 3) return 'col-span-2 row-span-1 md:col-span-4 md:row-span-2'
      if (size >= 2) return 'col-span-2 row-span-1 md:col-span-3 md:row-span-1'
      return 'col-span-2 row-span-1'
    }
    if (aspect === 'tall') {
      if (size >= 4) return 'col-span-2 row-span-3 md:col-span-2 md:row-span-5'
      if (size >= 3) return 'col-span-2 row-span-3 md:col-span-2 md:row-span-4'
      if (size >= 2) return 'col-span-1 row-span-3 md:col-span-2 md:row-span-3'
      return 'col-span-1 row-span-2'
    }
    return size === 4 ? 'col-span-2 row-span-2 md:col-span-4 md:row-span-4'
      : size === 3 ? 'col-span-2 row-span-2 md:col-span-3 md:row-span-3'
      : size === 2 ? 'col-span-2 row-span-2'
      : ''
  }

  // Reusable tile renderer
  const renderTileContent = (item: any, index: number) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    const tileSize = item.size || 1
    const tileAspect = resolveAspect(item.aspect, item.type, item.url)
    const imgSizes = getImageSizes(tileSize)
    const aspectCls = getAspectClass(tileAspect)
    const fitCls = getObjectFit(tileAspect)

    // For 'auto' images
    if (tileAspect === 'auto' && item.type === 'image' && !isVideo) {
      return (
        <div className="fp-tile overflow-hidden" data-tile-id={item.id} data-tile-type={item.type}>
          <Image src={item.url} alt={item.title || ''}
            width={tileSize >= 2 ? 800 : 400} height={tileSize >= 2 ? 800 : 400}
            sizes={imgSizes}
            className="w-full h-auto object-cover transition-opacity duration-300"
            loading={index < 4 ? "eager" : "lazy"}
            priority={index < 4} quality={75}
            onError={(e) => { (e.target as HTMLElement).closest('.tile-container')!.style.display = 'none' }} />
        </div>
      )
    }

    return (
      <div className={`${aspectCls} fp-tile overflow-hidden`} data-tile-id={item.id} data-tile-type={item.type}>
        {item.type === 'image' ? (
          isVideo ? (
            <VideoTile src={item.url} onWidescreen={noop} aspect={tileAspect} />
          ) : (
            <Image src={item.url} alt={item.title || ''}
              width={tileSize >= 2 ? 800 : 400} height={tileSize >= 2 ? 800 : 400}
              sizes={imgSizes}
              className={`w-full h-full ${fitCls} transition-opacity duration-300`}
              loading={index < 4 ? "eager" : "lazy"}
              priority={index < 4} quality={75}
              onError={(e) => { (e.target as HTMLElement).closest('.tile-container')!.style.display = 'none' }} />
          )
        ) : (
          <ContentCard content={item} isMobile={isMobile} tileSize={tileSize} aspect={tileAspect} />
        )}
      </div>
    )
  }

  // Active drag item for overlay
  const activeDragItem = activeDragId ? content.find((item: any) => item.id === activeDragId) : null

  // The grid — the entire product
  const gridElement = (
    <div
      className="grid grid-cols-2 md:grid-cols-4 gap-[2px]"
      style={{
        gridAutoRows: 'auto',
        gridAutoFlow: 'dense',
        opacity: roomFade === 'out' ? 0 : 1,
        transition: 'opacity 200ms ease-out',
      }}
    >
      {content.map((item: any, idx: number) => {
        const tileClass = `${getColSpan(item.size || 1, resolveAspect(item.aspect, item.type, item.url))} group tile-enter tile-container`
        if (interactive) {
          return (
            <SortableTile key={item.id} id={item.id} className={tileClass}>
              {renderTileContent(item, idx)}
            </SortableTile>
          )
        }
        return (
          <div key={item.id} className={tileClass} style={{ animationDelay: `${idx * 40}ms` }}>
            {renderTileContent(item, idx)}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-screen relative flex flex-col" style={{ background: theme.colors.background, color: theme.colors.text }}>
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
        {/* Masthead — stripped to the bone */}
        <RemoveBubble slug={footprint.slug}>
          <header className="pt-16 md:pt-20 pb-6 md:pb-8 flex flex-col items-center">
            <h1
              className="text-2xl md:text-5xl tracking-[0.2em] font-normal uppercase"
              style={{
                color: theme.colors.text,
                opacity: 0.9,
                textShadow: footprint.background_url ? '0 2px 16px rgba(0,0,0,0.9)' : 'none',
              }}
            >
              {footprint.display_name || '\u00e6'}
            </h1>
          </header>
        </RemoveBubble>

        {/* Room pills — dot-separated, geometric */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center mb-3 md:mb-5">
            {visibleRooms.map((room, i) => (
              <span key={room.id} className="flex items-center">
                {i > 0 && <span className="text-white/10 text-[10px] mx-2 select-none">&middot;</span>}
                <button
                  onClick={() => goToRoom(room.id)}
                  className={`text-[11px] tracking-[0.12em] lowercase font-mono transition-all duration-300 ${
                    activeRoomId === room.id
                      ? 'text-white/70'
                      : 'text-white/20 hover:text-white/45'
                  }`}
                >
                  {room.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* The Grid — the product */}
        <div className="fp-grid-container mx-auto w-full px-3 md:px-0" style={{ maxWidth: isMobile ? undefined : '880px' }}>
          <div className="fp-grid-block fp-grid-arrive">
            {interactive ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={content.map((item: any) => item.id)} strategy={rectSortingStrategy}>
                  {gridElement}
                </SortableContext>
                <DragOverlay>
                  {activeDragItem ? (
                    <div
                      className={`${getColSpan(activeDragItem.size || 1, resolveAspect(activeDragItem.aspect, activeDragItem.type, activeDragItem.url))} tile-container`}
                      style={{ transform: 'rotate(1deg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}
                    >
                      {renderTileContent(activeDragItem, 0)}
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

        {/* Footer — one icon */}
        <div className="flex-1" />
        <div className="py-10 flex items-center justify-center">
          <button
            onClick={handleShare}
            className="text-white/[0.12] hover:text-white/40 transition-colors duration-300"
            aria-label="Copy link"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.12 7.48l-4.5 2.598a4.5 4.5 0 01-4.5-7.794l.87-.502M10.82 15.312a4.5 4.5 0 01-1.12-7.48l4.5-2.598a4.5 4.5 0 014.5 7.794l-.87.502" />
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

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-full px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}
    </div>
  )
}
