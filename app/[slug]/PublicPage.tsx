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

// Wallpaper filter per room — derived from room index
const ROOM_FILTERS = [
  // Room 0: cool, moderate blur
  'blur(8px) brightness(0.45) saturate(0.85) hue-rotate(-8deg)',
  // Room 1: warm, bright, low blur — wallpaper almost legible
  'blur(4px) brightness(0.65) saturate(1.4) hue-rotate(25deg)',
  // Room 2: deep, hyper-saturated, max blur
  'blur(16px) brightness(0.3) saturate(1.6) hue-rotate(-35deg)',
  // Room 3: sharp editorial — zero blur, desaturated
  'blur(0px) brightness(0.55) saturate(0.2) hue-rotate(0deg)',
  // Room 4: vivid, bright, warm shift
  'blur(10px) brightness(0.7) saturate(1.2) hue-rotate(35deg)',
  // Room 5: noir — dark, muted, heavy blur
  'blur(14px) brightness(0.35) saturate(0.4) hue-rotate(-20deg)',
]
const DEFAULT_FILTER = 'blur(12px)'

const ROOM_OVERLAYS = [
  'rgba(0,0,0,0.58)',
  'rgba(0,0,0,0.55)',
  'rgba(0,0,0,0.68)',
  'rgba(0,0,0,0.62)',
  'rgba(0,0,0,0.52)',
  'rgba(0,0,0,0.72)',
]
const DEFAULT_OVERLAY = 'rgba(0,0,0,0.6)'

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [widescreenIds, setWidescreenIds] = useState<Set<string>>(new Set())
  const swipeRef = useRef<HTMLDivElement>(null)

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
    (item.type === 'thought' && item.title) || (item.url && item.url !== '')

  const validContent = allContent.filter(isValidTile)

  // Filter orphan rooms (empty names, single-char junk)
  const visibleRooms = rooms
    .filter(r => r.name && r.name.length > 1)
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

  // Sync swipe with room state on mobile
  useEffect(() => {
    if (!isMobile || !swipeRef.current) return
    const container = swipeRef.current
    let timeout: NodeJS.Timeout

    const handleScroll = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        const idx = Math.round(container.scrollLeft / container.offsetWidth)
        if (visibleRooms.length === 0) return
        if (idx === 0) {
          setActiveRoomId(null)
        } else {
          setActiveRoomId(visibleRooms[idx - 1]?.id || null)
        }
      }, 80)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      clearTimeout(timeout)
    }
  }, [isMobile, visibleRooms])

  // Navigate to room (scrolls on mobile)
  const goToRoom = (roomId: string | null) => {
    setActiveRoomId(roomId)
    if (isMobile && swipeRef.current) {
      const idx = roomId ? visibleRooms.findIndex(r => r.id === roomId) + 1 : 0
      swipeRef.current.scrollTo({
        left: idx * swipeRef.current.offsetWidth,
        behavior: 'smooth'
      })
    }
  }

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Reusable tile renderer — widescreen heroes get column-span: all
  const renderTile = (item: any, index: number) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    const isHero = widescreenIds.has(item.id)
    return (
      <div key={item.id}
        className={`${isHero ? '' : 'break-inside-avoid'} mb-2 group tile-enter tile-container`}
        style={{
          animationDelay: `${index * 60}ms`,
          ...(isHero ? { columnSpan: 'all' as any } : {}),
        }}>
        <div className="group-hover:scale-[1.02] transition-transform duration-300 will-change-transform rounded-xl">
          {item.type === 'image' ? (
            isVideo ? (
              <div className="rounded-xl overflow-hidden border border-white/[0.06] max-h-[300px]">
                <VideoTile src={item.url} onWidescreen={() => markWidescreen(item.id)} />
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <Image src={item.url} alt={item.title || ''} width={600} height={800}
                  sizes={isMobile ? "50vw" : "(max-width: 768px) 50vw, 25vw"}
                  className="w-full h-auto rounded-xl" loading={index < 4 ? "eager" : "lazy"}
                  priority={index < 4} quality={75}
                  onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = 'none' }} />
              </div>
            )
          ) : (
            <div className="rounded-xl overflow-hidden border border-white/[0.06]">
              <ContentCard content={item} onWidescreen={() => markWidescreen(item.id)} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative" style={{ background: theme.colors.background, color: theme.colors.text }}>
      {/* Wallpaper layer — fixed full-viewport, Image with object-cover */}
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
        {/* æ Masthead — no avatar, just text */}
        <header className="mb-12 md:mb-16 flex flex-col items-center pt-24 md:pt-32">
            <h1
              className="text-4xl md:text-6xl tracking-[0.15em] font-normal text-white/90"
              style={{
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                lineHeight: 1,
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              {footprint.display_name || 'æ'}
            </h1>
            <span className="text-white/30 tracking-[0.3em] uppercase text-[10px] font-light mt-2"
              style={{
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              #{serial}
            </span>
            {footprint.bio && footprint.bio !== 'personal internet' && (
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
            )}
            {/* CTA */}
            <a
              href="https://footprint.onl"
              className="mt-5 inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-white/25 hover:text-white/50 transition-all duration-700"
            >
              Own Your Footprint
              <span className="w-[3px] h-[3px] rounded-full bg-white/20" />
            </a>
        </header>

        {/* Room Tabs — only show when multiple rooms exist */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap relative z-20 max-w-7xl mx-auto px-3 md:px-5">
            <button
              onClick={() => goToRoom(null)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all backdrop-blur-sm border-0 ${
                activeRoomId === null
                  ? 'bg-white/[0.12] text-white/90'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
              }`}
            >
              all
            </button>
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

        {/* CSS Columns Masonry */}
        <div className="max-w-7xl mx-auto px-3 md:px-5">
          {isMobile && visibleRooms.length > 1 ? (
            /* MOBILE SWIPE */
            <div
              ref={swipeRef}
              className="flex swipe-container"
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* "All" panel */}
              <div className="w-full min-w-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
                <div className="columns-2" style={{ columnGap: '8px' }}>
                  {validContent.map((item, idx) => renderTile(item, idx))}
                </div>
              </div>
              {/* Room panels */}
              {visibleRooms.map((room) => (
                <div key={room.id} className="w-full min-w-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
                  <div className="columns-2" style={{ columnGap: '8px' }}>
                    {room.content.map((item, idx) => renderTile(item, idx))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* DESKTOP — existing grid, unchanged */
            <div className="columns-2 md:columns-3 lg:columns-4" style={{ columnGap: '8px' }}>
              {content.map((item, idx) => renderTile(item, idx))}
            </div>
          )}
        </div>

        {content.length === 0 && (
          <p className="text-center py-16" style={{ color: theme.colors.textMuted }}>
            Nothing here yet.
          </p>
        )}

        {/* Mobile page dots */}
        {isMobile && visibleRooms.length > 1 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5
            bg-black/20 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/[0.04]">
            {[null, ...visibleRooms.map(r => r.id)].map((id, i) => {
              const isActive = id === activeRoomId || (id === null && activeRoomId === null)
              return (
                <div key={i} className="transition-all duration-300"
                  style={{
                    width: isActive ? 18 : 4,
                    height: 3,
                    borderRadius: 2,
                    background: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)',
                  }}
                />
              )
            })}
          </div>
        )}

        {/* Footer — whisper */}
        <div className="mt-24 mb-12 flex items-center justify-center gap-3">
          <a href="https://footprint.onl" className="text-white/[0.08] text-xs tracking-[0.3em] hover:text-white/20 transition-colors">
            footprint.onl
          </a>
          <button
            onClick={handleShare}
            className="text-white/[0.08] hover:text-white/20 transition-colors"
            title="Copy link"
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
          Copied to clipboard
        </div>
      )}
    </div>
  )
}
