'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import ContentCard from '@/components/ContentCard'
import VideoTile from '@/components/VideoTile'
import WeatherEffect from '@/components/WeatherEffect'

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
}

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

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Default to first room on mount
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [widescreenIds, setWidescreenIds] = useState<Set<string>>(new Set())
  const [swipeDelta, setSwipeDelta] = useState(0)
  const [isSwipeAnimating, setIsSwipeAnimating] = useState(false)
  const swipeTouchRef = useRef<{ x: number; y: number; locked: boolean; isVertical: boolean } | null>(null)
  const swipeRafRef = useRef<number | null>(null)
  const swipeContainerRef = useRef<HTMLDivElement>(null)

  const markWidescreen = useCallback((id: string) => {
    setWidescreenIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // Filter out ghost tiles (empty URLs with no title/content)
  const isValidTile = (item: any) =>
    (item.type === 'thought' && item.title) ||
    (item.url && item.url !== '')

  const validContent = allContent.filter(isValidTile)

  // Filter orphan rooms (empty/whitespace-only names)
  const visibleRooms = rooms
    .filter(r => r.name && r.name.trim().length > 0)
    .map(r => ({ ...r, content: r.content.filter(isValidTile) }))

  const content = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

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

  // Owner detection — lightweight API check, no flash
  // Navigate to room
  const goToRoom = (roomId: string | null) => {
    setActiveRoomId(roomId)
  }

  // Gesture-tracked room swipe
  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    if (visibleRooms.length <= 1 || !isMobile || e.touches.length !== 1 || isSwipeAnimating) return
    swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: false, isVertical: false }
  }, [visibleRooms.length, isMobile, isSwipeAnimating])

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchRef.current || visibleRooms.length <= 1 || isSwipeAnimating) return
    const touch = e.touches[0]
    const dx = touch.clientX - swipeTouchRef.current.x
    const dy = touch.clientY - swipeTouchRef.current.y

    // Determine direction lock on first significant movement
    if (!swipeTouchRef.current.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      swipeTouchRef.current.locked = true
      swipeTouchRef.current.isVertical = Math.abs(dy) > Math.abs(dx)
    }

    // If vertical scroll, bail
    if (swipeTouchRef.current.isVertical) return

    const currentIdx = visibleRooms.findIndex(r => r.id === activeRoomId)
    // Resist at edges
    const atStart = currentIdx <= 0 && dx > 0
    const atEnd = currentIdx >= visibleRooms.length - 1 && dx < 0
    const resistedDx = (atStart || atEnd) ? dx * 0.2 : dx

    if (swipeRafRef.current) cancelAnimationFrame(swipeRafRef.current)
    swipeRafRef.current = requestAnimationFrame(() => {
      setSwipeDelta(resistedDx)

      // Update room pill at 50% threshold
      const screenWidth = window.innerWidth
      const pct = Math.abs(resistedDx) / screenWidth
      if (pct > 0.5) {
        if (resistedDx < 0 && currentIdx < visibleRooms.length - 1) {
          setActiveRoomId(visibleRooms[currentIdx + 1].id)
          swipeTouchRef.current = { x: touch.clientX, y: touch.clientY, locked: true, isVertical: false }
          setSwipeDelta(0)
        } else if (resistedDx > 0 && currentIdx > 0) {
          setActiveRoomId(visibleRooms[currentIdx - 1].id)
          swipeTouchRef.current = { x: touch.clientX, y: touch.clientY, locked: true, isVertical: false }
          setSwipeDelta(0)
        }
      }
    })
  }, [visibleRooms, activeRoomId, isMobile, isSwipeAnimating])

  const handleSwipeTouchEnd = useCallback(() => {
    if (!swipeTouchRef.current || swipeTouchRef.current.isVertical) {
      swipeTouchRef.current = null
      return
    }
    if (swipeRafRef.current) cancelAnimationFrame(swipeRafRef.current)

    const screenWidth = window.innerWidth
    const pct = Math.abs(swipeDelta) / screenWidth
    const currentIdx = visibleRooms.findIndex(r => r.id === activeRoomId)

    if (pct > 0.3) {
      // Commit swipe
      setIsSwipeAnimating(true)
      const goingLeft = swipeDelta < 0
      const targetDelta = goingLeft ? -screenWidth : screenWidth

      setSwipeDelta(targetDelta)
      setTimeout(() => {
        if (goingLeft && currentIdx < visibleRooms.length - 1) {
          setActiveRoomId(visibleRooms[currentIdx + 1].id)
        } else if (!goingLeft && currentIdx > 0) {
          setActiveRoomId(visibleRooms[currentIdx - 1].id)
        }
        setSwipeDelta(0)
        setIsSwipeAnimating(false)
      }, 300)
    } else {
      // Snap back
      setIsSwipeAnimating(true)
      setSwipeDelta(0)
      setTimeout(() => setIsSwipeAnimating(false), 200)
    }

    swipeTouchRef.current = null
  }, [swipeDelta, visibleRooms, activeRoomId])

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Image sizes based on tile size for proper srcset selection
  const getImageSizes = (tileSize: number) => {
    if (tileSize >= 3) return isMobile ? '100vw' : '(max-width: 768px) 100vw, 75vw'
    if (tileSize === 2) return isMobile ? '100vw' : '(max-width: 768px) 100vw, 50vw'
    return isMobile ? '50vw' : '(max-width: 768px) 50vw, 25vw'
  }

  // Reusable tile renderer - size-aware col-span in CSS Grid
  const renderTile = (item: any, index: number) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    const tileSize = item.size || 1
    const colSpan = tileSize === 4 ? 'col-span-2 md:col-span-4'
      : tileSize === 3 ? 'col-span-2 md:col-span-3'
      : tileSize === 2 ? 'col-span-2'
      : ''
    const imgSizes = getImageSizes(tileSize)
    return (
      <div key={item.id}
        className={`${colSpan} group tile-enter tile-container`}
        style={{}}>
        <div className="aspect-square group-hover:scale-[1.02] transition-transform duration-300 will-change-transform rounded-xl overflow-hidden bg-white/[0.02]">
          {item.type === 'image' ? (
            isVideo ? (
              <div className="rounded-xl overflow-hidden border border-white/[0.06] w-full h-full">
                <VideoTile src={item.url} onWidescreen={() => {}} />
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <Image src={item.url} alt={item.title || ''}
                  width={tileSize >= 2 ? 800 : 400} height={tileSize >= 2 ? 800 : 400}
                  sizes={imgSizes}
                  className="w-full h-full object-cover rounded-xl transition-opacity duration-300"
                  loading={index < 4 ? "eager" : "lazy"}
                  priority={index < 4} quality={75}
                  onError={(e) => { (e.target as HTMLElement).closest('.tile-container')!.style.display = 'none' }} />
              </div>
            )
          ) : (
            <div className="rounded-xl overflow-hidden border border-white/[0.06] w-full h-full">
              <ContentCard content={item} isMobile={isMobile} tileSize={tileSize} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative" style={{ background: theme.colors.background, color: theme.colors.text }}>
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
              transform: footprint.background_blur !== false ? 'scale(1.05)' : 'none',
              transition: 'filter 0.8s ease',
              willChange: 'transform',
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

      <div className="relative z-10">
        {/* Masthead */}
        <header className="mb-12 md:mb-16 flex flex-col items-center pt-24 md:pt-32">
            <h1
              className="text-4xl md:text-6xl tracking-[0.15em] font-normal text-white/90"
              style={{
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                lineHeight: 1,
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              {footprint.display_name || '\u00e6'}
            </h1>
            <span className="text-white/30 tracking-[0.3em] uppercase text-[10px] font-light mt-2"
              style={{
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              #{serial}
            </span>
            {(() => {
              const bio = (footprint.bio || '').trim().toLowerCase()
              const hide = !bio || bio === 'personal internet' || bio === 'footprint'
              return hide ? null : (
                <p
                  className="mt-3 text-white/30 text-xs tracking-[0.15em] lowercase max-w-md text-center"
                  style={{
                    fontFamily: '"Helvetica Neue", system-ui, sans-serif',
                    fontWeight: 300,
                    textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
                  }}
                >
                  {footprint.bio}
                </p>
              )
            })()}
            <p
              className="mt-2 text-white/30 text-[11px] tracking-[0.25em] lowercase font-medium"
              style={{
                fontFamily: '"Helvetica Neue", system-ui, sans-serif',
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              footprint
            </p>
            {/* CTA */}
            <a
              href={'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'}
              className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2 text-[10px] tracking-[0.2em] lowercase text-white/50 hover:text-white/80 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/[0.15] transition-all duration-500"
            >
              make yours.
            </a>
        </header>

        {/* Room Tabs */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap relative z-20 max-w-7xl mx-auto px-3 md:px-5">
            {visibleRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => goToRoom(room.id)}
                className={`px-4 py-1.5 rounded-full text-sm transition-all backdrop-blur-sm border-0 ${
                  activeRoomId === room.id
                    ? 'bg-white/[0.12] text-white/90'
                    : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
                }`}
              >
                {room.name}
              </button>
            ))}
          </div>
        )}

        {/* Content grid - gesture-tracked room swipe on mobile */}
        <div className="max-w-7xl mx-auto px-3 md:px-5 overflow-hidden"
          ref={swipeContainerRef}
          onTouchStart={handleSwipeTouchStart}
          onTouchMove={handleSwipeTouchMove}
          onTouchEnd={handleSwipeTouchEnd}
        >
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-2"
            style={{
              transform: swipeDelta !== 0 ? `translateX(${swipeDelta}px)` : undefined,
              transition: isSwipeAnimating ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none',
              willChange: swipeDelta !== 0 ? 'transform' : 'auto',
            }}
          >
            {content.map((item, idx) => renderTile(item, idx))}
          </div>
        </div>

        {content.length === 0 && (
          <p className="text-center py-16" style={{ color: theme.colors.textMuted }}>
            nothing here.
          </p>
        )}

        {/* Footer */}
        <div className="mt-24 mb-12 flex items-center justify-center gap-3">
          <a href="https://footprint.onl" className="text-white/[0.08] text-xs tracking-[0.3em] hover:text-white/20 transition-colors">
            footprint.onl
          </a>
          <button
            onClick={handleShare}
            className="text-white/[0.08] hover:text-white/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-full px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}
    </div>
  )
}
