'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ContentCard from '@/components/ContentCard'
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

// Wallpaper filter per room â derived from room index
const ROOM_FILTERS = [
  'blur(8px) brightness(0.45) saturate(0.85) hue-rotate(-8deg)',
  // Room 1: warm, bright, low blur â wallpaper almost legible
  'blur(4px) brightness(0.65) saturate(1.4) hue-rotate(25deg)',
  'blur(16px) brightness(0.3) saturate(1.6) hue-rotate(-35deg)',
  // Room 3: sharp editorial â zero blur, desaturated
  'blur(0px) brightness(0.55) saturate(0.2) hue-rotate(0deg)',
  'blur(10px) brightness(0.7) saturate(1.2) hue-rotate(35deg)',
  // Room 5: noir â dark, muted, heavy blur
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
  const [unmutedId, setUnmutedId] = useState<string | null>(null)

  // Filter out ghost tiles (empty URLs with no title/content)
  const isValidTile = (item: any) =>
    (item.type === 'thought' && item.title) ||
    (item.type === 'image' && item.url && item.url !== '') ||
    (['youtube', 'spotify', 'soundcloud', 'applemusic', 'vimeo', 'twitter', 'instagram', 'tiktok', 'video', 'link'].includes(item.type) && item.url)

  const validContent = allContent.filter(isValidTile)

  // Filter orphan rooms (empty/whitespace-only names)
  const visibleRooms = rooms
    .filter(r => r.name && r.name.trim().length > 0)
    .map(r => ({ ...r, content: r.content.filter(isValidTile) }))

  const rawContent = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

  // Magazine rhythm: every 3rd tile becomes hero (user-set sizes override)
  const content = rawContent.map((item, i) => ({
    ...item,
    size: item.size || (i % 3 === 2 ? 2 : 1),
  }))

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

  const goToRoom = (roomId: string) => {
    setActiveRoomId(roomId)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Reusable tile renderer â size-aware col-span in CSS Grid
  const renderTile = (item: any, index: number) => {
    const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)
    const isHero = widescreenIds.has(item.id)
    const tileSize = item.size || 1
    const colSpan = tileSize === 4 ? 'col-span-2 md:col-span-4'
      : tileSize === 2 ? 'col-span-2'
      : isHero ? 'col-span-2 md:col-span-4'
      : ''
    return (
      <div key={item.id}
        className={`${colSpan} group tile-enter tile-container`}
        style={{}}>
        <div className="group-hover:scale-[1.02] transition-transform duration-300 will-change-transform rounded-xl overflow-hidden bg-white/[0.02]">
          {item.type === 'image' ? (
            isVideo ? (
              <div className="rounded-xl overflow-hidden border border-white/[0.06] max-h-[300px]">
                <VideoTile src={item.url} unoptimized={item.url?.includes("/content/")} onWidescreen={() => markWidescreen(item.id)} />
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <Image src={item.url} unoptimized={item.url?.includes("/content/")} alt={item.title || ''} width={600} height={800}
                  sizes={isMobile ? "50vw" : "(max-width: 768px) 50vw, 25vw"}
                  className="w-full h-auto rounded-xl transition-opacity duration-300" loading={index < 4 ? "eager" : "lazy"}
                  priority={index < 4} quality={75}
                  onError={(e) => { (e.target as HTMLElement).closest('.tile-container')!.style.display = 'none' }} />
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
      {/* Wallpaper layer â fixed full-viewport, Image with object-cover */}
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
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
              lineHeight: 1,
              textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
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
        {/* Ã¦ Masthead â no avatar, just text */}
        <header className="mb-12 md:mb-16 flex flex-col items-center pt-24 md:pt-32">
            <h1
              className="text-4xl md:text-6xl tracking-[0.15em] font-normal text-white/90"
              style={{
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                lineHeight: 1,
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              {footprint.display_name || 'Ã¦'}
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
            <p
              className="mt-2 text-white/20 text-[10px] tracking-[0.25em] lowercase"
              style={{
                fontFamily: '"Helvetica Neue", system-ui, sans-serif',
                fontWeight: 300,
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
              }}
            >
              personal internet
            </p>
            {/* CTA */}
            <a
              href={'https://buy.stripe.com/9B6cN40Ef0sG2z98b214400'}
              className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2 text-[10px] tracking-[0.2em] uppercase text-white/50 hover:text-white/80 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/[0.15] transition-all duration-500"
            >
              Claim yours — $10
            </a>
        </header>

        {/* Room Tabs â only show when multiple rooms exist */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap relative z-20 max-w-7xl mx-auto px-3 md:px-5">
            {visibleRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => goToRoom(room.id)}
                className={`px-4 py-1.5 rounded-full text-sm transition-all border-0 ${
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
                overflowY: 'visible',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                minHeight: '100vh',
              }}
            >
              {/* Room panels */}
              {visibleRooms.map((room) => (
                <div key={room.id} className="w-full min-w-full flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
                  <div className="grid grid-cols-2 gap-2">
                    {room.content.map((item, idx) => renderTile(item, idx))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* DESKTOP â CSS Grid with size-aware spans */
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
            {visibleRooms.map((r, i) => {
              const isActive = r.id === activeRoomId
              return (
                <div key={item.id} className={`${span} aspect-square relative overflow-hidden rounded-xl`}>
                  {item.type === 'image' ? (
                    isVideo ? (
                      <div
                        onClick={() => {
                          document.querySelectorAll('video').forEach(v => { v.muted = true })
                          if (unmutedId === String(item.id)) {
                            setUnmutedId(null)
                          } else {
                            const vid = document.querySelector(`video[data-id="${item.id}"]`) as HTMLVideoElement
                            if (vid) vid.muted = false
                            setUnmutedId(String(item.id))
                          }
                        }}
                        className="relative w-full h-full cursor-pointer"
                      >
                        <video
                          data-id={item.id}
                          src={item.url}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          ref={(node) => {
                            if (node) {
                              node.muted = true
                              const p = node.play()
                              if (p) p.catch(() => {})
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLElement).closest('.aspect-square')!.style.display = 'none' }}
                      />
                    )
                  ) : (
                    <div className="w-full h-full">
                      <ContentCard content={item} />
                    </div>
                  )}
                  {item.caption && (
                    <div className="absolute bottom-0 left-0 right-0 z-10">
                      <div className="bg-gradient-to-t from-black/60 to-transparent pt-6 pb-2 px-3">
                        <p className="text-[11px] text-white/80 leading-snug font-light tracking-wide line-clamp-2">
                          {item.caption}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {content.length === 0 && (
            <p className="text-center py-16 text-white/20">Nothing here yet.</p>
          )}
        </div>

        {/* Footer â whisper */}
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
