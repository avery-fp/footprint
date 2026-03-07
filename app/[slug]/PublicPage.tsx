'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import Image from 'next/image'
import ContentCardBase from '@/components/ContentCard'
import VideoTileBase from '@/components/VideoTile'

const ContentCard = memo(ContentCardBase)
const VideoTile = memo(VideoTileBase)
import WeatherEffect from '@/components/WeatherEffect'
import { PlusButton } from '@/components/PlusButton'
import { RemoveBubble } from '@/components/RemoveBubble'
import { RolodexDrawer } from '@/components/RolodexDrawer'
import FloatingCtaBar from '@/components/FloatingCtaBar'

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
  isDraft?: boolean
}

const noop = () => {}

// Wallpaper filter per room
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

/**
 * TileImage — bulletproof image tile with error recovery.
 * Natural height — no object-cover, no fixed aspect ratios.
 */
function TileImage({ src, alt, index }: {
  src: string; alt: string; index: number
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="w-full h-auto"
        loading={index < 4 ? 'eager' : 'lazy'}
        decoding="async"
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={880}
      height={880}
      sizes="(max-width: 768px) 50vw, 25vw"
      className="w-full h-auto"
      loading={index < 4 ? 'eager' : 'lazy'}
      priority={index < 2}
      quality={75}
      fetchPriority={index === 0 ? 'high' : undefined}
      onError={() => setFailed(true)}
    />
  )
}

