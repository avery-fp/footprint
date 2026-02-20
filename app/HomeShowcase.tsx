'use client'

import Link from 'next/link'

interface Room {
  slug: string
  name: string
  bio: string
  wallpaper: string | null
  serial: number
  tiles: string[]
}

const DM = "'DM Sans', sans-serif"

export default function HomeShowcase({ rooms }: { rooms: Room[] }) {
  return (
    <div className={`grid gap-6 ${
      rooms.length === 1 ? 'max-w-sm mx-auto' :
      rooms.length === 2 ? 'md:grid-cols-2 max-w-2xl' :
      'md:grid-cols-2 lg:grid-cols-3 max-w-5xl'
    }`}>
      {rooms.map((room) => (
        <Link
          key={room.slug}
          href={`/${room.slug}`}
          className="group block rounded-2xl overflow-hidden border border-white/[0.06] hover:border-white/[0.12] transition-all duration-500 bg-white/[0.02]"
        >
          {/* Tiles preview */}
          <div className="h-44 relative overflow-hidden">
            {room.wallpaper && (
              <img
                src={room.wallpaper}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm group-hover:opacity-40 transition-opacity duration-500"
              />
            )}
            <div className="relative h-full flex items-center justify-center gap-2 p-6">
              {room.tiles.length > 0 ? room.tiles.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="w-20 h-20 rounded-lg object-cover border border-white/[0.06] group-hover:scale-105 transition-transform duration-500"
                  style={{ transitionDelay: `${i * 50}ms` }}
                />
              )) : (
                <div className="text-white/8 text-5xl">◈</div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-white/70 text-sm" style={{ fontFamily: DM }}>
                {room.name}
              </p>
              <p className="text-white/15 text-[10px] font-mono">
                #{String(room.serial).padStart(4, '0')}
              </p>
            </div>
            {room.bio && (
              <p className="text-white/20 text-xs leading-relaxed" style={{ fontFamily: DM }}>
                {room.bio.length > 80 ? room.bio.slice(0, 80) + '...' : room.bio}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}
