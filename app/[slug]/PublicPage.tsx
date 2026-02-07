'use client'

import { useState } from 'react'
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

  return (
    <div className="min-h-screen relative" style={{ background: theme.colors.background, color: theme.colors.text }}>
      {/* Wallpaper layer — real blur via filter */}
      {footprint.background_url && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${footprint.background_url})`,
            filter: footprint.background_blur !== false ? 'blur(20px) brightness(0.7)' : 'none',
            transform: 'scale(1.1)',
          }}
        />
      )}
      <div className="max-w-7xl mx-auto px-2 pt-6 pb-12 relative z-10">
        {/* æ Masthead — glass-backed identity card */}
        <header className="mb-4 relative">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-md rounded-b-3xl" />
          <div className="relative z-10 flex flex-col items-center pt-8 pb-4">
            {footprint.background_url && (
              <img
                src={footprint.background_url}
                alt=""
                className="w-20 h-20 rounded-full mb-3 object-cover border border-white/[0.08]"
              />
            )}
            <h1
              className="text-7xl sm:text-8xl font-black tracking-tighter leading-none mb-1"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
            >
              {footprint.display_name || 'æ'}
            </h1>
            <span
              className="font-mono text-xs"
              style={{ color: theme.colors.textMuted, textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
            >
              #{serial}
            </span>
            {footprint.bio && (
              <p
                className="mt-2 text-sm max-w-md text-center"
                style={{ color: theme.colors.textMuted, textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}
              >
                {footprint.bio}
              </p>
            )}
          </div>
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

        {/* Footer — growth loop */}
        <div className="text-center py-12 opacity-40 hover:opacity-70 transition-opacity">
          <a href="https://footprint.onl" className="text-sm text-white/60 hover:text-white/90 transition">
            footprint.onl
          </a>
        </div>
      </div>
    </div>
  )
}