export default function PublicPage({ footprint, content: allContent, rooms, theme, serial, pageUrl, isDraft }: PublicPageProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  // Default to first room
  useEffect(() => {
    if (activeRoomId === null && rooms.length > 0) {
      const visible = rooms.filter(r => r.name && r.name.trim().length > 0)
      if (visible.length > 0) setActiveRoomId(visible[0].id)
    }
  }, [rooms])

  const [wallpaperLoaded, setWallpaperLoaded] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [roomFade, setRoomFade] = useState<'visible' | 'out' | 'in'>('visible')

  // Content filtering
  const validContent = useMemo(() =>
    allContent.filter(item =>
      (item.type === 'thought' && item.title) ||
      (item.url && item.url !== '')
    ), [allContent])

  const visibleRooms = useMemo(() =>
    rooms
      .filter(r => r.name && r.name.trim().length > 0)
      .map(r => ({
        ...r,
        content: r.content.filter((item: any) =>
          (item.type === 'thought' && item.title) ||
          (item.url && item.url !== '')
        )
      })), [rooms])

  const baseContent = activeRoomId
    ? visibleRooms.find(r => r.id === activeRoomId)?.content || []
    : validContent

  // No shuffle — show tiles in user-arranged order
  const content = baseContent

  // Wallpaper filter
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

  // Mobile detection (debounced)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setIsMobile(window.innerWidth < 768), 150)
    }
    setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => { window.removeEventListener('resize', check); clearTimeout(timeout) }
  }, [])

  // Check if user is logged in + owner
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(async r => {
        if (r.ok) {
          const data = await r.json()
          setIsLoggedIn(true)
          if (data.user?.id === footprint.user_id) {
            setIsOwner(true)
          }
        }
      })
      .catch(() => {})
  }, [footprint.user_id])

  // Navigate to room
  const goToRoom = useCallback((roomId: string | null) => {
    if (roomId === activeRoomId || roomFade !== 'visible') return
    setRoomFade('out')
    setTimeout(() => {
      setActiveRoomId(roomId)
      setRoomFade('in')
      setTimeout(() => setRoomFade('visible'), 300)
    }, 200)
  }, [activeRoomId, roomFade])

  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 2000)
    return () => clearTimeout(t)
  }, [showToast])

  // Tile renderer — inline media, no lightbox
  const renderTileContent = (item: any, index: number) => {
    if (item.type === 'thought') {
      const text = item.title || ''
      const len = text.length
      const fontSize = len <= 6 ? '24px' : len <= 20 ? '17px' : len <= 60 ? '14px' : '13px'
      const letterSpacing = len <= 6 ? '-0.03em' : len <= 20 ? '-0.02em' : '-0.01em'
      return (
        <div
          className="w-full flex items-center justify-center p-4"
          style={{
            background: 'rgba(255,255,255,0.04)',
            minHeight: '120px',
          }}
          data-tile-id={item.id}
          data-tile-type="thought"
        >
          <p
            className="whitespace-pre-wrap text-center text-white"
            style={{ fontSize, fontWeight: 300, letterSpacing, lineHeight: 1.5 }}
          >
            {text}
          </p>
        </div>
      )
    }

    if (item.type === 'video') {
      return (
        <div className="w-full" data-tile-id={item.id} data-tile-type="video">
          <VideoTile src={item.url} onWidescreen={noop} />
        </div>
      )
    }

    if (item.type === 'image') {
      return (
        <div className="w-full overflow-hidden" data-tile-id={item.id} data-tile-type={item.type}>
          <TileImage
            src={item.url}
            alt={item.title || ''}
            index={index}
          />
        </div>
      )
    }

    // YouTube, Spotify, SoundCloud, Vimeo, links — all handled by ContentCard inline
    return (
      <div className="w-full" data-tile-id={item.id} data-tile-type={item.type}>
        <ContentCard content={item} isMobile={isMobile} tileSize={1} aspect="auto" isPublicView />
      </div>
    )
  }

  // ═══════════════════════════════════════════
  // MASONRY LAYOUT — CSS Columns, natural heights
  // ═══════════════════════════════════════════
  const activeGrid = (
    <div
      className="columns-2 md:columns-4 gap-1"
      style={{
        opacity: roomFade === 'out' ? 0 : 1,
        transform: roomFade === 'out' ? 'translateY(6px)' : roomFade === 'in' ? 'translateY(-6px)' : 'translateY(0)',
        transition: 'opacity 250ms ease-out, transform 350ms ease-out',
      }}
    >
      {content.map((item: any, idx: number) => {
        // Click behavior: links open in new tab, everything else is inline
        const handleClick = () => {
          if (['image', 'thought', 'video', 'youtube', 'vimeo', 'soundcloud', 'spotify'].includes(item.type)) return
          if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
        }

        return (
          <div
            key={item.id}
            className="break-inside-avoid mb-1 overflow-hidden rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.06)',
            }}
            onClick={handleClick}
          >
            {renderTileContent(item, idx)}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-[100dvh] relative flex flex-col" style={{ background: theme.colors.background, color: theme.colors.text, '--fp-glass': theme.colors.glass, '--fp-text-muted': theme.colors.textMuted } as React.CSSProperties}>
      {/* Wallpaper layer — GPU composited for 60fps scroll */}
      {footprint.background_url && (
        <div className="fixed inset-0 z-0 fp-wallpaper-gpu">
          <Image
            src={footprint.background_url}
            alt=""
            fill
            priority
            quality={60}
            sizes="100vw"
            fetchPriority="high"
            className={`object-cover transition-opacity duration-700 ${wallpaperLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{
              filter: footprint.background_blur !== false ? wallpaperFilter : 'none',
              transition: 'filter 0.8s ease',
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

      {/* Draft banner */}
      {isDraft && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 bg-white/[0.06] backdrop-blur-sm border-b border-white/[0.08]">
          <span className="text-[11px] text-white/40 tracking-[0.15em] font-mono lowercase">draft</span>
        </div>
      )}

      {/* Top-right action */}
      <div className="fixed top-5 right-4 md:right-6 z-30 flex items-center gap-2">
        {isLoggedIn ? (
          <a
            href={`/${footprint.username}/home`}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition touch-manipulation"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </a>
        ) : (
          <PlusButton slug={footprint.slug} />
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Sky */}
        <div style={{ height: '80px' }} />

        {/* Masthead */}
        <RemoveBubble slug={footprint.slug}>
          <header className="pb-4 md:pb-5 flex flex-col items-center px-4">
            <h1
              className={`${
                (footprint.display_name || '\u00e6').length <= 6
                  ? 'text-4xl md:text-6xl tracking-[0.22em] font-normal'
                  : (footprint.display_name || '\u00e6').length <= 12
                  ? 'text-3xl md:text-5xl tracking-[0.14em] font-normal'
                  : 'text-2xl md:text-4xl tracking-[0.06em] font-light'
              }`}
              style={{
                color: theme.colors.text,
                opacity: 0.92,
                textShadow: footprint.background_url ? '0 2px 20px rgba(0,0,0,0.9)' : 'none',
              }}
            >
              {footprint.display_name || '\u00e6'}
            </h1>
          </header>
        </RemoveBubble>

        {/* Room nav */}
        {visibleRooms.length > 1 && (
          <div className="flex items-center justify-center mb-4 md:mb-6 px-4">
            <div className="flex items-center gap-0 font-mono overflow-x-auto hide-scrollbar">
              {visibleRooms.map((room, i) => (
                <span key={room.id} className="flex items-center whitespace-nowrap">
                  {i > 0 && <span className="mx-2.5" style={{ color: 'rgba(255,255,255,0.2)', fontSize: '8px' }}>·</span>}
                  <button
                    onClick={() => goToRoom(room.id)}
                    className="transition-all duration-300 touch-manipulation"
                    style={{
                      fontSize: '11px',
                      letterSpacing: '2.5px',
                      textTransform: 'lowercase',
                      fontWeight: activeRoomId === room.id ? 400 : 300,
                      color: activeRoomId === room.id ? 'white' : 'rgba(255,255,255,0.4)',
                      background: 'none',
                      border: 'none',
                      padding: '8px 2px',
                      margin: '-8px -2px',
                      cursor: 'pointer',
                    }}
                  >
                    {room.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* The Grid */}
        <div
          className="fp-grid-container mx-auto w-full"
          style={{ maxWidth: '880px' }}
        >
          <div className="fp-grid-arrive">
            {activeGrid}
          </div>
        </div>

        {content.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: theme.colors.textMuted }}>
            nothing here.
          </p>
        )}

        {/* Floor */}
        <div style={{ height: '120px' }} />

        {/* Footer */}
        <div className="py-10 flex items-center justify-center">
          <button
            onClick={handleShare}
            className="group p-3 text-white/[0.12] hover:text-white/40 transition-colors duration-500 touch-manipulation"
            aria-label="Share"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.25 8.81" />
            </svg>
          </button>
        </div>
      </div>

      {/* Rolodex drawer */}
      {isLoggedIn && (
        <>
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open saved footprints"
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-14 h-8 touch-manipulation"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <span className="block w-10 h-[3px] rounded-full bg-white/[0.10] hover:bg-white/[0.20] transition-all duration-300 hover:w-12" />
          </button>
          <RolodexDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

      {/* Serial number — fixed bottom-left, quiet scarcity signal */}
      {!isDraft && serial && (
        <div
          className="fixed bottom-4 left-4 z-20 select-none pointer-events-none"
          style={{
            color: 'rgba(255,255,255,0.15)',
            fontSize: '11px',
            fontWeight: 300,
            letterSpacing: '1px',
            fontFamily: 'monospace',
          }}
        >
          #{String(serial).padStart(4, '0')}
        </div>
      )}

      {/* Floating CTA bar */}
      {!isDraft && (
        <FloatingCtaBar />
      )}

      {/* Copied toast */}
      {showToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white/[0.08] backdrop-blur-sm rounded-md px-5 py-2 text-white/60 text-sm materialize">
          copied.
        </div>
      )}

    </div>
  )
}
