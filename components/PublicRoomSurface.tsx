'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import UnifiedTile from '@/components/UnifiedTile'
import { getCollectionRenderRadius, shouldRenderCollectionTile } from '@/lib/collection-window'
import { getGridLayout, tileAspectRatio, type RoomLayout } from '@/lib/grid-layouts'
import { getGridClass, isVideoTile, resolveAspect } from '@/lib/media/aspect'
import { glassStyle } from '@/lib/glass'
import { transformImageUrl } from '@/lib/image'

interface Room {
  id: string
  name: string
  layout?: string
  content: any[]
  is_locked?: boolean
  has_passcode?: boolean
}

interface ExpandedContainer {
  id: string
  transform: string
}

interface PublicRoomSurfaceProps {
  content: any[]
  visibleRooms: Room[]
  activeRoomId: string | null
  onNavigateRoom: (roomId: string | null) => void
  roomLayout: RoomLayout
  roomFade: 'visible' | 'out' | 'in'
  roomNavDocked: boolean
  isMobile: boolean
  isSoundRoom: boolean
  isGrid: boolean
  containerMeta: Record<string, { childCount: number; firstThumb: string | null }>
  expanded: ExpandedContainer | null
  showOverlay: boolean
  collectionChildren: any[]
  loadingChildren: boolean
  expandedContainerLabel: string
  expand: (id: string) => void
  collapse: () => void
  registerRef: (id: string, el: HTMLDivElement | null) => void
  depthTouchStart: React.MutableRefObject<number>
}

