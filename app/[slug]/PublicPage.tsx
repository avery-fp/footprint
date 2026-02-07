'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ContentCard from '@/components/ContentCard'
import VideoTile from '@/components/VideoTile'
import WeatherEffect from '@/components/WeatherEffect'
import { transformImageUrl } from '@/lib/image'

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
  totalCount: number
}

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, totalCount }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [loadedContent, setLoadedContent] = useState(allContent)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const hasMore = !activeRoomId && loadedContent.length < totalCount

  const content = activeRoomId
    ? rooms.find(r => r.id === activeRoomId)?.content || []
    : loadedContent

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    setShowToast(true)
  }

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Infinite scroll — load next batch of tiles
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const res = await fetch(`/api/footprint/${footprint.username}?offset=${loadedContent.length}&limit=12`)
      const json = await res.json()
      if (json.tiles?.length) {
        setLoadedContent(prev => [...prev, ...json.tiles])
      }
    } catch (e) {
      console.error('Load more failed:', e)
    }
    setLoading(false)
  }, [loading, hasMore, loadedContent.length, footprint.username])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="min-h-screen relative" style={{ background: theme.colors.background, color: theme.colors.text }}>
      {/* Wallpaper layer — fixed full-viewport, img with object-cover */}
      {footprint.background_url && (
        <div className="fixed inset-0 z-0">
          <img
            src={footprint.background_url}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-700 ${wallpaperLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{
              filter: footprint.background_blur !== false ? 'blur(12px)' : 'none',
              transform: footprint.background_blur !== false ? 'scale(1.05)' : 'none',
            }}
            onLoad={() => setWallpaperLoaded(true)}
          />
          <div className="absolute inset-0 bg-black/60" />
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
            {footprint.bio && (
              <p
                className="mt-3 text-sm max-w-md text-center"
                style={{
                  fontFamily: '"Helvetica Neue", system-ui, sans-serif',
                  fontWeight: 300,
                  color: theme.colors.textMuted,
                  textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)',
                }}
              >
                {footprint.bio}
              </p>
            )}
            {/* Share button */}
            <button
              onClick={handleShare}
              className="mt-4 bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] text-white/40 rounded-full px-4 py-1.5 text-xs tracking-wider hover:bg-white/[0.1] transition-all duration-200"
            >
              share
            </button>
        </header>

        {/* Room Tabs */}
        {rooms.length > 0 && (
          <div className="flex items-center justify-center gap-2 mb-6 flex-wrap relative z-20 max-w-6xl mx-auto px-4 md:px-8">
            <button
              onClick={() => setActiveRoomId(null)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all backdrop-blur-sm border-0 ${
                activeRoomId === null
                  ? 'bg-white/[0.12] text-white/90'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.10] hover:text-white/70'
              }`}
            >
              all
            </button>
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setActiveRoomId(room.id)}
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
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="columns-2 md:columns-3 lg:columns-4" style={{ columnGap: '8px' }}>
            {content.map((item: any, index: number) => {
              const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

              return (
                <div
                  key={item.id}
                  className="break-inside-avoid mb-2 group tile-enter"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="group-hover:scale-[1.02] transition-transform duration-300 will-change-transform group-hover:shadow-lg group-hover:shadow-black/20 rounded-xl">
                    {item.type === 'image' ? (
                      isVideo ? (
                        <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                          <VideoTile src={item.url} />
                        </div>
                      ) : (
                        <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                          <img
                            src={transformImageUrl(item.url)}
                            className="w-full object-cover opacity-0 transition-opacity duration-[800ms]"
                            alt=""
                            loading="lazy"
                            onLoad={(e) => {
                              e.currentTarget.classList.remove('opacity-0')
                              e.currentTarget.classList.add('opacity-100')
                            }}
                          />
                        </div>
                      )
                    ) : (
                      <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                        <ContentCard content={item} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Infinite scroll sentinel */}
          {hasMore && <div ref={sentinelRef} className="h-8" />}
        </div>

        {content.length === 0 && (
          <p className="text-center py-16" style={{ color: theme.colors.textMuted }}>
            Nothing here yet.
          </p>
        )}

        {/* Footer — whisper */}
        <div className="mt-24 mb-12 text-center">
          <a href="https://footprint.onl" className="text-white/[0.08] text-xs tracking-[0.3em] hover:text-white/20 transition-colors">
            footprint.onl
          </a>
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
