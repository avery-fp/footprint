'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
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

// Wallpaper filter per room — derived from room index
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
  'rgba(0,0,0,0.58)',
  'rgba(0,0,0,0.55)',
  'rgba(0,0,0,0.68)',
  'rgba(0,0,0,0.62)',
  'rgba(0,0,0,0.52)',
  'rgba(0,0,0,0.72)',
]
const DEFAULT_OVERLAY = 'rgba(0,0,0,0.6)'

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string>(() => {
    const first = rooms.filter(r => r.name && r.name.length > 1).find(Boolean)
    return first?.id || ''
  })
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [showToast, setShowToast] = useState(false)

  // Filter out ghost tiles (empty URLs with no title/content)
  const isValidTile = (item: any) =>
    (item.type === 'thought' && item.title) || (item.url && item.url !== '')

  const validContent = allContent.filter(isValidTile)

  // Filter orphan rooms (empty names, single-char junk)
  const visibleRooms = rooms
    .filter(r => r.name && r.name.length > 1)
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

  return (
    <div className="min-h-screen bg-black" style={{ color: theme.colors.text }}>
      {/* Wallpaper zone — contained to masthead */}
      <div className="h-[50vh] relative overflow-hidden">
        {footprint.background_url && (
          <>
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
              }}
              onLoad={() => setWallpaperLoaded(true)}
            />
            <div
              className="absolute inset-0 transition-colors duration-800"
              style={{ backgroundColor: overlayColor }}
            />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black" />
        <WeatherEffect type={footprint.weather_effect || null} />

        {/* Masthead — centered in wallpaper zone */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
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
            style={{ textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)' }}
          >
            #{serial}
          </span>
          {(() => {
            const showBio = footprint.bio &&
              footprint.bio.trim().length > 0 &&
              !['personal internet', 'footprint', 'Personal Internet', 'Footprint'].includes(footprint.bio.trim())
            return showBio ? (
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
            ) : null
          })()}
          <a
            href="https://footprint.onl"
            className="mt-5 inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-white/25 hover:text-white/50 transition-all duration-700"
          >
            Own Your Footprint
            <span className="w-[3px] h-[3px] rounded-full bg-white/20" />
          </a>
        </div>
      </div>

      {/* Content zone — black bg, overlaps wallpaper fade */}
      <div className="bg-black -mt-20 relative z-10 pb-12">
        {/* Sticky room tabs */}
        {visibleRooms.length > 1 && (
          <div className="sticky top-0 z-30 bg-black/90 backdrop-blur-sm py-2 px-3 flex items-center justify-center gap-2 flex-wrap">
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

        {/* Tight magazine grid */}
        <div className="px-1 md:max-w-7xl md:mx-auto md:px-5 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-2" style={{ gridAutoFlow: 'dense' }}>
            {content.map((item, idx) => {
              const isVideo = item.type === 'image' && /\.(mp4|mov|webm|m4v)/i.test(item.url || '')
              const span = item.size === 2 ? 'col-span-2 row-span-2' : ''

              return (
                <div key={item.id} className={`${span} aspect-square relative overflow-hidden rounded-lg`}>
                  {item.type === 'image' ? (
                    isVideo ? (
                      <video
                        src={item.url}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image
                        src={item.url}
                        alt=""
                        fill
                        sizes={item.size === 2 ? '100vw' : '50vw'}
                        quality={60}
                        loading={idx < 4 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="object-cover"
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