export default function PublicRoomSurface({
  content,
  visibleRooms,
  activeRoomId,
  onNavigateRoom,
  roomLayout,
  roomFade,
  roomNavDocked,
  isMobile,
  isSoundRoom,
  isGrid,
  containerMeta,
  expanded,
  showOverlay,
  collectionChildren,
  loadingChildren,
  expandedContainerLabel,
  expand,
  collapse,
  registerRef,
  depthTouchStart,
}: PublicRoomSurfaceProps) {
  const collectionRailRef = useRef<HTMLDivElement | null>(null)
  const [collectionActiveIndex, setCollectionActiveIndex] = useState(0)
  const layoutConfig = getGridLayout(roomLayout)
  const isHorizontal = roomLayout === 'horizontal'

  useEffect(() => {
    setCollectionActiveIndex(0)
  }, [expanded?.id, collectionChildren.length])

  const syncCollectionActiveIndex = useCallback(() => {
    const rail = collectionRailRef.current
    if (!rail) return
    const tiles = Array.from(rail.querySelectorAll<HTMLElement>('[data-collection-child-id]'))
    if (tiles.length === 0) return
    const railRect = rail.getBoundingClientRect()
    const railCenter = railRect.left + railRect.width / 2
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < tiles.length; index += 1) {
      const rect = tiles[index].getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const distance = Math.abs(center - railCenter)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }
    setCollectionActiveIndex((prev) => (prev === bestIndex ? prev : bestIndex))
  }, [])

  useEffect(() => {
    if (!expanded) return
    const rail = collectionRailRef.current
    if (!rail) return
    let rafId = 0
    const sync = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncCollectionActiveIndex)
    }
    sync()
    rail.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      rail.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [expanded, collectionChildren, syncCollectionActiveIndex])

  const fadeStyle = {
    opacity: roomFade === 'out' ? 0 : 1,
    transform: roomFade === 'out' ? 'translateY(6px)' : roomFade === 'in' ? 'translateY(-6px)' : 'translateY(0)',
    transition: 'opacity 250ms ease-out, transform 350ms ease-out',
  }

  const tileAspectCss = (item: any): string => {
    const isMusic = item.type === 'spotify' || item.type === 'apple_music'
    if (isMusic) {
      return item.aspect === 'square' ? '1 / 1' : '9 / 2'
    }

    if (item.aspect === 'square' || item.aspect === 'wide' || item.aspect === 'tall' || item.aspect === 'portrait') {
      return tileAspectRatio(item.aspect)
    }
    const resolved = resolveAspect(item.aspect, item.type, item.url)
    if (resolved === 'square' || resolved === 'wide' || resolved === 'tall' || resolved === 'portrait') {
      return tileAspectRatio(resolved)
    }
    const isEmbedVid = item.type === 'youtube' || item.type === 'vimeo' ||
      item.url?.includes('youtube') || item.url?.includes('youtu.be')
    if (isEmbedVid) return '16 / 9'
    if (item.type === 'soundcloud') return '16 / 9'
    return tileAspectRatio(resolved)
  }

  const getDepthStyle = (tileId: string): React.CSSProperties => {
    if (!expanded) return { transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease' }
    if (expanded.id === tileId) return {
      transform: expanded.transform,
      zIndex: 50,
      transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
      willChange: 'transform',
    }
    return {
      opacity: 0.1,
      transform: 'scale(0.97)',
      transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
      pointerEvents: 'none' as const,
    }
  }

  const renderTileBody = (item: any, idx: number) => {
    const isContainer = item.type === 'container'
    const isThisExpanded = expanded?.id === item.id
    return (
      <div
        ref={(el: HTMLDivElement | null) => registerRef(item.id, el)}
        className="w-full h-full relative"
        style={getDepthStyle(item.id)}
      >
        <div
          className={`relative w-full max-w-full h-full overflow-hidden fp-tile-hover rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
          style={{ background: 'transparent', border: '1px solid transparent' }}
        >
          <UnifiedTile
            item={item}
            index={idx}
            size={item.size || 1}
            aspect={resolveAspect(item.aspect, item.type, item.url)}
            mode="public"
            layout={roomLayout}
            isMobile={isMobile}
            isSoundRoom={isSoundRoom}
            isExpanded={isThisExpanded}
            childCount={containerMeta[item.id]?.childCount}
            firstChildThumb={containerMeta[item.id]?.firstThumb}
          />
        </div>
        {isContainer && !expanded && (
          <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => expand(item.id)} />
        )}
      </div>
    )
  }

  const renderMasonryTile = (item: any, idx: number) => {
    const resolved = resolveAspect(item.aspect, item.type, item.url)
    const gridClass = getGridClass(Number(item.size || 1), resolved, isVideoTile(item.type, item.url), item.type)
    const fitClass =
      ((item.type === 'spotify' || item.type === 'apple_music') && resolved === 'wide')
        ? ' self-start'
        : ''
    return (
      <div key={item.id} className={`relative overflow-hidden rounded-2xl ${gridClass}${fitClass}`}>
        {renderTileBody(item, idx)}
      </div>
    )
  }

  const renderCollectionTileBody = (child: any, idx: number) => (
    <div className="w-full h-full relative">
      <div
        className={`relative w-full max-w-full h-full overflow-hidden fp-tile-hover rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
        style={{ background: 'transparent', border: '1px solid transparent' }}
      >
        <UnifiedTile
          item={{
            id: child.id,
            url: child.url,
            type: child.type,
            title: child.title || null,
            description: child.description || null,
            thumbnail_url: child.thumbnail_url || null,
            embed_html: child.embed_html || null,
            render_mode: child.render_mode,
            artist: child.artist,
            thumbnail_url_hq: child.thumbnail_url_hq,
            thumbnail_url_override: child.thumbnail_url_override,
            media_id: child.media_id,
          }}
          index={idx}
          size={child.size || 1}
          aspect={resolveAspect(child.aspect, child.type, child.url)}
          mode="public"
          layout="horizontal"
          isMobile={isMobile}
          isSoundRoom={isSoundRoom}
        />
      </div>
    </div>
  )

  const renderCollectionTilePlaceholder = (child: any) => {
    const previewUrl = transformImageUrl(
      child.thumbnail_url_override ||
      child.thumbnail_url_hq ||
      child.thumbnail_url ||
      child.poster_url ||
      null
    )

    return (
      <div className="w-full h-full relative">
        <div
          className={`relative w-full max-w-full h-full overflow-hidden rounded-2xl${isSoundRoom ? ' fp-sound-tile' : ''}`}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'blur(14px)', opacity: 0.32, transform: 'scale(1.04)' }}
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.22) 100%)' }}
          />
        </div>
      </div>
    )
  }

  const renderHorizontalTiles = (
    items: any[],
    renderBody: (item: any, idx: number) => React.ReactNode,
    includeFade = true,
    fitMobileViewport = false,
  ) => {
    const notifyCollectionScroll = () => {
      if (!fitMobileViewport) return
      window.dispatchEvent(new Event('fp:collection-scroll-start'))
    }
    const collectionRenderRadius = getCollectionRenderRadius(isMobile)
    return (
      <div
        ref={fitMobileViewport ? collectionRailRef : undefined}
        className={getGridLayout('horizontal').containerClass}
        style={{
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          WebkitOverflowScrolling: 'touch' as any,
          touchAction: fitMobileViewport ? 'pan-x' : undefined,
          overscrollBehaviorX: fitMobileViewport ? 'contain' : undefined,
          overscrollBehaviorY: fitMobileViewport ? 'none' : undefined,
          paddingLeft: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          paddingRight: 'max(24px, calc((100vw - min(88vw, 620px)) / 2))',
          ...(includeFade ? fadeStyle : {}),
        }}
        onTouchMove={notifyCollectionScroll}
        onScroll={notifyCollectionScroll}
      >
        {items.map((item: any, idx: number) => {
          const aspectCss = tileAspectCss(item)
          const size = Number(item.size || 1)
          const railHeight = size >= 3
            ? (isMobile ? 'min(78vh, 600px)' : 'min(76vh, 700px)')
            : size <= 1
              ? (isMobile ? 'min(58vh, 420px)' : 'min(54vh, 500px)')
              : (isMobile ? 'min(72vh, 540px)' : 'min(70vh, 640px)')
          const [aspectWidth, aspectHeight] = aspectCss.split('/').map(part => Number(part.trim()))
          const aspectRatioValue = Number.isFinite(aspectWidth) && Number.isFinite(aspectHeight) && aspectHeight > 0
            ? aspectWidth / aspectHeight
            : 1
          const viewportFitHeight = `calc(${100 / aspectRatioValue}vw - ${32 / aspectRatioValue}px)`
          const wrapperStyle: React.CSSProperties = {
            height: railHeight,
            aspectRatio: aspectCss,
            ...(fitMobileViewport && isMobile ? {
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: `min(${railHeight}, ${viewportFitHeight})`,
            } : {}),
          }
          const shouldMountTile = fitMobileViewport
            ? shouldRenderCollectionTile(idx, items.length, collectionActiveIndex, collectionRenderRadius)
            : true
          return (
            <div
              key={item.id}
              className={getGridLayout('horizontal').tileClass}
              style={wrapperStyle}
              data-collection-child-id={fitMobileViewport ? item.id : undefined}
            >
              {shouldMountTile ? renderBody(item, idx) : renderCollectionTilePlaceholder(item)}
            </div>
          )
        })}
      </div>
    )
  }

  const gridInner = isHorizontal ? (
    renderHorizontalTiles(content, renderTileBody, true, false)
  ) : (
    <div className={layoutConfig.containerClass} style={{ ...fadeStyle, gridAutoFlow: 'dense', gridAutoRows: 'auto' }}>
      {content.map((item: any, idx: number) => renderMasonryTile(item, idx))}
    </div>
  )

  return (
    <>
      {(visibleRooms.length > 1) && (
        <div className="relative mb-4 h-12 md:mb-6">
          <div
            className={`${roomNavDocked ? 'fixed inset-x-0' : 'absolute inset-x-0'} z-30 flex items-center justify-center px-4 py-2 transition-[top] duration-300`}
            style={{ top: roomNavDocked ? 'calc(env(safe-area-inset-top, 0px) + 60px)' : 0 }}
          >
            <div className="flex max-w-full items-center gap-3 overflow-x-auto hide-scrollbar px-1 font-mono" data-no-wp-press>
              {visibleRooms.map((room) => {
                const isActive = activeRoomId === room.id
                return (
                  <div key={room.id} className="relative flex items-center">
                    <button
                      onClick={() => onNavigateRoom(room.id)}
                      className="transition-all duration-300 touch-manipulation flex items-center gap-1"
                      style={{
                        fontSize: '11px',
                        letterSpacing: '2.5px',
                        textTransform: 'lowercase',
                        fontWeight: isActive ? 400 : 300,
                        color: isActive ? 'white' : 'rgba(255,255,255,0.4)',
                        textShadow: '0 1px 8px rgba(0,0,0,0.5)',
                        background: 'none',
                        border: 'none',
                        padding: '8px 2px',
                        margin: '-8px -2px',
                        cursor: 'pointer',
                      }}
                    >
                      {room.name}
                      {room.is_locked && (
                        <svg width="9" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="locked" style={{ opacity: 0.55 }}>
                          <rect x="5" y="11" width="14" height="10" rx="1.5" />
                          <path d="M8 11V7a4 4 0 018 0v4" />
                        </svg>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div
        className={`fp-grid-arrive ${isHorizontal ? 'w-full' : `fp-grid-container mx-auto w-full ${isGrid ? 'fp-puzzle-frame' : ''}`}`}
        style={isHorizontal ? undefined : { maxWidth: isGrid ? '900px' : '880px' }}
      >
        {gridInner}
      </div>

      <div style={{ height: 96 }} aria-hidden="true" />

      {showOverlay && (
        <>
          <div
            className="fixed inset-0 z-[80]"
            style={{
              backgroundColor: 'rgba(3, 3, 3, 0.96)',
              opacity: expanded ? 1 : 0,
              transition: 'opacity 0.4s ease',
              willChange: 'opacity',
              touchAction: 'none',
            }}
            onClick={collapse}
            onTouchStart={(e) => { depthTouchStart.current = e.touches[0].clientY }}
            onTouchEnd={(e) => { if (e.changedTouches[0].clientY - depthTouchStart.current > 60) collapse() }}
          />
          {expanded && (
            <div
              className="fixed inset-0 z-[90] flex flex-col pointer-events-none"
              style={{
                opacity: loadingChildren ? 0 : 1,
                transition: 'opacity 0.3s ease 0.3s',
                background: 'rgba(3,3,3,0.98)',
                touchAction: 'pan-x',
                overscrollBehavior: 'contain',
              }}
            >
              <div
                className="pointer-events-auto flex items-center justify-between px-5 flex-shrink-0 relative z-[2]"
                style={{
                  height: '52px',
                  ...glassStyle,
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 0,
                }}
              >
                <span
                  className="font-mono text-white/50 tracking-[0.15em] uppercase truncate"
                  style={{ fontSize: '11px', fontWeight: 400 }}
                >
                  {expandedContainerLabel}
                </span>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-all touch-manipulation flex-shrink-0 ml-3 hover:bg-white/[0.08] hover:border-white/[0.12]"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onClick={collapse}
                  aria-label="Close container"
                >
                  <svg className="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div
                className="flex-1 flex items-center pointer-events-auto overflow-hidden relative z-[1]"
                style={{ padding: '12px 0', overscrollBehavior: 'contain' }}
              >
                {collectionChildren.length > 0 ? (
                  renderHorizontalTiles(collectionChildren, renderCollectionTileBody, false, true)
                ) : !loadingChildren ? (
                  <div className="flex items-center justify-center w-full py-12">
                    <span className="text-white/20 font-mono text-xs tracking-widest uppercase">empty</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
