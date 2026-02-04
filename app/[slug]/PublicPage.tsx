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
  const [viewMode, setViewMode] = useState<'grid' | 'editorial'>('grid')

  // If no rooms, show all content
  const content = activeRoomId
    ? rooms.find(r => r.id === activeRoomId)?.content || []
    : allContent

  return (
    <div className="min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      {/* GRID MODE */}
      {viewMode === 'grid' ? (
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Header */}
          <header className="mb-8 text-center">
            {footprint.background_url && (
              <img
                src={footprint.background_url}
                alt=""
                className="w-20 h-20 rounded-full mx-auto mb-4 object-cover"
              />
            )}
            <h1 className="text-4xl font-light mb-2">
              {footprint.display_name || 'æ'}
            </h1>
            <span className="font-mono text-xs" style={{ color: theme.muted }}>
              #{serial}
            </span>
            {footprint.bio && (
              <p className="mt-4 text-sm max-w-md mx-auto" style={{ color: theme.muted }}>
                {footprint.bio}
              </p>
            )}
          </header>

          {/* Tabs / Rooms */}
          {rooms.length > 0 && (
            <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
              <button
                onClick={() => setActiveRoomId(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  activeRoomId === null
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent text-white/70 border-white/20 hover:border-white/40'
                }`}
              >
                all
              </button>
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoomId(room.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    activeRoomId === room.id
                      ? 'bg-white text-black border-white'
                      : 'bg-transparent text-white/70 border-white/20 hover:border-white/40'
                  }`}
                >
                  {room.name}
                </button>
              ))}
            </div>
          )}

          {/* Masonry Grid - Preview Build Style */}
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-2">
            {content.map((item: any) => (
              <div key={item.id} className="break-inside-avoid mb-2">
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
      ) : (
        // EDITORIAL MODE - Tumblr aesthetic
        <>
          {/* Fixed Masthead */}
          <div className="fixed top-8 left-8 z-50">
            <h1 className="text-4xl font-black tracking-tight" style={{ color: theme.text }}>
              {footprint.display_name || footprint.username}
            </h1>
          </div>

          {/* Single Column - Full Bleed */}
          <div className="max-w-4xl mx-auto">
            <div className="space-y-12 py-24">
              {content.map((item: any) => {
                const isLandscape = item.type === 'image' && !item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i)

                return (
                  <div key={item.id} className={isLandscape ? '' : 'px-4'}>
                    {item.type === 'image' ? (
                      item.url?.match(/\.(mp4|mov|webm|m4v)($|\?)/i) ? (
                        <div className="px-4">
                          <VideoTile src={item.url} />
                        </div>
                      ) : (
                        <img
                          src={item.url}
                          className="w-full object-cover"
                          alt=""
                          loading="lazy"
                        />
                      )
                    ) : (
                      <ContentCard content={item} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <footer className="px-4 pb-16 text-center">
              <Link
                href="/"
                className="inline-block px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm font-medium"
                style={{ color: theme.accent }}
              >
                GET YOURS
              </Link>
            </footer>
          </div>
        </>
      )}

      {/* Mode Toggle - Bottom Right */}
      <button
        onClick={() => setViewMode(viewMode === 'grid' ? 'editorial' : 'grid')}
        className="fixed bottom-8 right-8 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all"
        title={viewMode === 'grid' ? 'Editorial Mode' : 'Grid Mode'}
      >
        {viewMode === 'grid' ? '▤' : '▦'}
      </button>
    </div>
  )
}
