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

  // If no rooms, show all content
  const content = activeRoomId
    ? rooms.find(r => r.id === activeRoomId)?.content || []
    : allContent

  return (
    <div className="min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="mb-8 text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <h1 className="text-4xl font-light">æ</h1>
            <span className="font-mono text-xs" style={{ color: theme.muted }}>
              #{serial}
            </span>
          </div>
          {footprint.bio && (
            <p className="text-sm" style={{ color: theme.muted }}>
              {footprint.bio}
            </p>
          )}
        </header>

        {/* Tabs / Rooms */}
        {rooms.length > 0 && (
          <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
            <button
              onClick={() => setActiveRoomId(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeRoomId === null
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
              }`}
            >
              all
            </button>
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setActiveRoomId(room.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeRoomId === room.id
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                }`}
              >
                {room.name}
              </button>
            ))}
          </div>
        )}

        {/* Masonry Grid - Natural heights */}
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 max-w-6xl mx-auto">
          {content.map((item: any) => (
            <div key={item.id} className="break-inside-avoid mb-3">
              {item.type === 'image' ? (
                item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ? (
                  <VideoTile src={item.url} />
                ) : (
                  <img
                    src={item.url}
                    className="w-full object-cover rounded-2xl"
                    alt=""
                    loading="lazy"
                  />
                )
              ) : (
                <ContentCard content={item} />
              )}
            </div>
          ))}
        </div>

        {content.length === 0 && (
          <p className="text-center py-16" style={{ color: theme.muted }}>
            Nothing here yet.
          </p>
        )}

        {/* Footer - GET YOURS CTA */}
        <footer className="mt-16 pt-8 text-center">
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm font-medium"
            style={{ color: theme.accent }}
          >
            GET YOURS
          </Link>
          <p className="mt-4 text-xs font-mono" style={{ color: theme.muted }}>
            Footprint #{serial}
          </p>
        </footer>
      </div>
    </div>
  )
}
