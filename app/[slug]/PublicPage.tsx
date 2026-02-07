'use client'

import { useState } from 'react'
import Link from 'next/link'
import ContentCard from '@/components/ContentCard'
import VideoTile from '@/components/VideoTile'

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

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  const content = activeRoomId
    ? rooms.find(r => r.id === activeRoomId)?.content || []
    : allContent

  // Background: wallpaper takes priority, then theme
  const backgroundStyle = footprint.background_url
    ? {
        backgroundImage: footprint.background_blur !== false
          ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${footprint.background_url})`
          : `url(${footprint.background_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed' as const,
        color: theme.colors.text,
      }
    : {
        background: theme.colors.background,
        color: theme.colors.text,
      }

  return (
    <div className="min-h-screen" style={backgroundStyle}>
      <div className="max-w-7xl mx-auto px-2 pt-6 pb-12">
        {/* æ Masthead */}
        <header className="mb-4 text-center">
          {footprint.background_url && (
            <img
              src={footprint.background_url}
              alt=""
              className="w-20 h-20 rounded-full mx-auto mb-3 object-cover border border-white/[0.08]"
            />
          )}
          <h1 className="text-7xl sm:text-8xl font-black tracking-tighter leading-none mb-1">
            {footprint.display_name || 'æ'}
          </h1>
          <span className="font-mono text-xs" style={{ color: theme.colors.textMuted }}>
            #{serial}
          </span>
          {footprint.bio && (
            <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: theme.colors.textMuted }}>
              {footprint.bio}
            </p>
          )}
        </header>

        {/* Room Tabs */}
        {rooms.length > 0 && (
          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setActiveRoomId(null)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                activeRoomId === null
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent border-white/20 hover:border-white/40'
              }`}
              style={activeRoomId !== null ? { color: theme.colors.textMuted } : undefined}
            >
              all
            </button>
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setActiveRoomId(room.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  activeRoomId === room.id
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent border-white/20 hover:border-white/40'
                }`}
                style={activeRoomId !== room.id ? { color: theme.colors.textMuted } : undefined}
              >
                {room.name}
              </button>
            ))}
          </div>
        )}

        {/* CSS Columns Masonry */}
        <div className="columns-2 md:columns-3 xl:columns-4" style={{ columnGap: '4px' }}>
          {content.map((item: any) => {
            const isVideo = item.type === 'image' && item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

            return (
              <div key={item.id} className="break-inside-avoid mb-1">
                {item.type === 'image' ? (
                  isVideo ? (
                    <VideoTile src={item.url} />
                  ) : (
                    <div className="rounded-xl overflow-hidden">
                      <img
                        src={item.url}
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
                  <ContentCard content={item} />
                )}
              </div>
            )
          })}
        </div>

        {content.length === 0 && (
          <p className="text-center py-16" style={{ color: theme.colors.textMuted }}>
            Nothing here yet.
          </p>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 text-center">
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm font-medium"
            style={{ color: theme.colors.accent }}
          >
            GET YOURS
          </Link>
          <p className="mt-3 text-xs font-mono" style={{ color: theme.colors.textMuted }}>
            Footprint #{serial}
          </p>
        </footer>
      </div>
    </div>
  )
}
